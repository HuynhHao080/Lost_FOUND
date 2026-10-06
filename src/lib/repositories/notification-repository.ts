import "server-only";
import { dynamoDb, REPORTS_TABLE } from "@/lib/aws/dynamodb";
import { PutCommand, QueryCommand, QueryCommandInput, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Notification entity, stored in the same single table as reports.
 *
 * Key design (reuses the existing table and GSI1 — no schema change):
 *   PK      = USER#<userId>          ← user-scoped partition
 *   SK      = NOTIF#<id>
 *   GSI1PK  = USER#<userId>
 *   GSI1SK  = NOTIF#<createdAt>#<id> ← chronological listing via existing GSI
 *
 * Because notifications share the USER# GSI1 partition with reports, both
 * queries carry an `entity` discriminator filter: getUserNotifications filters
 * for entity = NOTIFICATION, and getReportsByUser excludes it. Report items
 * have no `entity` attribute, so they are unaffected by their filter.
 */
export type NotificationType = "MATCH_CONFIRMED" | "MATCH_RESET" | "REPORT_RESOLVED" | "IMAGE_UPLOADED";

export interface Notification {
  id: string;
  userId: string;
  entity: "NOTIFICATION";
  type: NotificationType;
  title: string;
  message: string;
  /** The viewer's own report involved in the event. */
  reportId: string;
  /** The counterpart report involved in the event. */
  relatedReportId?: string;
  createdAt: string;
  readAt?: string;
}

/** Public-safe notification shape returned by APIs. */
export interface SafeNotification {
  id: string;
  type: Notification["type"];
  title: string;
  message: string;
  reportId: string;
  relatedReportId?: string;
  createdAt: string;
  readAt?: string;
}

export function toSafeNotification(n: Notification): SafeNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    reportId: n.reportId,
    relatedReportId: n.relatedReportId,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

/**
 * Builds a deterministic notification id for an event.
 * Same event + same pair → same id → duplicate writes are impossible.
 *
 * Format: <type>#<sortedReportIds>#<eventDate>
 */
export function deterministicId(
  type: NotificationType,
  reportA: string,
  reportB: string | undefined,
  eventDate: string,
): string {
  const [a, b] = [reportA, reportB ?? ""].sort();
  return `${type}#${a}#${b}#${eventDate}`;
}

interface CreateNotificationInput {
  userId: string;
  type: Notification["type"];
  title: string;
  message: string;
  reportId: string;
  relatedReportId?: string;
  /** ISO timestamp of the lifecycle event (groups retries together). */
  eventDate: string;
}

/**
 * Creates a notification if it does not already exist.
 *
 * Idempotency: the id is derived deterministically from the event, and the
 * Put uses a conditional expression on PK so a retried request cannot create
 * a duplicate. ConditionalCheckFailed is swallowed silently.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const id = deterministicId(input.type, input.reportId, input.relatedReportId, input.eventDate);

  try {
    await dynamoDb.send(
      new PutCommand({
        TableName: REPORTS_TABLE,
        Item: {
          ...input,
          id,
          entity: "NOTIFICATION",
          PK: `USER#${input.userId}`,
          SK: `NOTIF#${id}`,
          GSI1PK: `USER#${input.userId}`,
          GSI1SK: `NOTIF#${input.eventDate}#${id}`,
          createdAt: new Date().toISOString(),
        },
        // Idempotency guard: identical notification already exists → no-op
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      return; // already created — retry is a no-op
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 30;

/**
 * Lists a user's notifications, newest first.
 * Paginated via ExclusiveStartKey — never an unbounded Scan.
 */
export async function getUserNotifications(
  userId: string,
  limit: number = DEFAULT_LIMIT,
  lastEvaluatedKey?: Record<string, unknown>,
): Promise<{ notifications: Notification[]; lastKey?: Record<string, unknown> }> {
  const params: QueryCommandInput = {
    TableName: REPORTS_TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :user",
    FilterExpression: "#entity = :notif",
    ExpressionAttributeNames: { "#entity": "entity" },
    ExpressionAttributeValues: { ":user": `USER#${userId}`, ":notif": "NOTIFICATION" },
    ScanIndexForward: false,
    Limit: limit,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await dynamoDb.send(new QueryCommand(params));

  return {
    notifications: (result.Items ?? []) as Notification[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Read state                                                          */
/* ------------------------------------------------------------------ */

/**
 * Marks one notification as read. Ownership is enforced by the key design:
 * the item lives under USER#<owner>, so another user's id simply won't match.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const id = decodeNotificationId(notificationId);
  if (!id) return false;

  try {
    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: REPORTS_TABLE,
        Key: { PK: `USER#${userId}`, SK: `NOTIF#${id}` },
        UpdateExpression: "SET readAt = :now",
        // attribute_not_exists(readAt) makes repeat calls idempotent-safe:
        // an already-read notification fails here and maps to 404 upstream.
        ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(readAt)",
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      }),
    );
    return result.$metadata.httpStatusCode === 200;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      return false; // not found, or already read — route maps this to 404
    }
    throw err;
  }
}

/**
 * Marks all unread notifications as read for a user.
 * Returns how many were updated.
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  let updated = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { notifications, lastKey: next } = await getUserNotifications(userId, 50, lastKey);
    lastKey = next;

    for (const n of notifications) {
      if (n.readAt) continue;
      await markNotificationRead(userId, n.id);
      updated++;
    }
  } while (lastKey);

  return updated;
}

/**
 * Extracts the raw id portion for key construction.
 * Accepts both the bare id (as returned by the API) and a legacy
 * "NOTIF#<id>" form, since "#" separators must not appear in URLs unencoded.
 */
function decodeNotificationId(raw: string): string | null {
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  return value.startsWith("NOTIF#") ? value.slice("NOTIF#".length) : value;
}

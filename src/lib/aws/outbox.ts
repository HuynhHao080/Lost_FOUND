import "server-only";
import { dynamoDb, REPORTS_TABLE } from "@/lib/aws/dynamodb";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export type OutboxEventType = "MATCH_CONFIRMED" | "MATCH_RESET" | "REPORT_RESOLVED" | "IMAGE_UPLOADED";

export interface OutboxEvent {
  id: string;
  eventType: OutboxEventType;
  reportId: string;
  relatedReportId?: string;
  imageKey?: string;
  userId?: string;
  occurredAt: string;
  status: "PENDING" | "PUBLISHED";
  createdAt: string;
}

/**
 * Write a lifecycle event to the outbox atomically with the report
 * transaction (via TransactWriteItems in the caller). The outbox item
 * uses the same table with PK = OUTBOX#<id> so it can be queried
 * independently by the worker.
 */
export async function putOutboxEvent(
  event: Omit<OutboxEvent, "createdAt">,
): Promise<void> {
  const now = new Date().toISOString();
  await dynamoDb.send(
    new PutCommand({
      TableName: REPORTS_TABLE,
      Item: {
        ...event,
        PK: `OUTBOX#${event.id}`,
        SK: `OUTBOX#${event.occurredAt}#${event.id}`,
        GSI1PK: `OUTBOX#${event.eventType}`,
        GSI1SK: `OUTBOX#${event.occurredAt}#${event.id}`,
        entity: "OUTBOX",
        createdAt: now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    }),
  );
}

/**
 * Read pending outbox events for the worker (paginated, bounded).
 * When eventType is omitted, events of all types are returned merged
 * newest-first (bounded per-type query to keep cost predictable).
 */
export async function getPendingOutboxEvents(
  limit: number = 10,
  lastEvaluatedKey?: Record<string, unknown>,
  eventType?: OutboxEventType,
): Promise<{ events: OutboxEvent[]; lastKey?: Record<string, unknown> }> {
  const types: OutboxEventType[] = eventType
    ? [eventType]
    : ["MATCH_CONFIRMED", "MATCH_RESET", "REPORT_RESOLVED", "IMAGE_UPLOADED"];

  const perType = Math.max(1, Math.ceil(limit / types.length));
  const merged: OutboxEvent[] = [];
  let lastKey: Record<string, unknown> | undefined;

  for (const t of types) {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: REPORTS_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :type",
        FilterExpression: "#entity = :outbox AND #status = :pending",
        ExpressionAttributeNames: { "#entity": "entity", "#status": "status" },
        ExpressionAttributeValues: {
          ":type": `OUTBOX#${t}`,
          ":outbox": "OUTBOX",
          ":pending": "PENDING",
        },
        ScanIndexForward: false,
        Limit: perType,
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      }),
    );
    merged.push(...((result.Items ?? []) as OutboxEvent[]));
    // Keep the last non-empty page key so callers can continue paging.
    if (result.LastEvaluatedKey) {
      lastKey = result.LastEvaluatedKey as Record<string, unknown>;
    }
  }

  merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return {
    events: merged.slice(0, limit),
    lastKey,
  };
}

/**
 * Mark an outbox event as published after EventBridge succeeds.
 * The full SK (which embeds occurredAt) is required because the SK is
 * `OUTBOX#<occurredAt>#<id>` — a fresh timestamp would address a
 * non-existent item.
 */
export async function markOutboxPublished(id: string, occurredAt: string): Promise<void> {
  await dynamoDb.send(
    new UpdateCommand({
      TableName: REPORTS_TABLE,
      Key: { PK: `OUTBOX#${id}`, SK: `OUTBOX#${occurredAt}#${id}` },
      UpdateExpression: "SET #status = :published, updatedAt = :now",
      ConditionExpression: "#status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":published": "PUBLISHED",
        ":pending": "PENDING",
        ":now": new Date().toISOString(),
      },
    }),
  );
}

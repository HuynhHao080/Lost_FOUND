/**
 * Notification Worker (Lambda-compatible, minimal dependencies).
 *
 * Reads pending outbox events from DynamoDB, performs Rekognition
 * analysis when the event is IMAGE_UPLOADED, writes notifications
 * for lifecycle events, and marks events as published.
 *
 * This version has no "server-only" imports and uses only AWS SDK v3.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const REGION = process.env.AWS_REGION || "us-east-1";
const REPORTS_TABLE = process.env.DYNAMODB_REPORTS_TABLE || "LostFound-Reports";
const REPORTS_BUCKET = process.env.S3_REPORTS_BUCKET || "lostfound-reports-629380420098";
const EVENTBRIDGE_BUS = process.env.EVENTBRIDGE_BUS_NAME || "lost-found-bus";

const MAX_BATCH = 10;

const dynamoClient = new DynamoDBClient({ region: REGION });
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const rekognition = new RekognitionClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const eventBridge = new EventBridgeClient({ region: REGION });

const OUTBOX_TYPES = ["MATCH_CONFIRMED", "MATCH_RESET", "REPORT_RESOLVED", "IMAGE_UPLOADED"];

async function getPendingOutboxEvents(limit = MAX_BATCH) {
  const types = OUTBOX_TYPES;
  const perType = Math.max(1, Math.ceil(MAX_BATCH / types.length));
  const merged = [];
  let lastKey;

  for (const t of types) {
    const result = await dynamoDb.send(new QueryCommand({
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
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    merged.push(...((result.Items ?? []) as any[]));
    if (result.LastEvaluatedKey) {
      lastKey = result.LastEvaluatedKey;
    }
  }

  merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
  return { events: merged.slice(0, limit), lastKey };
}

async function getReportById(reportId) {
  const result = await dynamoDb.send(new QueryCommand({
    TableName: REPORTS_TABLE,
    KeyConditionExpression: "PK = :pk AND SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `REPORT#${reportId}`,
      ":sk": `REPORT#${reportId}`,
    },
  }));
  return (result.Items?.[0] as any) ?? null;
}

async function analyzeImage(bucket, key) {
  try {
    const detectLabels = await rekognition.send(new DetectLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MaxLabels: 10,
      MinConfidence: 50,
    }));

    const moderation = await rekognition.send(new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MinConfidence: 50,
    }));

    const labels = detectLabels.Labels?.map((l) => l.Name).filter((n): n is string => Boolean(n)) || [];
    const moderationLabels = moderation.ModerationLabels?.map((m) => m.Name).filter((n): n is string => Boolean(n)) || [];

    return { labels, moderationLabels };
  } catch (err) {
    console.error("[rekognition] Analysis failed:", err);
    return null;
  }
}

async function updateImageAnalysis(reportId, labels, moderationLabels) {
  const now = new Date().toISOString();
  await dynamoDb.send(new UpdateCommand({
    TableName: REPORTS_TABLE,
    Key: { PK: `REPORT#${reportId}`, SK: `REPORT#${reportId}` },
    UpdateExpression: "SET imageLabels = :labels, moderationLabels = :mod, imageAnalysisStatus = :status, updatedAt = :now",
    ConditionExpression: "attribute_exists(PK)",
    ExpressionAttributeValues: {
      ":labels": labels,
      ":mod": moderationLabels ?? [],
      ":status": labels.length > 0 || (moderationLabels?.length ?? 0) > 0 ? "COMPLETED" : "NO_LABELS",
      ":now": now,
    },
  }));
}

async function createNotification(input) {
  const id = `${input.type}#${input.reportId}#${input.relatedReportId ?? ""}#${input.eventDate}`;
  try {
    await dynamoDb.send(new PutCommand({
      TableName: "LostFound-Reports",
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
      ConditionExpression: "attribute_not_exists(PK)",
    }));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return; // already created
    }
    throw err;
  }
}

async function markOutboxPublished(id, occurredAt) {
  await dynamoDb.send(new UpdateCommand({
    TableName: "LostFound-Reports",
    Key: { PK: `OUTBOX#${id}`, SK: `OUTBOX#${occurredAt}#${id}` },
    UpdateExpression: "SET #status = :published, updatedAt = :now",
    ConditionExpression: "#status = :pending",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":published": "PUBLISHED",
      ":pending": "PENDING",
      ":now": new Date().toISOString(),
    },
  }));
}

async function processBatch() {
  const { events, lastKey } = await getPendingOutboxEvents(MAX_BATCH);

  for (const event of events) {
    try {
      if (event.eventType === "IMAGE_UPLOADED") {
        const report = await getReportById(event.reportId);
        const imageKey = event.imageKey ?? report?.imageKey;
        if (report && imageKey && report.userId) {
          const analysis = await analyzeImage(REPORTS_BUCKET, imageKey);
          if (analysis) {
            await updateImageAnalysis(report.id, analysis.labels, analysis.moderationLabels);
          }
        }
      }

      if (
        event.eventType === "MATCH_CONFIRMED" ||
        event.eventType === "MATCH_RESET" ||
        event.eventType === "REPORT_RESOLVED"
      ) {
        const report = await getReportById(event.reportId);
        const userId = report?.userId ?? event.userId;
        if (userId) {
          await createNotification({
            userId,
            type: event.eventType,
            title:
              event.eventType === "MATCH_CONFIRMED"
                ? "Match confirmed"
                : event.eventType === "MATCH_RESET"
                  ? "Match reset"
                  : "Report resolved",
            message: `Event: ${event.eventType}`,
            reportId: event.reportId,
            relatedReportId: event.relatedReportId,
            eventDate: event.occurredAt.slice(0, 10),
          });
        }
      }

      await markOutboxPublished(event.id, event.occurredAt);
    } catch (err) {
      console.error(`[worker] Failed to process outbox event ${event.id}:`, {
        name: (err as { name?: string })?.name,
        message: (err as { message?: string })?.message,
      });
    }
  }

  if (lastKey) {
    console.log("[worker] More outbox events available; run again.");
  }
  return { processed: events.length, hasMore: Boolean(lastKey) };
}

export const handler = async (): Promise<void> => {
  await processBatch();
};
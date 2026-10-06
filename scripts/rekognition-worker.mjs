/**
 * Rekognition Image Analysis Worker
 *
 * Reads IMAGE_UPLOADED outbox events from DynamoDB, performs Amazon
 * Rekognition analysis on the S3 object, and writes imageLabels /
 * moderationLabels back to the report item.
 *
 * Designed to run as a Lambda or EC2 process. For local demo, run:
 *   node scripts/rekognition-worker.mjs
 *
 * Standalone script: uses only the AWS SDK + env vars (no `@/` path
 * aliases, no `server-only`), because plain `node` cannot resolve them.
 *
 * Required env: AWS_REGION, DYNAMODB_REPORTS_TABLE, S3_REPORTS_BUCKET
 * (credentials via the standard AWS provider chain).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";

const REGION = process.env.AWS_REGION || "us-east-1";
const REPORTS_TABLE = process.env.DYNAMODB_REPORTS_TABLE || "LostFound-Reports";
const REPORTS_BUCKET = process.env.S3_REPORTS_BUCKET || "";

const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const rekognition = new RekognitionClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

const MAX_BATCH = 10;

async function getImageUploadedEvents() {
  // GSI1PK = OUTBOX#IMAGE_UPLOADED, newest first — no Scan needed.
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: REPORTS_TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :type",
      FilterExpression: "#entity = :outbox AND #status = :pending",
      ExpressionAttributeNames: { "#entity": "entity", "#status": "status" },
      ExpressionAttributeValues: {
        ":type": "OUTBOX#IMAGE_UPLOADED",
        ":outbox": "OUTBOX",
        ":pending": "PENDING",
      },
      ScanIndexForward: false,
      Limit: MAX_BATCH,
    }),
  );
  return (result.Items ?? []);
}

async function analyzeImage(bucket, key) {
  try {
    // Verify the object exists (cheap HEAD-like check via GetObject range).
    await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-0" }));
    const [labelsRes, moderationRes] = await Promise.all([
      rekognition.send(
        new DetectLabelsCommand({
          Image: { S3Object: { Bucket: bucket, Name: key } },
          MaxLabels: 10,
          MinConfidence: 70,
        }),
      ),
      rekognition.send(
        new DetectModerationLabelsCommand({ Image: { S3Object: { Bucket: bucket, Name: key } } }),
      ),
    ]);
    const labels = (labelsRes.Labels ?? [])
      .filter((l) => (l.Confidence ?? 0) >= 70)
      .map((l) => l.Name ?? "")
      .filter(Boolean);
    const moderationLabels = (moderationRes.ModerationLabels ?? [])
      .filter((m) => (m.Confidence ?? 0) >= 70)
      .map((m) => m.Name ?? "")
      .filter(Boolean);
    return { labels, moderationLabels };
  } catch (err) {
    console.warn("[rekognition-worker] Analysis failed:", { name: err?.name });
    return null;
  }
}

async function processBatch() {
  if (!REPORTS_BUCKET) {
    console.error("[rekognition-worker] S3_REPORTS_BUCKET is not set.");
    process.exit(1);
  }

  const events = await getImageUploadedEvents();

  for (const event of events) {
    try {
      const imageKey = event.imageKey;
      if (!imageKey && event.reportId) {
        // Fall back to the report's current imageKey when the event predates it.
        const got = await dynamoDb.send(
          new GetCommand({
            TableName: REPORTS_TABLE,
            Key: { PK: `REPORT#${event.reportId}`, SK: `REPORT#${event.reportId}` },
          }),
        );
        if (got.Item?.imageKey) event.imageKey = got.Item.imageKey;
      }
      const key = event.imageKey;
      if (!event.reportId || !key) {
        console.log(`[rekognition-worker] Skipping event ${event.id} (no report/image).`);
      } else {
        const analysis = await analyzeImage(REPORTS_BUCKET, key);
        if (analysis) {
          const now = new Date().toISOString();
          await dynamoDb.send(
            new UpdateCommand({
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${event.reportId}`, SK: `REPORT#${event.reportId}` },
              UpdateExpression:
                "SET imageLabels = :labels, moderationLabels = :mod, updatedAt = :now",
              ConditionExpression: "attribute_exists(PK)",
              ExpressionAttributeValues: {
                ":labels": analysis.labels,
                ":mod": analysis.moderationLabels,
                ":now": now,
              },
            }),
          );
          console.log(
            `[rekognition-worker] Analyzed ${event.reportId}: ${analysis.labels.slice(0, 3).join(", ")}`,
          );
        } else {
          console.log(`[rekognition-worker] Analysis unavailable for ${event.reportId}; skipping`);
        }
      }
      // Mark the event published (SK embeds occurredAt).
      await dynamoDb.send(
        new UpdateCommand({
          TableName: REPORTS_TABLE,
          Key: { PK: `OUTBOX#${event.id}`, SK: `OUTBOX#${event.occurredAt}#${event.id}` },
          UpdateExpression: "SET #status = :published",
          ConditionExpression: "#status = :pending",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":published": "PUBLISHED", ":pending": "PENDING" },
        }),
      );
    } catch (err) {
      console.error(`[rekognition-worker] Failed for event ${event.id}:`, {
        name: err?.name,
        message: err?.message,
      });
    }
  }
}

processBatch()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[rekognition-worker] Batch failed:", err);
    process.exit(1);
  });

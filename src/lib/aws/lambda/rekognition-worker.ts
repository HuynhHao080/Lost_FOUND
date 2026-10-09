// Lambda handler for Rekognition image-analysis worker
// Receives SQS events from EventBridge → SQS pipeline
// Production runtime: AWS Lambda (Node.js 20)

import { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

/** Shape of the SQS event delivered from the EventBridge → SQS pipe. */
interface SqsEvent {
  Records?: Array<{
    body?: string;
    messageId?: string;
  }>;
}

/** Payload published for IMAGE_UPLOADED lifecycle events. */
interface ImageUploadedBody {
  eventId?: string;
  eventType?: string;
  reportId?: string;
  imageKey?: string;
}

/** EventBridge event shape when sent directly to SQS. */
interface EventBridgeEvent {
  source?: string;
  "detail-type"?: string;
  detail?: ImageUploadedBody;
  id?: string;
  time?: string;
  region?: string;
  account?: string;
  resources?: string[];
  version?: string;
}

function isSqsEvent(event: unknown): event is SqsEvent {
  return typeof event === "object" && event !== null && "Records" in event;
}

async function processImageUploaded(body: ImageUploadedBody, messageId: string, rekognition: RekognitionClient, dynamo: DynamoDBClient, tableName: string) {
  const { eventId, eventType, reportId, imageKey } = body;
  if (!reportId || !imageKey) {
    console.error(JSON.stringify({ eventId, error: "missing_fields", reportId, imageKey, messageId }));
    return; // permanent malformed message — do not retry
  }

  try {
    // Idempotency: check if already processed (simplified — full check via repository preferred)
    // For production, query DynamoDB for existing analysis; here we proceed with safe update
    const detectLabels = await rekognition.send(new DetectLabelsCommand({
      Image: { S3Object: { Bucket: process.env.S3_REPORTS_BUCKET, Name: imageKey } },
      MaxLabels: 10,
      MinConfidence: 50,
    }));

    const moderation = await rekognition.send(new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: process.env.S3_REPORTS_BUCKET, Name: imageKey } },
      MinConfidence: 50,
    }));

    const labels = detectLabels.Labels?.map((l) => l.Name).filter((n): n is string => Boolean(n)) || [];
    const moderationLabels = moderation.ModerationLabels?.map((m) => m.Name).filter((n): n is string => Boolean(n)) || [];

    // Persist to DynamoDB using the same fields the UI expects:
    // imageLabels (string[]), moderationLabels (string[]), imageAnalysisStatus (string)
    await dynamo.send(new UpdateItemCommand({
      TableName: tableName,
      Key: { PK: { S: `REPORT#${reportId}` }, SK: { S: `REPORT#${reportId}` } },
      UpdateExpression: "SET imageLabels = :labels, moderationLabels = :mod, imageAnalysisStatus = :status, imageAnalysisUpdatedAt = :t",
      ExpressionAttributeValues: {
        ":labels": { L: labels.map((l) => ({ S: l })) },
        ":mod": { L: moderationLabels.map((m) => ({ S: m })) },
        ":status": { S: labels.length > 0 || moderationLabels.length > 0 ? "COMPLETED" : "NO_LABELS" },
        ":t": { S: new Date().toISOString() },
      },
    }));

    console.log(JSON.stringify({ eventId, eventType, reportId, imageKey, status: "COMPLETED", labelsCount: labels.length, moderationCount: moderationLabels.length, correlationId: eventId }));
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.error(JSON.stringify({ eventId, eventType, reportId, imageKey, error: e.name || "unknown", message: e.message, correlationId: eventId }));
    // Throw for retryable AWS errors (SQS will retry); only suppress if clearly permanent
    if (e.name === "ResourceNotFoundException" || e.name === "InvalidParameterException") {
      // Permanent — do not retry infinitely
      console.error(JSON.stringify({ eventId, error: "permanent_failure", reportId, messageId }));
    } else {
      throw err; // Retryable — let SQS retry
    }
  }
}

export const handler = async (event: SqsEvent) => {
  const rekognition = new RekognitionClient({ region: process.env.AWS_REGION || "us-east-1" });
  const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
  const tableName = process.env.DYNAMODB_REPORTS_TABLE;

  if (!isSqsEvent(event)) {
    console.error(JSON.stringify({ error: "unknown_event_format", event: JSON.stringify(event) }));
    return;
  }

  for (const record of event.Records || []) {
    let eventBridgeEvent: EventBridgeEvent | null = null;
    try {
      // SQS message body from EventBridge is a JSON string of the EventBridge event
      const bodyStr = record.body || "{}";
      eventBridgeEvent = JSON.parse(bodyStr);
    } catch {
      console.error(JSON.stringify({ eventId: "unknown", error: "invalid_sqs_body", messageId: record.messageId }));
      continue; // permanent malformed message — do not retry
    }

    // Extract the detail from EventBridge event
    const detail = eventBridgeEvent.detail || {};
    const messageId = eventBridgeEvent.id || record.messageId || "unknown";
    await processImageUploaded(detail, messageId, rekognition, dynamo, tableName);
  }
};
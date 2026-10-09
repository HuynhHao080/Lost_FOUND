"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../src/lib/aws/lambda/rekognition-worker.ts
var rekognition_worker_exports = {};
__export(rekognition_worker_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(rekognition_worker_exports);
var import_client_rekognition = require("@aws-sdk/client-rekognition");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
function isSqsEvent(event) {
  return typeof event === "object" && event !== null && "Records" in event;
}
async function processImageUploaded(body, messageId, rekognition, dynamo, tableName) {
  const { eventId, eventType, reportId, imageKey } = body;
  if (!reportId || !imageKey) {
    console.error(JSON.stringify({ eventId, error: "missing_fields", reportId, imageKey, messageId }));
    return;
  }
  try {
    const detectLabels = await rekognition.send(new import_client_rekognition.DetectLabelsCommand({
      Image: { S3Object: { Bucket: process.env.S3_REPORTS_BUCKET, Name: imageKey } },
      MaxLabels: 10,
      MinConfidence: 50
    }));
    const moderation = await rekognition.send(new import_client_rekognition.DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: process.env.S3_REPORTS_BUCKET, Name: imageKey } },
      MinConfidence: 50
    }));
    const labels = detectLabels.Labels?.map((l) => l.Name).filter((n) => Boolean(n)) || [];
    const moderationLabels = moderation.ModerationLabels?.map((m) => m.Name).filter((n) => Boolean(n)) || [];
    await dynamo.send(new import_client_dynamodb.UpdateItemCommand({
      TableName: tableName,
      Key: { PK: { S: `REPORT#${reportId}` }, SK: { S: `REPORT#${reportId}` } },
      UpdateExpression: "SET imageLabels = :labels, moderationLabels = :mod, imageAnalysisStatus = :status, imageAnalysisUpdatedAt = :t",
      ExpressionAttributeValues: {
        ":labels": { L: labels.map((l) => ({ S: l })) },
        ":mod": { L: moderationLabels.map((m) => ({ S: m })) },
        ":status": { S: labels.length > 0 || moderationLabels.length > 0 ? "COMPLETED" : "NO_LABELS" },
        ":t": { S: (/* @__PURE__ */ new Date()).toISOString() }
      }
    }));
    console.log(JSON.stringify({ eventId, eventType, reportId, imageKey, status: "COMPLETED", labelsCount: labels.length, moderationCount: moderationLabels.length, correlationId: eventId }));
  } catch (err) {
    const e = err;
    console.error(JSON.stringify({ eventId, eventType, reportId, imageKey, error: e.name || "unknown", message: e.message, correlationId: eventId }));
    if (e.name === "ResourceNotFoundException" || e.name === "InvalidParameterException") {
      console.error(JSON.stringify({ eventId, error: "permanent_failure", reportId, messageId }));
    } else {
      throw err;
    }
  }
}
var handler = async (event) => {
  const rekognition = new import_client_rekognition.RekognitionClient({ region: process.env.AWS_REGION || "us-east-1" });
  const dynamo = new import_client_dynamodb.DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
  const tableName = process.env.DYNAMODB_REPORTS_TABLE;
  if (!isSqsEvent(event)) {
    console.error(JSON.stringify({ error: "unknown_event_format", event: JSON.stringify(event) }));
    return;
  }
  for (const record of event.Records || []) {
    let eventBridgeEvent = null;
    try {
      const bodyStr = record.body || "{}";
      eventBridgeEvent = JSON.parse(bodyStr);
    } catch {
      console.error(JSON.stringify({ eventId: "unknown", error: "invalid_sqs_body", messageId: record.messageId }));
      continue;
    }
    const detail = eventBridgeEvent.detail || {};
    const messageId = eventBridgeEvent.id || record.messageId || "unknown";
    await processImageUploaded(detail, messageId, rekognition, dynamo, tableName);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=rekognition-worker.js.map

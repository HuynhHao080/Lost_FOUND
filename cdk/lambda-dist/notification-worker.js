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

// ../src/lib/notifications/worker-lambda.ts
var worker_lambda_exports = {};
__export(worker_lambda_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(worker_lambda_exports);

// lambda-shim.js
var originalRequire = require;
require = function(mod) {
  if (mod === "server-only") {
    return {};
  }
  return originalRequire(mod);
};

// ../src/lib/notifications/worker-lambda.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_rekognition = require("@aws-sdk/client-rekognition");
var import_client_s3 = require("@aws-sdk/client-s3");
var import_client_eventbridge = require("@aws-sdk/client-eventbridge");
var REGION = process.env.AWS_REGION || "us-east-1";
var REPORTS_TABLE = process.env.DYNAMODB_REPORTS_TABLE || "LostFound-Reports";
var REPORTS_BUCKET = process.env.S3_REPORTS_BUCKET || "lostfound-reports-629380420098";
var EVENTBRIDGE_BUS = process.env.EVENTBRIDGE_BUS_NAME || "lost-found-bus";
var MAX_BATCH = 10;
var dynamoClient = new import_client_dynamodb.DynamoDBClient({ region: REGION });
var dynamoDb = import_lib_dynamodb.DynamoDBDocumentClient.from(dynamoClient);
var rekognition = new import_client_rekognition.RekognitionClient({ region: REGION });
var s3Client = new import_client_s3.S3Client({ region: REGION });
var eventBridge = new import_client_eventbridge.EventBridgeClient({ region: REGION });
var OUTBOX_TYPES = ["MATCH_CONFIRMED", "MATCH_RESET", "REPORT_RESOLVED", "IMAGE_UPLOADED"];
async function getPendingOutboxEvents(limit = MAX_BATCH) {
  const types = OUTBOX_TYPES;
  const perType = Math.max(1, Math.ceil(MAX_BATCH / types.length));
  const merged = [];
  let lastKey;
  for (const t of types) {
    const result = await dynamoDb.send(new import_lib_dynamodb.QueryCommand({
      TableName: REPORTS_TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :type",
      FilterExpression: "#entity = :outbox AND #status = :pending",
      ExpressionAttributeNames: { "#entity": "entity", "#status": "status" },
      ExpressionAttributeValues: {
        ":type": `OUTBOX#${t}`,
        ":outbox": "OUTBOX",
        ":pending": "PENDING"
      },
      ScanIndexForward: false,
      Limit: perType,
      ...lastKey ? { ExclusiveStartKey: lastKey } : {}
    }));
    merged.push(...result.Items ?? []);
    if (result.LastEvaluatedKey) {
      lastKey = result.LastEvaluatedKey;
    }
  }
  merged.sort((a, b) => a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0);
  return { events: merged.slice(0, limit), lastKey };
}
async function getReportById(reportId) {
  const result = await dynamoDb.send(new import_lib_dynamodb.QueryCommand({
    TableName: REPORTS_TABLE,
    KeyConditionExpression: "PK = :pk AND SK = :sk",
    ExpressionAttributeValues: {
      ":pk": `REPORT#${reportId}`,
      ":sk": `REPORT#${reportId}`
    }
  }));
  return result.Items?.[0] ?? null;
}
async function analyzeImage(bucket, key) {
  try {
    const detectLabels = await rekognition.send(new import_client_rekognition.DetectLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MaxLabels: 10,
      MinConfidence: 50
    }));
    const moderation = await rekognition.send(new import_client_rekognition.DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: bucket, Name: key } },
      MinConfidence: 50
    }));
    const labels = detectLabels.Labels?.map((l) => l.Name).filter((n) => Boolean(n)) || [];
    const moderationLabels = moderation.ModerationLabels?.map((m) => m.Name).filter((n) => Boolean(n)) || [];
    return { labels, moderationLabels };
  } catch (err) {
    console.error("[rekognition] Analysis failed:", err);
    return null;
  }
}
async function updateImageAnalysis(reportId, labels, moderationLabels) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await dynamoDb.send(new import_lib_dynamodb.UpdateCommand({
    TableName: REPORTS_TABLE,
    Key: { PK: `REPORT#${reportId}`, SK: `REPORT#${reportId}` },
    UpdateExpression: "SET imageLabels = :labels, moderationLabels = :mod, imageAnalysisStatus = :status, updatedAt = :now",
    ConditionExpression: "attribute_exists(PK)",
    ExpressionAttributeValues: {
      ":labels": labels,
      ":mod": moderationLabels ?? [],
      ":status": labels.length > 0 || (moderationLabels?.length ?? 0) > 0 ? "COMPLETED" : "NO_LABELS",
      ":now": now
    }
  }));
}
async function createNotification(input) {
  const id = `${input.type}#${input.reportId}#${input.relatedReportId ?? ""}#${input.eventDate}`;
  try {
    await dynamoDb.send(new import_lib_dynamodb.PutCommand({
      TableName: "LostFound-Reports",
      Item: {
        ...input,
        id,
        entity: "NOTIFICATION",
        PK: `USER#${input.userId}`,
        SK: `NOTIF#${id}`,
        GSI1PK: `USER#${input.userId}`,
        GSI1SK: `NOTIF#${input.eventDate}#${id}`,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      ConditionExpression: "attribute_not_exists(PK)"
    }));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return;
    }
    throw err;
  }
}
async function markOutboxPublished(id, occurredAt) {
  await dynamoDb.send(new import_lib_dynamodb.UpdateCommand({
    TableName: "LostFound-Reports",
    Key: { PK: `OUTBOX#${id}`, SK: `OUTBOX#${occurredAt}#${id}` },
    UpdateExpression: "SET #status = :published, updatedAt = :now",
    ConditionExpression: "#status = :pending",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":published": "PUBLISHED",
      ":pending": "PENDING",
      ":now": (/* @__PURE__ */ new Date()).toISOString()
    }
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
      if (event.eventType === "MATCH_CONFIRMED" || event.eventType === "MATCH_RESET" || event.eventType === "REPORT_RESOLVED") {
        const report = await getReportById(event.reportId);
        const userId = report?.userId ?? event.userId;
        if (userId) {
          await createNotification({
            userId,
            type: event.eventType,
            title: event.eventType === "MATCH_CONFIRMED" ? "Match confirmed" : event.eventType === "MATCH_RESET" ? "Match reset" : "Report resolved",
            message: `Event: ${event.eventType}`,
            reportId: event.reportId,
            relatedReportId: event.relatedReportId,
            eventDate: event.occurredAt.slice(0, 10)
          });
        }
      }
      await markOutboxPublished(event.id, event.occurredAt);
    } catch (err) {
      console.error(`[worker] Failed to process outbox event ${event.id}:`, {
        name: err?.name,
        message: err?.message
      });
    }
  }
  if (lastKey) {
    console.log("[worker] More outbox events available; run again.");
  }
  return { processed: events.length, hasMore: Boolean(lastKey) };
}
var handler = async () => {
  await processBatch();
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=notification-worker.js.map

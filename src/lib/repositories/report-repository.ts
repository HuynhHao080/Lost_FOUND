import "server-only";
import { dynamoDb, REPORTS_TABLE } from "@/lib/aws/dynamodb";
import { ReportInput, ReportType, ReportStatus } from "@/lib/validations/report";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export interface Report {
  id: string;
  userId: string;
  type: ReportType;
  title: string;
  description?: string;
  category: string;
  location: string;
  dateOccurred?: string;
  status: ReportStatus;
  imageKey?: string;
  imageUrl?: string;
  imageLabels?: string[];
  moderationLabels?: string[];
  imageAnalysisStatus?: "PENDING" | "PROCESSING" | "COMPLETED" | "NO_LABELS" | "FAILED";
  matchedReportId?: string;
  matchedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createReport(userId: string, input: ReportInput): Promise<Report> {
  const now = new Date().toISOString();
  const id = uuidv4();
  const report: Report = {
    id,
    userId,
    type: input.type,
    title: input.title,
    description: input.description,
    category: input.category,
    location: input.location,
    dateOccurred: input.dateOccurred,
    status: ReportStatus.PENDING,
    imageUrl: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const params = {
    TableName: REPORTS_TABLE,
    Item: {
      ...report,
      PK: `REPORT#${id}`,
      SK: `REPORT#${id}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `REPORT#${now}#${id}`,
    },
    ConditionExpression: "attribute_not_exists(PK)",
  };
  await dynamoDb.send(new PutCommand(params));
  return report;
}

export async function getReportById(id: string): Promise<Report | null> {
  const params = {
    TableName: REPORTS_TABLE,
    Key: { PK: `REPORT#${id}`, SK: `REPORT#${id}` },
  };
  const result = await dynamoDb.send(new GetCommand(params));
  return (result.Item as Report | undefined) ?? null;
}

export async function updateReportImage(id: string, imageKey: string): Promise<Report | null> {
  const now = new Date().toISOString();
  const result = await dynamoDb.send(
    new UpdateCommand({
      TableName: REPORTS_TABLE,
      Key: { PK: `REPORT#${id}`, SK: `REPORT#${id}` },
      UpdateExpression: "SET imageKey = :key, updatedAt = :now",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: {
        ":key": imageKey,
        ":now": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  return (result.Attributes as Report | undefined) ?? null;
}

/** Editable content fields a report owner may update. */
export interface ReportContentPatch {
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  dateOccurred?: string;
}

/**
 * Updates the editable content fields of a report (owner-only at the route
 * layer). Only the provided fields are written; status, type, userId and
 * timestamps other than updatedAt are never touched.
 */
export async function updateReportContent(
  id: string,
  patch: ReportContentPatch,
): Promise<Report | null> {
  const now = new Date().toISOString();
  const sets: string[] = ["updatedAt = :now"];
  const values: Record<string, unknown> = { ":now": now };

  if (patch.title !== undefined) {
    sets.push("title = :title");
    values[":title"] = patch.title;
  }
  if (patch.description !== undefined) {
    sets.push("description = :description");
    values[":description"] = patch.description;
  }
  if (patch.category !== undefined) {
    sets.push("category = :category");
    values[":category"] = patch.category;
  }
  if (patch.location !== undefined) {
    sets.push("location = :location");
    values[":location"] = patch.location;
  }
  if (patch.dateOccurred !== undefined) {
    sets.push("dateOccurred = :dateOccurred");
    values[":dateOccurred"] = patch.dateOccurred;
  }

  const result = await dynamoDb.send(
    new UpdateCommand({
      TableName: REPORTS_TABLE,
      Key: { PK: `REPORT#${id}`, SK: `REPORT#${id}` },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return (result.Attributes as Report | undefined) ?? null;
}

/**
 * Lists a user's own reports, newest first, via GSI1 (GSI1PK = USER#<id>).
 * Reports share the GSI1 partition with notifications/outbox rows.
 * Reports have SK starting with REPORT#; notifications have SK starting with NOTIF#.
 * We filter by SK prefix to ensure only reports are returned.
 */
export async function getReportsByUser(
  userId: string,
  limit: number = 50,
  lastEvaluatedKey?: Record<string, unknown>,
): Promise<{ reports: Report[]; lastKey?: Record<string, unknown> }> {
  const params: QueryCommandInput = {
    TableName: REPORTS_TABLE,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :user",
    FilterExpression: "begins_with(SK, :reportPrefix)",
    ExpressionAttributeValues: {
      ":user": `USER#${userId}`,
      ":reportPrefix": "REPORT#",
    },
    ScanIndexForward: false,
    Limit: limit,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await dynamoDb.send(new QueryCommand(params));
  return {
    reports: (result.Items ?? []) as Report[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function updateImageAnalysis(
  id: string,
  labels: string[],
  moderationLabels?: string[],
): Promise<Report | null> {
  const now = new Date().toISOString();
  const result = await dynamoDb.send(
    new UpdateCommand({
      TableName: REPORTS_TABLE,
      Key: { PK: `REPORT#${id}`, SK: `REPORT#${id}` },
      UpdateExpression: "SET imageLabels = :labels, moderationLabels = :mod, imageAnalysisStatus = :status, updatedAt = :now",
      ConditionExpression: "attribute_exists(PK)",
      ExpressionAttributeValues: {
        ":labels": labels,
        ":mod": moderationLabels ?? [],
        ":status": labels.length > 0 || (moderationLabels?.length ?? 0) > 0 ? "COMPLETED" : "NO_LABELS",
        ":now": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  return (result.Attributes as Report | undefined) ?? null;
}

export class MatchConflictError extends Error {
  constructor() {
    super("One of the reports is no longer available for matching");
    this.name = "MatchConflictError";
  }
}

export async function confirmReportMatch(reportId: string, matchedReportId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    await dynamoDb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${reportId}`, SK: `REPORT#${reportId}` },
              UpdateExpression:
                "SET #status = :matched, matchedReportId = :other, matchedAt = :now, updatedAt = :now",
              ConditionExpression: "#status = :pending",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":matched": "MATCHED",
                ":pending": "PENDING",
                ":other": matchedReportId,
                ":now": now,
              },
            },
          },
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${matchedReportId}`, SK: `REPORT#${matchedReportId}` },
              UpdateExpression:
                "SET #status = :matched, matchedReportId = :source, matchedAt = :now, updatedAt = :now",
              ConditionExpression: "#status = :pending",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":matched": "MATCHED",
                ":pending": "PENDING",
                ":source": reportId,
                ":now": now,
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    throwIfMatchConflict(err);
    throw err;
  }
}

function throwIfMatchConflict(err: unknown): void {
  const name = (err as { name?: string })?.name ?? "";
  if (name !== "TransactionCanceledException") return;
  const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> })?.CancellationReasons;
  const conditionalFailure = !reasons || reasons.some((r) => r?.Code === "ConditionalCheckFailed");
  if (name === "TransactionCanceledException" && conditionalFailure) {
    throw new MatchConflictError();
  }
}

export class BrokenMatchReferenceError extends Error {
  constructor() {
    super("Matched report does not reference this report back");
    this.name = "BrokenMatchReferenceError";
  }
}

export async function unmatchReport(reportId: string): Promise<void> {
  const source = await getReportById(reportId);
  if (!source || source.status !== "MATCHED" || !source.matchedReportId) return;
  const counterpartId = source.matchedReportId;
  const now = new Date().toISOString();
  try {
    await dynamoDb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${reportId}`, SK: `REPORT#${reportId}` },
              UpdateExpression:
                "REMOVE matchedReportId, matchedAt SET #status = :pending, updatedAt = :now",
              ConditionExpression: "#status = :matched AND matchedReportId = :counterpart",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":pending": "PENDING",
                ":matched": "MATCHED",
                ":counterpart": counterpartId,
                ":now": now,
              },
            },
          },
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${counterpartId}`, SK: `REPORT#${counterpartId}` },
              UpdateExpression:
                "REMOVE matchedReportId, matchedAt SET #status = :pending, updatedAt = :now",
              ConditionExpression: "#status = :matched AND matchedReportId = :source",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":pending": "PENDING",
                ":matched": "MATCHED",
                ":source": reportId,
                ":now": now,
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    throwIfMatchConflict(err);
    throw err;
  }
}

export async function resolveReport(reportId: string): Promise<void> {
  const source = await getReportById(reportId);
  if (!source || source.status !== "MATCHED" || !source.matchedReportId) return;
  const counterpartId = source.matchedReportId;
  const now = new Date().toISOString();
  try {
    await dynamoDb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${reportId}`, SK: `REPORT#${reportId}` },
              UpdateExpression: "SET #status = :resolved, resolvedAt = :now, updatedAt = :now",
              ConditionExpression: "#status = :matched AND matchedReportId = :counterpart",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":resolved": "RESOLVED",
                ":matched": "MATCHED",
                ":counterpart": counterpartId,
                ":now": now,
              },
            },
          },
          {
            Update: {
              TableName: REPORTS_TABLE,
              Key: { PK: `REPORT#${counterpartId}`, SK: `REPORT#${counterpartId}` },
              UpdateExpression: "SET #status = :resolved, resolvedAt = :now, updatedAt = :now",
              ConditionExpression: "#status = :matched AND matchedReportId = :source",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":resolved": "RESOLVED",
                ":matched": "MATCHED",
                ":source": reportId,
                ":now": now,
              },
            },
          },
        ],
      }),
    );
  } catch (err) {
    throwIfMatchConflict(err);
    throw err;
  }
}

export interface PublicSearchFilters {
  type?: string;
  category?: string;
  status?: string;
  location?: string;
  search?: string;
}

export async function searchPublicReports(
  filters: PublicSearchFilters,
  limit: number = 24,
  lastEvaluatedKey?: unknown,
): Promise<{ reports: Report[]; lastKey?: unknown }> {
  const filterParts: string[] = [];
  const values: Record<string, unknown> = {};

  // Always filter to only report items (SK starts with REPORT#)
  // This excludes notifications (NOTIF#) and outbox events from the same table.
  filterParts.push("begins_with(SK, :reportPrefix)");
  values[":reportPrefix"] = "REPORT#";

  if (filters.type) {
    filterParts.push("#type = :type");
    values[":type"] = filters.type;
  }
  if (filters.category) {
    filterParts.push("category = :category");
    values[":category"] = filters.category;
  }
  if (filters.status) {
    filterParts.push("#status = :status");
    values[":status"] = filters.status;
  }
  if (filters.location) {
    filterParts.push("contains(#location, :location)");
    values[":location"] = filters.location;
  }
  if (filters.search) {
    filterParts.push("(contains(#searchTitle, :kw) OR contains(#searchDesc, :kw))");
    values[":kw"] = filters.search;
  }

  const names: Record<string, string> = {};
  if (filters.type) names["#type"] = "type";
  if (filters.status) names["#status"] = "status";
  if (filters.location) names["#location"] = "location";
  if (filters.search) {
    names["#searchTitle"] = "title";
    names["#searchDesc"] = "description";
  }

  const params: ScanCommandInput = {
    TableName: REPORTS_TABLE,
    FilterExpression: filterParts.join(" AND "),
    ExpressionAttributeValues: values,
    ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
    Limit: limit,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await dynamoDb.send(new ScanCommand(params));

  return {
    reports: (result.Items ?? []) as Report[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

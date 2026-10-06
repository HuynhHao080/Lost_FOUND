import "server-only";
import { dynamoDb, REPORTS_TABLE } from "@/lib/aws/dynamodb";
import type { Report } from "@/lib/repositories/report-repository";
import {
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";

/**
 * Candidate lookup for the matching engine.
 *
 * DynamoDB strategy:
 * The existing schema (PK/SK = REPORT#<id>, GSI1 = USER#<userId>) has no index
 * that supports "all reports of type X across all users", so an efficient Query
 * is not possible without a new GSI. Per milestone constraints we do NOT create
 * one. Instead we use a controlled, internally paginated Scan with a hard cap
 * on scanned pages and candidate count. Fine at demo scale; revisit if the
 * dataset grows.
 */

/** Hard upper bound on candidates fetched per request. */
const MAX_CANDIDATES = 200;
/** Hard upper bound on Scan pages to bound cost/latency. */
const MAX_SCAN_PAGES = 10;
const PAGE_SIZE = 50;

/**
 * Fetches candidate reports of the opposite type for matching.
 * Only PENDING or MATCHED candidates are considered — RESOLVED and EXPIRED
 * items are excluded because they can no longer be matched.
 *
 * @param oppositeType - "FOUND" when matching a LOST report, and vice versa
 * @param excludeId - The source report's own id (never match itself)
 */
export async function findMatchCandidates(
  oppositeType: "LOST" | "FOUND",
  excludeId: string,
): Promise<Report[]> {
  const candidates: Report[] = [];
  let lastKey: Record<string, unknown> | undefined;

  const params: ScanCommandInput = {
    TableName: REPORTS_TABLE,
    FilterExpression: "#type = :type AND #status <> :resolved AND #status <> :expired",
    ExpressionAttributeNames: {
      "#type": "type",
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":type": oppositeType,
      ":resolved": "RESOLVED",
      ":expired": "EXPIRED",
    },
    Limit: PAGE_SIZE,
  };

  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await dynamoDb.send(new ScanCommand(params));

    for (const item of result.Items ?? []) {
      const report = item as Report;
      // Defensive validation: skip malformed records
      if (
        report &&
        typeof report.id === "string" &&
        report.id !== excludeId &&
        report.type === oppositeType
      ) {
        candidates.push(report);
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (!lastKey || candidates.length >= MAX_CANDIDATES) break;
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

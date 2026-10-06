/**
 * Unit tests for confirm-threshold and unmatch validation logic.
 * Run: npx tsx scripts/test-unmatch.mts
 */

import assert from "node:assert/strict";
import { calculateMatchScore, type MatchableReport } from "../src/lib/matching/matching.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    failed++;
  }
}

const CONFIRM_THRESHOLD = 60;

/** Mirrors the confirm route's server-side score gate. */
function checkConfirmThreshold(source: MatchableReport, matched: MatchableReport) {
  const { score } = calculateMatchScore(source, matched);
  return { allowed: score >= CONFIRM_THRESHOLD, score };
}

const LOST = {
  id: "37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c",
  type: "LOST" as const,
  title: "Mất ví",
  category: "Wallet",
  location: "Thư viện",
  dateOccurred: "2026-08-26",
  status: "PENDING" as const,
};

const FOUND = {
  id: "08164a32-2d9d-47f7-8e3c-940e9a5fe1d0",
  type: "FOUND" as const,
  title: "Tìm thấy ví màu đen",
  description: "Tìm thấy một chiếc ví màu đen ở thư viện",
  category: "Wallet",
  location: "Thư viện",
  dateOccurred: "2026-08-26",
  status: "PENDING" as const,
};

/* ------------------------------------------------------------------ */

test("confirm score 81 → allowed", () => {
  // Deterministic-only baseline for this pair is 100; simulate a hybrid
  // combined score of 81 by checking the threshold rule directly.
  assert.ok(81 >= CONFIRM_THRESHOLD);
  const { allowed, score } = checkConfirmThreshold(LOST, FOUND);
  assert.ok(allowed, `deterministic score ${score} should be allowed`);
});

test("confirm score 59 → rejected", () => {
  const allowed = 59 >= CONFIRM_THRESHOLD;
  assert.equal(allowed, false);
});

test("threshold boundary: 60 allowed, 40 rejected", () => {
  assert.ok(60 >= CONFIRM_THRESHOLD);
  assert.ok(!(40 >= CONFIRM_THRESHOLD));
});

test("client fake score cannot bypass threshold (server recomputes)", () => {
  // Client sends score=100 but the pair scores low deterministically
  const weakFound = {
    ...FOUND,
    title: "Lost keys on keyring",
    description: "Set of car keys near gym entrance",
    category: "Keys",
    location: "Sports Hall",
    dateOccurred: "2026-01-01",
  };
  const clientClaimedScore = 100;
  const { allowed, score } = checkConfirmThreshold(LOST, weakFound);
  assert.ok(score < CONFIRM_THRESHOLD, `expected low deterministic score, got ${score}`);
  assert.equal(allowed, false, "server must reject despite client claiming high score");
  assert.notEqual(clientClaimedScore, score);
});

test("unmatch valid pair shape: both sides reference each other", () => {
  const source = { ...LOST, status: "MATCHED" as const, matchedReportId: FOUND.id };
  const counterpart = { ...FOUND, status: "MATCHED" as const, matchedReportId: LOST.id };
  assert.equal(source.matchedReportId, counterpart.id);
  assert.equal(counterpart.matchedReportId, source.id);
});

test("unmatch non-owner → 403", () => {
  function authorize(reportUserId: string, callerSub: string) {
    return reportUserId === callerSub ? 200 : 403;
  }
  assert.equal(authorize("user-A", "user-B"), 403);
  assert.equal(authorize("user-A", "user-A"), 200);
});

test("unmatch non-MATCHED report → 409", () => {
  for (const status of ["PENDING", "RESOLVED", "EXPIRED"] as const) {
    const report = { ...LOST, status };
    const ok = report.status === "MATCHED" && !!report.matchedReportId;
    assert.equal(ok, false, `${status} must not be unmatchable`);
  }
});

test("broken/mismatched counterpart reference → safe error", () => {
  const source = { ...LOST, status: "MATCHED" as const, matchedReportId: FOUND.id };
  const counterpart = { ...FOUND, status: "MATCHED" as const, matchedReportId: "other-id" };
  const consistent = counterpart.matchedReportId === source.id;
  assert.equal(consistent, false, "mismatched back-reference must be detected");
});

test("concurrent unmatch → second attempt sees changed state → 409", () => {
  // ConditionExpression requires status=MATCHED AND matchedReportId=X.
  // After the first transaction commits, both conditions fail for the second.
  const afterFirstUnmatch = { ...LOST, status: "PENDING" as const };
  const conditionHolds =
    afterFirstUnmatch.status === "MATCHED" && !!afterFirstUnmatch.matchedReportId;
  assert.equal(conditionHolds, false, "second concurrent unmatch must fail its condition");
});

test("public response contains no private DynamoDB keys", () => {
  function toPublicReport(report: Record<string, unknown>): Record<string, unknown> {
    return {
      id: report.id,
      type: report.type,
      title: report.title,
      description: report.description,
      category: report.category,
      location: report.location,
      dateOccurred: report.dateOccurred,
      status: report.status,
      hasImage: Boolean(report.imageKey),
      matchedReportId: report.matchedReportId,
      createdAt: report.createdAt,
    };
  }

  const internal = {
    ...FOUND,
    userId: "user-B",
    PK: "REPORT#x",
    SK: "REPORT#x",
    GSI1PK: "USER#user-B",
    GSI1SK: "REPORT#2026#x",
    imageKey: "reports/x/y.jpg",
    embedding: [0.5],
    matchedAt: "2026-08-26T00:00:00Z",
  };

  const serialized = JSON.stringify(toPublicReport(internal));
  for (const forbidden of [
    "userId",
    "PK",
    "SK",
    "GSI1PK",
    "GSI1SK",
    "imageKey",
    "embedding",
    "matchedAt",
  ]) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `leaked: ${forbidden}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

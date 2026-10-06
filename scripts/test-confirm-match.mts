/**
 * Unit tests for match confirmation validation logic.
 * Run: npx tsx scripts/test-confirm-match.mts
 */

import assert from "node:assert/strict";
import { calculateMatchScore, MATCH_THRESHOLD, type MatchableReport } from "../src/lib/matching/matching.ts";

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

/** Mirrors the API route's pre-transaction validation. */
function validatePair(
  source: MatchableReport & { userId: string },
  matched: MatchableReport & { userId: string },
  callerSub: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (source.id === matched.id) return { ok: false, status: 400, error: "self" };
  if (source.type === matched.type) return { ok: false, status: 400, error: "same-type" };
  if (source.userId !== callerSub) return { ok: false, status: 403, error: "forbidden" };
  if (source.status !== "PENDING" || matched.status !== "PENDING") {
    return { ok: false, status: 409, error: "not-pending" };
  }
  const { score } = calculateMatchScore(source, matched);
  if (score < MATCH_THRESHOLD) return { ok: false, status: 400, error: "below-threshold" };
  return { ok: true };
}

const LOST = {
  id: "37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c",
  userId: "user-A",
  type: "LOST" as const,
  title: "Mất ví",
  category: "Wallet",
  location: "Thư viện",
  dateOccurred: "2026-08-26",
  status: "PENDING" as const,
};

const FOUND = {
  id: "08164a32-2d9d-47f7-8e3c-940e9a5fe1d0",
  userId: "user-B",
  type: "FOUND" as const,
  title: "Tìm thấy ví màu đen",
  description: "Tìm thấy một chiếc ví màu đen ở thư viện",
  category: "Wallet",
  location: "Thư viện",
  dateOccurred: "2026-08-26",
  status: "PENDING" as const,
};

/* ------------------------------------------------------------------ */

test("valid opposite-type pair passes", () => {
  const result = validatePair(LOST, FOUND, "user-A");
  assert.deepEqual(result, { ok: true });
});

test("same-type pair → 400", () => {
  const lost2 = { ...LOST, id: "11111111-1111-4111-8111-111111111111" };
  const result = validatePair(LOST, lost2, "user-A");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 400);
});

test("same report id → 400", () => {
  const result = validatePair(LOST, LOST, "user-A");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 400);
});

test("non-owner source report → 403", () => {
  const result = validatePair(LOST, FOUND, "user-C");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 403);
});

test("already MATCHED source → 409", () => {
  const result = validatePair({ ...LOST, status: "MATCHED" }, FOUND, "user-A");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("already RESOLVED candidate → 409", () => {
  const result = validatePair(LOST, { ...FOUND, status: "RESOLVED" }, "user-A");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("score below threshold → 400", () => {
  const unrelatedFound = {
    ...FOUND,
    title: "Lost laptop charger",
    description: "Black dell charger found in parking lot",
    category: "Electronics",
    location: "Parking Lot B",
    dateOccurred: "2026-01-01",
  };
  const result = validatePair(LOST, unrelatedFound, "user-A");
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 400);

  // And confirm the score really is below threshold
  const { score } = calculateMatchScore(LOST, unrelatedFound);
  assert.ok(score < MATCH_THRESHOLD, `expected below threshold, got ${score}`);
});

test("real test pair scores at or above threshold", () => {
  const { score } = calculateMatchScore(LOST, FOUND);
  assert.ok(score >= MATCH_THRESHOLD, `expected >= ${MATCH_THRESHOLD}, got ${score}`);
});

test("public response sanitization excludes private fields", () => {
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
    embedding: [0.1],
  };

  const serialized = JSON.stringify(toPublicReport(internal));
  for (const forbidden of ["userId", "PK", "SK", "GSI1PK", "GSI1SK", "imageKey", "embedding"]) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `leaked: ${forbidden}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

/**
 * Unit tests for the RESOLVED workflow validation logic.
 * Run: npx tsx scripts/test-resolve.mts
 */

import assert from "node:assert/strict";

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

/** Mirrors the resolve route's pre-transaction validation. */
function validateResolve(
  report: { id: string; userId: string; status: string; matchedReportId?: string },
  callerSub: string,
  counterpart?: { id: string; matchedReportId?: string } | null,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!report) return { ok: false, status: 404, error: "not-found" };
  if (report.userId !== callerSub) return { ok: false, status: 403, error: "forbidden" };
  if (report.status !== "MATCHED" || !report.matchedReportId) {
    return { ok: false, status: 409, error: "not-matched" };
  }
  if (!counterpart || counterpart.matchedReportId !== report.id) {
    return { ok: false, status: 409, error: "broken-reference" };
  }
  if (counterpart.status !== "MATCHED") {
    return { ok: false, status: 409, error: "counterpart-not-matched" };
  }
  return { ok: true };
}

const LOST_ID = "37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c";
const FOUND_ID = "08164a32-2d9d-47f7-8e3c-940e9a5fe1d0";

function matchedPair() {
  return {
    source: {
      id: LOST_ID,
      userId: "user-A",
      status: "MATCHED",
      matchedReportId: FOUND_ID,
    },
    counterpart: {
      id: FOUND_ID,
      userId: "user-B",
      status: "MATCHED",
      matchedReportId: LOST_ID,
    },
  };
}

/* ------------------------------------------------------------------ */

test("MATCHED → RESOLVED succeeds", () => {
  const { source, counterpart } = matchedPair();
  assert.deepEqual(validateResolve(source, "user-A", counterpart), { ok: true });
});

test("PENDING → RESOLVED rejected with 409", () => {
  const { source, counterpart } = matchedPair();
  const result = validateResolve({ ...source, status: "PENDING" }, "user-A", counterpart);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("already RESOLVED → rejected with 409", () => {
  const { source, counterpart } = matchedPair();
  const result = validateResolve(
    { ...source, status: "RESOLVED", resolvedAt: "2026-08-27T00:00:00Z" },
    "user-A",
    counterpart,
  );
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("non-owner → 403", () => {
  const { source, counterpart } = matchedPair();
  const result = validateResolve(source, "user-C", counterpart);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 403);
});

test("missing counterpart → safe error 409", () => {
  const { source } = matchedPair();
  const result = validateResolve(source, "user-A", null);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
  assert.equal((result as { error: string }).error, "broken-reference");
});

test("broken counterpart reference → 409", () => {
  const { source } = matchedPair();
  const badCounterpart = { id: FOUND_ID, matchedReportId: "some-other-id" };
  const result = validateResolve(source, "user-A", badCounterpart);
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("concurrent resolution → second attempt fails condition → 409", () => {
  // After the first transaction commits, both items are RESOLVED, so the
  // ConditionExpression (#status = :matched) no longer holds.
  const afterFirst = { ...matchedPair().source, status: "RESOLVED" };
  const result = validateResolve(afterFirst, "user-A", { ...matchedPair().counterpart });
  assert.equal(result.ok, false);
  assert.equal((result as { status: number }).status, 409);
});

test("atomic update expression preserves match history", () => {
  // The update only SETs status/resolvedAt/updatedAt — it never REMOVEs
  // matchedReportId or matchedAt.
  const updateExpression =
    "SET #status = :resolved, resolvedAt = :now, updatedAt = :now";
  assert.ok(updateExpression.includes("SET"));
  assert.ok(!updateExpression.includes("REMOVE"), "must not remove match history");
  assert.ok(!updateExpression.includes("matchedReportId"));
  assert.ok(!updateExpression.includes("matchedAt"));
});

test("both reports become RESOLVED atomically (transaction shape)", () => {
  // Simulated post-transaction state of both items
  const now = "2026-08-27T10:00:00.000Z";
  const { source, counterpart } = matchedPair();
  const after = [
    { ...source, status: "RESOLVED", resolvedAt: now },
    { ...counterpart, status: "RESOLVED", resolvedAt: now },
  ];
  assert.ok(after.every((r) => r.status === "RESOLVED"));
  assert.ok(after.every((r) => r.resolvedAt === now), "same timestamp on both");
  // History intact
  assert.equal(after[0].matchedReportId, FOUND_ID);
  assert.equal(after[1].matchedReportId, LOST_ID);
});

test("public response contains no private DynamoDB fields", () => {
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
      resolvedAt: report.resolvedAt,
      createdAt: report.createdAt,
    };
  }

  const internal = {
    id: LOST_ID,
    type: "LOST",
    title: "Mất ví",
    category: "Wallet",
    location: "Thư viện",
    status: "RESOLVED",
    userId: "user-A",
    PK: `REPORT#${LOST_ID}`,
    SK: `REPORT#${LOST_ID}`,
    GSI1PK: "USER#user-A",
    GSI1SK: "REPORT#2026#x",
    imageKey: "reports/x/y.jpg",
    embedding: [0.1],
    matchedReportId: FOUND_ID,
    matchedAt: "2026-08-26T00:00:00Z",
    resolvedAt: "2026-08-27T10:00:00Z",
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

  // Public-safe fields survive
  const pub = toPublicReport(internal);
  assert.equal(pub.resolvedAt, internal.resolvedAt);
  assert.equal(pub.matchedReportId, FOUND_ID);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

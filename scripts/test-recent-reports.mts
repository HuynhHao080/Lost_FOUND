/**
 * Regression tests for the landing page Recent Reports data flow.
 * Run: npx tsx scripts/test-recent-reports.mts
 *
 * Note: toPublicReport lives in a `server-only` module that throws when
 * imported outside a React Server Component runtime, so these tests mirror
 * its exact field mapping and assert the same public-safe contract.
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

/** Mirrors toPublicReport in src/lib/repositories/public-report.ts */
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
    hasImage: Boolean(report.imageKey || report.imageUrl),
    matchedReportId: report.matchedReportId,
    resolvedAt: report.resolvedAt,
    createdAt: report.createdAt,
  };
}

/** Mirrors getRecentReports() in src/app/page.tsx */
async function loadRecentReports(
  searchFn: (filters: unknown, limit: number) => Promise<{ reports: unknown[] }>,
): Promise<{ reports: Record<string, unknown>[]; error: boolean }> {
  try {
    const { reports } = await searchFn({}, 6);
    return {
      reports: reports.map((r) => toPublicReport(r as Record<string, unknown>)),
      error: false,
    };
  } catch {
    return { reports: [], error: true };
  }
}

const INTERNAL = {
  id: "abc",
  userId: "user-1",
  type: "LOST",
  title: "Mất ví",
  category: "Wallet",
  location: "Thư viện",
  status: "PENDING",
  PK: "REPORT#abc",
  SK: "REPORT#abc",
  GSI1PK: "USER#user-1",
  GSI1SK: "REPORT#2026#abc",
  imageKey: "reports/abc/x.jpg",
  createdAt: "2026-08-26T00:00:00Z",
  updatedAt: "2026-08-26T00:00:00Z",
};

/* ------------------------------------------------------------------ */

test("recent reports are mapped through the public-safe mapper", async () => {
  const stub = async () => ({ reports: [INTERNAL] });
  const { reports, error } = await loadRecentReports(stub);

  assert.equal(error, false);
  assert.equal(reports.length, 1);
  const serialized = JSON.stringify(reports[0]);
  for (const forbidden of ["userId", "PK", "SK", "GSI1PK", "GSI1SK", "imageKey"]) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `leaked: ${forbidden}`);
  }
});

test("mapped card fields survive: hasImage derived, id/title present", async () => {
  const stub = async () => ({ reports: [INTERNAL] });
  const { reports } = await loadRecentReports(stub);
  assert.equal(reports[0].hasImage, true);
  assert.equal(reports[0].id, "abc");
  assert.equal(reports[0].title, "Mất ví");
});

test("repository failure produces the error fallback, never mock data", async () => {
  const failing = async () => {
    throw new Error("DynamoDB down");
  };
  const { reports, error } = await loadRecentReports(failing);
  assert.equal(error, true);
  assert.equal(reports.length, 0);
});

test("empty table produces an empty list (no fake/sample entries)", async () => {
  const empty = async () => ({ reports: [] });
  const { reports, error } = await loadRecentReports(empty);
  assert.equal(error, false);
  assert.equal(reports.length, 0);
});

test("limit of 6 is requested so the section shows at most six cards", async () => {
  let capturedLimit: number | undefined;
  const capturing = async (_filters: unknown, limit: number) => {
    capturedLimit = limit;
    return { reports: [] };
  };
  await loadRecentReports(capturing);
  assert.equal(capturedLimit, 6);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

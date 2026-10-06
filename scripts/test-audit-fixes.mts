/**
 * Audit regression tests for issues found during the production-readiness review.
 * Run: npx tsx scripts/test-audit-fixes.mts
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

/** Mirrors decodeNotificationId in notification-repository.ts */
function decodeNotificationId(raw: string): string | null {
  if (!raw) return null;
  const value = decodeURIComponent(raw);
  return value.startsWith("NOTIF#") ? value.slice("NOTIF#".length) : value;
}

/** Mirrors the limit parsing in GET /api/reports */
function parseLimit(raw: string | null): { ok: true; value: number } | { ok: false } {
  const parsed = Number.parseInt(raw ?? "50", 10);
  if (Number.isNaN(parsed) || parsed < 1) return { ok: false };
  return { ok: true, value: Math.min(parsed, 100) };
}

const STORED_ID =
  "MATCH_CONFIRMED#08164a32-2d9d-47f7-8e3c-940e9a5fe1d0#37c1fefc-81db-4a4a-a3e9-9b5d82a49a7c#2026-08-27";

test("mark-read decodes the bare notification id as returned by the API", () => {
  assert.equal(decodeNotificationId(STORED_ID), STORED_ID);
});

test("mark-read still accepts the legacy NOTIF#-prefixed form", () => {
  assert.equal(decodeNotificationId(`NOTIF#${STORED_ID}`), STORED_ID);
});

test("mark-read handles URL-encoded ids", () => {
  const encoded = encodeURIComponent(STORED_ID);
  assert.equal(decodeNotificationId(encoded), STORED_ID);
});

test("mark-read rejects empty input", () => {
  assert.equal(decodeNotificationId(""), null);
});

test("limit parsing rejects non-numeric values (previously NaN → DynamoDB error)", () => {
  assert.equal(parseLimit("abc").ok, false);
  assert.equal(parseLimit("").ok, false);
});

test("limit parsing rejects zero and negatives", () => {
  assert.equal(parseLimit("0").ok, false);
  assert.equal(parseLimit("-5").ok, false);
});

test("limit parsing clamps to 100 and defaults to 50", () => {
  assert.equal(parseLimit(null).value, 50);
  assert.equal(parseLimit("500").value, 100);
  assert.equal(parseLimit("10").value, 10);
});

/** Mirrors the notifications route's clamping fallback */
function parseNotifLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "30", 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 30, 1), 50);
}

test("notifications limit falls back safely on invalid values (never NaN)", () => {
  assert.equal(parseNotifLimit("abc"), 30);
  assert.equal(parseNotifLimit("NaN"), 30);
  assert.equal(parseNotifLimit(null), 30);
});

test("notifications limit is bounded to [1, 50]", () => {
  assert.equal(parseNotifLimit("-1"), 1);
  assert.equal(parseNotifLimit("0"), 1);
  assert.equal(parseNotifLimit("999999"), 50);
  assert.equal(parseNotifLimit("25"), 25);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

/**
 * Regression tests for validation gaps found in the hardening audit.
 * Run: npx tsx scripts/test-validation.mts
 */

import assert from "node:assert/strict";
import { ReportSchema } from "../src/lib/validations/report.ts";

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

const VALID = {
  type: "LOST",
  title: "Mất ví",
  category: "Wallet",
  location: "Thư viện",
};

test("valid report passes", () => {
  const r = ReportSchema.safeParse(VALID);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("malformed dateOccurred is rejected (previously stored verbatim)", () => {
  for (const bad of ["not-a-date", "32/13/2026", "yesterday"]) {
    const r = ReportSchema.safeParse({ ...VALID, dateOccurred: bad });
    assert.ok(!r.success, `"${bad}" should be rejected`);
  }
});

test("valid ISO date is accepted", () => {
  const r = ReportSchema.safeParse({ ...VALID, dateOccurred: "2026-08-26" });
  assert.ok(r.success);
});

test("empty-string dateOccurred is treated as absent", () => {
  const r = ReportSchema.safeParse({ ...VALID, dateOccurred: "" });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("whitespace-only title is rejected (previously passed as non-empty)", () => {
  const r = ReportSchema.safeParse({ ...VALID, title: "   " });
  assert.ok(!r.success);
});

test("whitespace-only location is rejected", () => {
  const r = ReportSchema.safeParse({ ...VALID, location: "   " });
  assert.ok(!r.success);
});

test("title/location are trimmed after validation", () => {
  const r = ReportSchema.safeParse({ ...VALID, title: "  Mất ví  ", location: " Thư viện " });
  assert.ok(r.success);
  assert.equal(r.data?.title, "Mất ví");
  assert.equal(r.data?.location, "Thư viện");
});

test("invalid type still rejected", () => {
  const r = ReportSchema.safeParse({ ...VALID, type: "STOLEN" });
  assert.ok(!r.success);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

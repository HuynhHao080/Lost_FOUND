/**
 * Matching quality regression tests.
 * Run: npx tsx scripts/test-matching-quality.mts
 */

import assert from "node:assert/strict";
import {
  calculateMatchScore,
  combineScores,
  MATCH_THRESHOLD,
  type MatchableReport,
} from "../src/lib/matching/matching.ts";

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

function lost(overrides: Partial<MatchableReport> = {}): MatchableReport {
  return {
    id: "l",
    type: "LOST",
    title: "",
    category: "Wallet",
    location: "",
    status: "PENDING",
    ...overrides,
  };
}

function found(overrides: Partial<MatchableReport> = {}): MatchableReport {
  return {
    id: "f",
    type: "FOUND",
    title: "",
    category: "Wallet",
    location: "",
    status: "PENDING",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */

test("same category but unrelated descriptions → low score", () => {
  const a = lost({ title: "Mất ví da đen", description: "Cái ví da màu đen của tôi" });
  const b = found({
    title: "Found silver necklace",
    description: "A silver chain near the fountain",
  });
  const { score } = calculateMatchScore(a, b);
  // Category +35 only; contradiction penalty −10 → 25
  assert.ok(score < MATCH_THRESHOLD, `expected below display threshold, got ${score}`);
});

test("same category + different location → reduced confidence", () => {
  const a = lost({
    title: "Lost black wallet",
    description: "Black leather wallet with cards",
    location: "Library",
    dateOccurred: "2026-08-26",
  });
  const b = found({
    title: "Black wallet found",
    description: "Black leather wallet containing cards",
    location: "Sports Hall",
    dateOccurred: "2026-08-26",
  });
  const result = calculateMatchScore(a, b);
  // Category 35 + same date 20 + strong text 15 − different-location penalty 5 = 65
  assert.equal(result.score, 65);
  assert.ok(result.reasons.includes("Different locations reported"));
});

test("same category + nearby date (within 3 days) → moderate score", () => {
  const a = lost({
    title: "Lost black wallet",
    description: "Black leather wallet",
    location: "Thư viện",
    dateOccurred: "2026-08-26",
  });
  const b = found({
    title: "Black wallet in library",
    description: "Found a black leather wallet",
    location: "Thu vien",
    dateOccurred: "2026-08-28",
  });
  const result = calculateMatchScore(a, b);
  // Category 35 + location 30 + within-3-days 10 + text overlap 15 = 90
  assert.ok(result.score >= 80, `expected high, got ${result.score}`);
});

test("highly similar descriptions but different category → capped by missing category", () => {
  const pair = {
    a: lost({
      title: "Lost black leather wallet",
      description: "Black leather wallet with cards and cash inside",
      location: "Library",
      dateOccurred: "2026-08-26",
    }),
    b: {
      ...found({
        title: "Black leather wallet found",
        description: "Found a black leather wallet with cards and cash",
        location: "Library",
        dateOccurred: "2026-08-26",
      }),
      category: "Bag",
    },
  };
  const result = calculateMatchScore(pair.a, pair.b);
  // No category points: location 30 + date 20 + text 15 = 65
  assert.equal(result.score, 65);
  assert.ok(!result.reasons.includes("Same category"));
});

test("exact strong match → very high score", () => {
  const a = lost({
    title: "Mất ví",
    description: "Ví màu đen",
    category: "Wallet",
    location: "Thư viện",
    dateOccurred: "2026-08-26",
  });
  const b = found({
    title: "Tìm thấy ví màu đen",
    description: "Tìm thấy một chiếc ví màu đen ở thư viện",
    category: "Wallet",
    location: "Thư viện",
    dateOccurred: "2026-08-26",
  });
  const result = calculateMatchScore(a, b);
  assert.equal(result.score, 100, `expected 100, got ${result.score}`);
});

test("completely unrelated reports → 0", () => {
  const a = lost({
    title: "Mất chìa khóa xe",
    description: "Chìa khóa Honda",
    category: "Keys",
    location: "Nhà xe",
  });
  const b = found({
    title: "Found umbrella",
    description: "Blue umbrella",
    category: "Other",
    location: "Canteen",
  });
  const { score } = calculateMatchScore(a, b);
  assert.equal(score, 0);
});

test("hybrid combination stays within 0–100 and preserves the demo match", () => {
  // Deterministic 100 with perfect semantic similarity → 100
  const perfect = combineScores(100, 1);
  assert.equal(perfect.score, 100);

  // Deterministic 65 with good semantic similarity stays confirmable
  const partial = combineScores(65, 0.8);
  assert.ok(partial.score >= CONFIRM_THRESHOLD, `got ${partial.score}`);

  // Deterministic 25 (category-only, penalized) even with great semantics
  // cannot exceed the mid range — semantic complements, not overrides.
  const weak = combineScores(25, 0.95);
  assert.ok(weak.score < CONFIRM_THRESHOLD, `got ${weak.score}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

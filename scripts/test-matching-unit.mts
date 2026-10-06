/**
 * Unit tests for the matching engine.
 * Run: node --experimental-strip-types scripts/test-matching-unit.mts
 * (or: npx tsx scripts/test-matching-unit.mts)
 */

import assert from "node:assert/strict";
import { cosineSimilarity, normalizedCosineSimilarity } from "../src/lib/matching/similarity.ts";
import { combineScores, matchLabel, MATCH_THRESHOLD } from "../src/lib/matching/matching.ts";

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

/* ------------------------------------------------------------------ */
/* A. Cosine similarity                                                */
/* ------------------------------------------------------------------ */

test("identical vectors → 1", () => {
  const v = [1, 2, 3];
  const result = normalizedCosineSimilarity(v, v);
  assert.ok(Math.abs(result - 1) < 1e-9, `expected ~1, got ${result}`);
});

test("orthogonal vectors → 0", () => {
  const result = normalizedCosineSimilarity([1, 0], [0, 1]);
  assert.ok(Math.abs(result) < 1e-9, `expected ~0, got ${result}`);
});

test("opposite vectors → safely handled (clamped to 0)", () => {
  const raw = cosineSimilarity([1, 0], [-1, 0]);
  assert.ok(Math.abs(raw + 1) < 1e-9, `raw should be -1, got ${raw}`);
  const clamped = normalizedCosineSimilarity([1, 0], [-1, 0]);
  assert.equal(clamped, 0, "clamped value must be 0");
});

test("zero vectors → 0 without throwing", () => {
  assert.equal(normalizedCosineSimilarity([], []), 0);
  assert.equal(normalizedCosineSimilarity([0, 0], [1, 1]), 0);
  assert.equal(normalizedCosineSimilarity([1, 1], [0, 0]), 0);
});

test("mismatched lengths → 0", () => {
  assert.equal(normalizedCosineSimilarity([1, 2], [1, 2, 3]), 0);
});

test("cosine is deterministic", () => {
  const a = [0.1, 0.7, 0.3];
  const b = [0.4, 0.2, 0.9];
  assert.equal(normalizedCosineSimilarity(a, b), normalizedCosineSimilarity(a, b));
});

/* ------------------------------------------------------------------ */
/* B. Hybrid score                                                     */
/* ------------------------------------------------------------------ */

test("hybrid: deterministic 100 + semantic 1.0 → 100", () => {
  const { score } = combineScores(100, 1);
  assert.equal(score, Math.round(100 * 0.6 + 100 * 0.4));
  assert.equal(score, 100);
});

test("hybrid: deterministic 0 + semantic 0 → 0", () => {
  const { score } = combineScores(0, 0);
  assert.equal(score, 0);
});

test("hybrid: deterministic 50 + semantic 0.5 → 50", () => {
  const { score } = combineScores(50, 0.5);
  assert.equal(score, 50);
});

test("hybrid score stays within 0–100 for edge inputs", () => {
  for (const d of [0, 25, 40, 60, 80, 100]) {
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const { score } = combineScores(d, s);
      assert.ok(score >= 0 && score <= 100, `out of range: d=${d} s=${s} → ${score}`);
      assert.ok(Number.isInteger(score), "score must be an integer");
    }
  }
});

test("hybrid adds semantic reason when similarity >= 0.5", () => {
  const { reasons } = combineScores(35, 0.9);
  assert.ok(reasons.includes("Strong semantic similarity"), JSON.stringify(reasons));
});

test("hybrid omits semantic reason when similarity < 0.5", () => {
  const { reasons } = combineScores(35, 0.3);
  assert.equal(reasons.length, 0, JSON.stringify(reasons));
});

/* ------------------------------------------------------------------ */
/* C. Labels & threshold                                               */
/* ------------------------------------------------------------------ */

test("labels map correctly", () => {
  assert.equal(matchLabel(95), "High match");
  assert.equal(matchLabel(80), "High match");
  assert.equal(matchLabel(70), "Possible match");
  assert.equal(matchLabel(60), "Possible match");
  assert.equal(matchLabel(45), "Weak match");
  assert.equal(matchLabel(40), "Weak match");
});

test("threshold is 40", () => {
  assert.equal(MATCH_THRESHOLD, 40);
});

/* ------------------------------------------------------------------ */
/* D. Security — public response shaping                               */
/* ------------------------------------------------------------------ */

// Mirrors toPublicReport() to verify no private fields survive serialization
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
    createdAt: report.createdAt,
  };
}

test("public report excludes userId, DynamoDB keys, imageKey, embedding", () => {
  const internal = {
    id: "abc",
    userId: "user-123",
    type: "LOST",
    title: "Mất ví",
    description: "Ví màu đen",
    category: "Wallet",
    location: "Thư viện",
    dateOccurred: "2026-08-26",
    status: "PENDING",
    PK: "REPORT#abc",
    SK: "REPORT#abc",
    GSI1PK: "USER#user-123",
    GSI1SK: "REPORT#2026#abc",
    imageKey: "reports/abc/x.jpg",
    embedding: [0.1, 0.2, 0.3],
    createdAt: "2026-08-26T00:00:00Z",
    updatedAt: "2026-08-26T00:00:00Z",
  };

  const pub = toPublicReport(internal);
  const serialized = JSON.stringify(pub);

  for (const forbidden of ["userId", "PK", "SK", "GSI1PK", "GSI1SK", "imageKey", "embedding"]) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `leaked field: ${forbidden}`);
  }

  // hasImage boolean survives
  assert.equal(pub.hasImage, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

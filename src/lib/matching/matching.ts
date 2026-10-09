/**
 * Deterministic matching engine for Lost & Found reports.
 *
 * Pure functions only — no AWS, no React, no I/O. This keeps the algorithm
 * unit-testable and easy to explain in a report.
 *
 * Scoring (max 100):
 *   A. Category match        +35 / 0
 *   B. Location match        +30 / 0   (normalized comparison)
 *   C. Date proximity        +20..0    (same day / 1d / 3d / 7d)
 *   D. Text similarity       +15..0    (word overlap on title+description)
 */

import type { Report } from "@/lib/repositories/report-repository";

/** Reports that can participate in matching (subset of full Report). */
export type MatchableReport = Pick<
  Report,
  "id" | "type" | "title" | "category" | "location" | "status"
> &
  Partial<Pick<Report, "description" | "dateOccurred">>;

export interface MatchResult {
  score: number;
  reasons: string[];
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Common English stop words ignored during text similarity.
 * Vietnamese has no short articles; the list below covers the frequent
 * Vietnamese function words used in this app's data plus English basics.
 */
const STOP_WORDS = new Set([
  // English
  "a",
  "an",
  "and",
  "the",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "is",
  "was",
  "were",
  "my",
  "i",
  "it",
  "this",
  "that",
  "be",
  "been",
  "have",
  "has",
  // Vietnamese function words
  "cua",
  "va",
  "la",
  "o",
  "trong",
  "mot",
  "một",
  "cho",
  "voi",
  "được",
  "duoc",
  "co",
  "có",
  "khong",
  "không",
  "da",
  "đã",
  "se",
  "sẽ",
  "tui",
  "minh",
  "mình",
  "nay",
  "roi",
  "rồi",
  "thi",
  "thì",
  "ma",
  "mà",
  "tu",
  "từ",
  "den",
  "đến",
]);

/**
 * Normalizes text for comparison:
 * - lowercase (Vietnamese diacritics preserved)
 * - punctuation removed
 * - whitespace collapsed
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'<>[\]\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts meaningful words from text for similarity comparison.
 */
function meaningfulWords(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Normalizes location strings so that e.g. "Thư viện", "thư viện" and
 * " THƯ VIỆN " all compare equal. Diacritics are folded because users may
 * type locations with or without them ("Thu vien" vs "Thư viện").
 */
function normalizeLocation(location: string): string {
  return normalizeText(location)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Signal scoring                                                      */
/* ------------------------------------------------------------------ */

function categoryScore(
  a: MatchableReport,
  b: MatchableReport,
): { points: number; reason?: string } {
  if (a.category === b.category) {
    return { points: 35, reason: "Cùng danh mục" };
  }
  return { points: 0 };
}

function locationScore(
  a: MatchableReport,
  b: MatchableReport,
): { points: number; reason?: string } {
  const same = normalizeLocation(a.location) === normalizeLocation(b.location);
  if (same && a.location.trim().length > 0) {
    return { points: 30, reason: "Cùng địa điểm" };
  }
  return { points: 0 };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateScore(a: MatchableReport, b: MatchableReport): { points: number; reason?: string } {
  if (!a.dateOccurred || !b.dateOccurred) {
    return { points: 0 };
  }

  const dateA = new Date(a.dateOccurred);
  const dateB = new Date(b.dateOccurred);
  if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
    return { points: 0 };
  }

  const diffDays = Math.abs(dateA.getTime() - dateB.getTime()) / DAY_MS;

  if (diffDays < 1) return { points: 20, reason: "Xảy ra cùng ngày" };
  if (diffDays <= 1) return { points: 15, reason: "Xảy ra trong vòng 1 ngày" };
  if (diffDays <= 3) return { points: 10, reason: "Xảy ra trong vòng 3 ngày" };
  if (diffDays <= 7) return { points: 5, reason: "Xảy ra trong vòng 7 ngày" };
  return { points: 0 };
}

function textScore(a: MatchableReport, b: MatchableReport): { points: number; reason?: string } {
  const textA = `${a.title} ${a.description ?? ""}`;
  const textB = `${b.title} ${b.description ?? ""}`;

  const wordsA = new Set(meaningfulWords(textA));
  const wordsB = new Set(meaningfulWords(textB));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return { points: 0 };
  }

  // Jaccard-style overlap over the smaller set
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  const overlapRatio = overlap / Math.min(wordsA.size, wordsB.size);

  if (overlapRatio >= 0.5) return { points: 15, reason: "Mô tả rất giống nhau" };
  if (overlapRatio >= 0.25) return { points: 10, reason: "Mô tả khá giống nhau" };
  if (overlapRatio > 0) return { points: 5, reason: "Mô tả hơi giống nhau" };
  return { points: 0 };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Minimum score for a candidate to be returned by the API. */
export const MATCH_THRESHOLD = 40;

/** Weight of the deterministic score in the hybrid combination. */
const DETERMINISTIC_WEIGHT = 0.6;
/** Weight of the semantic score in the hybrid combination. */
const SEMANTIC_WEIGHT = 0.4;

/**
 * How semantic similarity contributed, for reason strings.
 */
function semanticReason(similarity: number): string {
  if (similarity >= 0.8) return "Nội dung rất tương đồng";
  if (similarity >= 0.6) return "Nội dung khá tương đồng";
  return "Nội dung hơi tương đồng";
}

/**
 * Combines deterministic and semantic scores.
 *
 * combinedScore = deterministic * 0.6 + (cosineSimilarity * 100) * 0.4
 *
 * Rounded to an integer and clamped to [0, 100].
 */
export function combineScores(
  deterministicScore: number,
  semanticSimilarity: number,
): { score: number; reasons: string[] } {
  const semanticScore = semanticSimilarity * 100;
  const combined = deterministicScore * DETERMINISTIC_WEIGHT + semanticScore * SEMANTIC_WEIGHT;

  const reasons: string[] = [];
  if (semanticSimilarity >= 0.5) {
    reasons.push(semanticReason(semanticSimilarity));
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(combined))),
    reasons,
  };
}

/**
 * Calculates the match score between two reports.
 * The caller is responsible for ensuring opposite types.
 */
export function calculateMatchScore(
  reportA: MatchableReport,
  reportB: MatchableReport,
): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  const category = categoryScore(reportA, reportB);
  const location = locationScore(reportA, reportB);
  const date = dateScore(reportA, reportB);
  const text = textScore(reportA, reportB);

  const signals = [category, location, date, text];

  for (const signal of signals) {
    score += signal.points;
    if (signal.reason) reasons.push(signal.reason);
  }

  // Contradiction penalty: category alone is weak evidence. A pair that only
  // shares a category (no location, date or text agreement) is very likely a
  // different item, so cap it below the confirmation threshold.
  const corroboratingSignals = [location.points > 0, date.points > 0, text.points > 0].filter(
    Boolean,
  ).length;
  if (category.points > 0 && corroboratingSignals === 0) {
    score -= 10;
    reasons.push("Khác địa điểm và thời gian");
  } else if (location.points === 0 && date.points > 0 && text.points > 0) {
    // Date + text agree but the place differs — plausible but less certain
    score -= 5;
    reasons.push("Địa điểm báo khác nhau");
  }

  return { score: Math.max(0, Math.min(score, 100)), reasons };
}

/**
 * Human-readable strength label for a score.
 */
export function matchLabel(score: number): string {
  if (score >= 80) return "Khớp cao";
  if (score >= 60) return "Có thể khớp";
  return "Khớp yếu";
}

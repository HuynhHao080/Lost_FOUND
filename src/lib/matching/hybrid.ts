import "server-only";
import type { Report } from "@/lib/repositories/report-repository";
import { calculateMatchScore, combineScores, matchLabel } from "@/lib/matching/matching";
import { normalizedCosineSimilarity } from "@/lib/matching/similarity";
import {
  isBedrockConfigured,
  generateEmbedding,
  buildReportEmbeddingText,
} from "@/lib/aws/bedrock";

/**
 * Hybrid matching orchestrator.
 *
 * Flow:
 *   1. Deterministic scoring for ALL candidates (cheap, always runs)
 *   2. Rank by deterministic score, take the top N for semantic scoring
 *      (cost control — never embed unlimited reports)
 *   3. If Bedrock succeeds: combined = deterministic*0.6 + semantic*0.4
 *      If Bedrock fails: deterministic score alone (graceful fallback)
 */

/** Max candidates sent to Bedrock per request (cost control). */
const MAX_SEMANTIC_CANDIDATES = 20;

export interface ScoredMatch {
  report: Report;
  score: number;
  label: string;
  reasons: string[];
}

export interface MatchingOutcome {
  matches: ScoredMatch[];
  matchingMode: "hybrid" | "deterministic";
}

/**
 * Runs hybrid matching between a source report and its candidates.
 */
export async function runHybridMatching(
  source: Report,
  candidates: Report[],
): Promise<MatchingOutcome> {
  // Stage 1: deterministic scoring for every candidate
  const staged = candidates.map((candidate) => ({
    candidate,
    deterministic: calculateMatchScore(source, candidate),
  }));

  const useSemantic = isBedrockConfigured();

  if (!useSemantic) {
    return finalize(staged, "deterministic");
  }

  // Stage 2: pick the strongest deterministic candidates for Bedrock
  const shortlist = [...staged]
    .sort((a, b) => b.deterministic.score - a.deterministic.score)
    .slice(0, MAX_SEMANTIC_CANDIDATES);

  try {
    // Generate embeddings (source + shortlist). Any failure falls back.
    const [sourceEmbedding, ...candidateEmbeddings] = await Promise.all([
      generateEmbedding(buildReportEmbeddingText(source)),
      ...shortlist.map((s) => generateEmbedding(buildReportEmbeddingText(s.candidate))),
    ]);

    if (!sourceEmbedding) {
      return finalize(staged, "deterministic");
    }

    // Stage 3: combine scores
    const enriched = shortlist.map((item, i) => {
      const embedding = candidateEmbeddings[i];
      if (!embedding) {
        return { ...item, semanticSimilarity: null as number | null };
      }
      return {
        ...item,
        semanticSimilarity: normalizedCosineSimilarity(sourceEmbedding, embedding),
      };
    });

    // Candidates outside the shortlist keep deterministic-only scores
    const shortlistIds = new Set(shortlist.map((s) => s.candidate.id));
    const rest = staged.filter((s) => !shortlistIds.has(s.candidate.id));

    return finalize(enriched, "hybrid", rest);
  } catch {
    // Any unexpected failure → deterministic fallback
    console.warn("[matching] Bedrock unavailable; using deterministic score");
    return finalize(staged, "deterministic");
  }
}

/**
 * Builds final scored matches from staged results.
 *
 * @param staged - items with deterministic scores and optional semantic similarity
 * @param mode - which pipeline produced these scores
 * @param rest - additional deterministic-only items (hybrid mode only)
 */
function finalize(
  staged: Array<{
    candidate: Report;
    deterministic: { score: number; reasons: string[] };
    semanticSimilarity?: number | null;
  }>,
  mode: "hybrid" | "deterministic",
  rest: Array<{
    candidate: Report;
    deterministic: { score: number; reasons: string[] };
    semanticSimilarity?: number | null;
  }> = [],
): MatchingOutcome {
  const all = [...staged, ...rest];
  const matches: ScoredMatch[] = [];

  for (const item of all) {
    let score: number;
    let reasons: string[];

    if (mode === "hybrid" && typeof item.semanticSimilarity === "number") {
      const combined = combineScores(item.deterministic.score, item.semanticSimilarity);
      score = combined.score;
      reasons = [...item.deterministic.reasons, ...combined.reasons];
    } else {
      score = item.deterministic.score;
      reasons = item.deterministic.reasons;
    }

    if (score >= 40) {
      matches.push({
        report: item.candidate,
        score,
        label: matchLabel(score),
        reasons,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return { matches, matchingMode: mode };
}

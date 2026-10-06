/**
 * Pure vector math for semantic matching. No external dependencies.
 */

/**
 * Cosine similarity between two vectors.
 *
 * Returns a value in [-1, 1] mathematically; callers can clamp to [0, 1].
 * Handles zero vectors safely by returning 0 (no similarity).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * Clamps cosine similarity to [0, 1]. Negative similarity (opposite meaning)
 * is treated as no similarity rather than an error.
 */
export function normalizedCosineSimilarity(a: number[], b: number[]): number {
  const raw = cosineSimilarity(a, b);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

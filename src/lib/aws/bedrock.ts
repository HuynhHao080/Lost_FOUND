import "server-only";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

/**
 * Amazon Bedrock embedding client (server-side only).
 *
 * Uses the standard AWS credential provider chain, same as DynamoDB/S3.
 *
 * Required environment variable:
 * - BEDROCK_EMBEDDING_MODEL_ID: e.g. "amazon.titan-embed-text-v2:0"
 *
 * The application must keep working when Bedrock is unavailable — every
 * function here returns null on failure and callers fall back to
 * deterministic matching.
 */

const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_EMBEDDING_MODEL_ID || "";

// Singleton client reusing the shared credential chain
const bedrockClient = new BedrockRuntimeClient({ region: REGION });

/** Request timeout so a hung Bedrock call cannot stall the API. */
const INVOKE_TIMEOUT_MS = 10_000;

/** Maximum input length for Titan Text Embeddings (in characters). */
const MAX_TEXT_CHARS = 4_000;

/**
 * Returns true when semantic matching is configured.
 */
export function isBedrockConfigured(): boolean {
  return MODEL_ID.length > 0;
}

/**
 * Builds the semantic text representation of a report.
 * Contains only matching-relevant fields — never userId or DynamoDB keys.
 */
export function buildReportEmbeddingText(report: {
  type: string;
  title: string;
  category: string;
  location: string;
  description?: string;
  dateOccurred?: string;
}): string {
  const parts = [
    `Type: ${report.type}`,
    `Title: ${report.title}`,
    `Category: ${report.category}`,
    `Location: ${report.location}`,
    report.dateOccurred ? `Date: ${report.dateOccurred}` : "",
    report.description ? `Description: ${report.description}` : "",
  ].filter(Boolean);

  const text = parts.join("\n");
  return text.slice(0, MAX_TEXT_CHARS);
}

interface TitanEmbedResponse {
  embedding?: number[];
}

/**
 * Generates an embedding vector for the given text.
 * Returns null on any failure (caller falls back to deterministic scoring).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!MODEL_ID) return null;
  if (!text.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INVOKE_TIMEOUT_MS);

  try {
    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text }),
    });

    const response = await bedrockClient.send(command, { abortSignal: controller.signal });
    const parsed = JSON.parse(new TextDecoder().decode(response.body)) as TitanEmbedResponse;

    if (!Array.isArray(parsed.embedding) || parsed.embedding.length === 0) {
      return null;
    }
    return parsed.embedding;
  } catch (err) {
    // Sanitized server-side warning only — never surfaced to clients
    console.warn("[matching] Bedrock unavailable; using deterministic score", {
      name: (err as { name?: string })?.name,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

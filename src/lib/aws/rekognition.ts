import "server-only";
import {
  RekognitionClient,
  DetectLabelsCommand,
  DetectModerationLabelsCommand,
} from "@aws-sdk/client-rekognition";

/**
 * Amazon Rekognition image analysis (server-side only).
 *
 * Uses the standard AWS SDK v3 credential provider chain.
 *
 * Required environment variables:
 * - AWS_REGION (default us-east-1)
 * - S3_REPORTS_BUCKET (for object reference, not for direct access)
 *
 * The application must keep working when Rekognition is unavailable —
 * all functions return null on failure so the deterministic matching
 * pipeline remains intact.
 */

const REGION = process.env.AWS_REGION || "us-east-1";

const rekognitionClient = new RekognitionClient({ region: REGION });

/** Maximum number of labels to return per image. */
const MAX_LABELS = 10;

/**
 * Analyzes an image stored in S3 using Amazon Rekognition.
 *
 * @param bucket - The private S3 bucket name
 * @param key - The server-generated object key (e.g. reports/<id>/<uuid>.jpg)
 * @returns Label and moderation results, or null if Rekognition fails.
 */
export async function analyzeImage(
  bucket: string,
  key: string,
): Promise<{
  labels: string[];
  moderationLabels: string[];
} | null> {
  try {
    const [labelsRes, moderationRes] = await Promise.all([
      rekognitionClient.send(
        new DetectLabelsCommand({
          Image: { S3Object: { Bucket: bucket, Name: key } },
          MaxLabels: MAX_LABELS,
          MinConfidence: 70,
        }),
      ),
      rekognitionClient.send(
        new DetectModerationLabelsCommand({
          Image: { S3Object: { Bucket: bucket, Name: key } },
        }),
      ),
    ]);

    const labels = (labelsRes.Labels ?? [])
      .filter((l) => (l.Confidence ?? 0) >= 70)
      .map((l) => l.Name ?? "")
      .filter(Boolean);

    const moderationLabels = (moderationRes.ModerationLabels ?? [])
      .filter((m) => (m.Confidence ?? 0) >= 70)
      .map((m) => m.Name ?? "")
      .filter(Boolean);

    return { labels, moderationLabels };
  } catch (err) {
    console.warn("[rekognition] Analysis failed (will fall back to deterministic):", {
      name: (err as { name?: string })?.name,
    });
    return null;
  }
}

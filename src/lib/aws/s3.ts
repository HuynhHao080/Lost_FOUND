import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 configuration for report image storage.
 *
 * Bucket is private (Block Public Access ON). Images are uploaded by the
 * browser via short-lived presigned PUT URLs and displayed via short-lived
 * presigned GET URLs generated server-side.
 *
 * Required environment variables:
 * - AWS_REGION: AWS region
 * - S3_REPORTS_BUCKET: bucket name for report images
 */

const REGION = process.env.AWS_REGION || "us-east-1";
export const REPORTS_BUCKET = process.env.S3_REPORTS_BUCKET || "";

// Singleton client — reuses the standard AWS credential provider chain
const s3Client = new S3Client({ region: REGION });

/** Allowed image MIME types for uploads. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Maximum upload size: 5 MB. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Presigned URL lifetime. */
const PRESIGN_EXPIRES_SECONDS = 300; // 5 minutes

/**
 * Validates that S3 is configured.
 */
export function validateS3Config(): void {
  if (!REPORTS_BUCKET) {
    throw new Error("S3_REPORTS_BUCKET environment variable is not set");
  }
}

/**
 * Builds a safe S3 object key for a report image.
 * Never uses user-supplied filenames or paths.
 */
export function buildImageKey(reportId: string, contentType: AllowedImageType): string {
  const ext = EXTENSION_BY_TYPE[contentType];
  // crypto.randomUUID avoids any dependency on uuid import here
  const id = globalThis.crypto.randomUUID();
  return `reports/${reportId}/${id}.${ext}`;
}

/**
 * Generates a short-lived presigned PUT URL for direct browser upload.
 */
export async function presignUpload(
  key: string,
  contentType: AllowedImageType,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: REPORTS_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
}

/**
 * Generates a short-lived presigned GET URL for displaying an image.
 */
export async function presignGetUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: REPORTS_BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
}

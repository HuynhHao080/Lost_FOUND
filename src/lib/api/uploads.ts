/**
 * Frontend upload client for report images.
 *
 * Flow: request a presigned PUT URL from the server, then upload the file
 * directly to S3 from the browser. No AWS credentials ever reach the client.
 */

import { ApiError } from "./reports";

/** Allowed image MIME types (mirrors server-side validation). */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Maximum upload size: 5 MB. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export interface PresignResponse {
  uploadUrl: string;
  imageKey: string;
}

/**
 * Client-side pre-check before hitting the API.
 * Returns an error message, or null if the file is acceptable.
 */
export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPEG, PNG, or WebP images are allowed.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "Image must be 5 MB or smaller.";
  }
  if (file.size === 0) {
    return "Selected file is empty.";
  }
  return null;
}

/**
 * Requests a presigned PUT URL for the given report and file.
 */
export async function presignUpload(
  reportId: string,
  file: File,
): Promise<PresignResponse> {
  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportId,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  if (!res.ok) {
    let message = "Failed to prepare upload";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

/**
 * Uploads the file directly to S3 using the presigned URL.
 */
export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!res.ok) {
    throw new ApiError("Upload to storage failed. Please try again.", res.status);
  }
}

/**
 * Attaches an uploaded image key to a report (owner-only PATCH).
 */
export async function attachImage(reportId: string, imageKey: string): Promise<void> {
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageKey }),
  });

  if (!res.ok) {
    let message = "Failed to attach image to report";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }
}

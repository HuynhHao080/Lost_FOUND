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
    return "Chỉ cho phép ảnh JPEG, PNG hoặc WebP.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "Ảnh phải từ 5 MB trở xuống.";
  }
  if (file.size === 0) {
    return "Tệp đã chọn đang trống.";
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
    let message = "Không thể chuẩn bị tải lên";
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
    throw new ApiError("Tải lên kho lưu trữ thất bại. Vui lòng thử lại.", res.status);
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
    let message = "Không thể gắn ảnh vào tin báo";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }
}

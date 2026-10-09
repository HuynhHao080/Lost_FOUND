import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getReportById } from "@/lib/repositories/report-repository";
import {
  validateS3Config,
  buildImageKey,
  presignUpload,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  type AllowedImageType,
} from "@/lib/aws/s3";

/**
 * Validation for the presign request.
 */
const PresignSchema = z.object({
  reportId: z.string().uuid("Mã tin báo không hợp lệ"),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  fileSize: z
    .number()
    .int()
    .min(1, "Tệp đang trống")
    .max(MAX_FILE_SIZE, "Tệp vượt quá giới hạn 5 MB"),
});

/**
 * POST /api/uploads/presign
 *
 * Authenticated endpoint. Returns a short-lived presigned PUT URL so the
 * browser can upload an image directly to the private S3 bucket.
 *
 * The object key is generated server-side; the client never supplies one.
 * Ownership is verified: users can only upload images for their own reports.
 */
export async function POST(request: NextRequest) {
  // Authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  // Configuration
  try {
    validateS3Config();
  } catch {
    return NextResponse.json({ error: "Lỗi cấu hình máy chủ" }, { status: 500 });
  }

  // Validate body
  let body: z.infer<typeof PresignSchema>;
  try {
    const json = await request.json();
    const parsed = PresignSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Yêu cầu không hợp lệ";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    // Ownership check: the report must exist and belong to the caller
    const report = await getReportById(body.reportId);
    if (!report) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const key = buildImageKey(body.reportId, body.contentType as AllowedImageType);
    const uploadUrl = await presignUpload(key, body.contentType as AllowedImageType);

    return NextResponse.json({ uploadUrl, imageKey: key });
  } catch (err) {
    console.error("[POST /api/uploads/presign] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không thể tạo liên kết tải lên" }, { status: 500 });
  }
}

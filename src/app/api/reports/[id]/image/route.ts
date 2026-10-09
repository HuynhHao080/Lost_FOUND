import { NextResponse } from "next/server";
import { getReportById } from "@/lib/repositories/report-repository";
import { presignGetUrl, validateS3Config } from "@/lib/aws/s3";
import { ReportIdSchema } from "@/lib/validations/search";

/**
 * GET /api/reports/[id]/image
 *
 * Public endpoint that redirects to a short-lived presigned GET URL for the
 * report's image. The bucket stays private; only time-limited URLs are issued.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const parsedId = ReportIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Mã tin báo không hợp lệ" }, { status: 400 });
  }

  try {
    validateS3Config();
  } catch {
    return NextResponse.json({ error: "Lỗi cấu hình máy chủ" }, { status: 500 });
  }

  try {
    const report = await getReportById(parsedId.data);
    if (!report || !report.imageKey) {
      return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    }

    // Defensive: never presign a key outside this report's prefix
    if (!report.imageKey.startsWith(`reports/${report.id}/`)) {
      return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    }

    const url = await presignGetUrl(report.imageKey);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[GET /api/reports/:id/image] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}

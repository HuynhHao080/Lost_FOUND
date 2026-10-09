import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getReportById, updateReportImage, updateReportContent } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { validateS3Config } from "@/lib/aws/s3";
import { publishImageEvent } from "@/lib/aws/eventbridge-image";
import { putOutboxEvent } from "@/lib/aws/outbox";
import { ReportIdSchema } from "@/lib/validations/search";
import { ReportSchema } from "@/lib/validations/report";

/**
 * Only permitted fields may be updated. The client can never touch
 * userId, PK, SK, GSI1PK, GSI1SK, createdAt, type, or status.
 */
const PatchSchema = z
  .object({
    imageKey: z
      .string()
      .regex(
        /^reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/,
        "Mã ảnh không hợp lệ",
      )
      .optional(),
    title: ReportSchema.shape.title.optional(),
    description: ReportSchema.shape.description.optional(),
    category: ReportSchema.shape.category.optional(),
    location: ReportSchema.shape.location.optional(),
    dateOccurred: ReportSchema.shape.dateOccurred.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Không có trường nào để cập nhật",
  });

/**
 * GET /api/reports/[id]
 *
 * Public (unauthenticated) endpoint returning a single report's public-safe fields.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const parsedId = ReportIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Mã tin báo không hợp lệ" }, { status: 400 });
  }

  try {
    const report = await getReportById(parsedId.data);
    if (!report) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }
    return NextResponse.json({ report: toPublicReport(report) });
  } catch (err) {
    console.error("[GET /api/reports/:id] DynamoDB error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không tải được tin báo" }, { status: 500 });
  }
}

/**
 * PATCH /api/reports/[id]
 *
 * Authenticated. Owner-only. Supports attaching an uploaded image key
 * (imageKey) and/or updating the editable content fields (title, description,
 * category, location, dateOccurred).
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let data: z.infer<typeof PatchSchema>;
  try {
    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Yêu cầu không hợp lệ";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    data = parsed.data;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    const report = await getReportById(id);
    if (!report) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    const { imageKey, ...content } = data;

    if (imageKey !== undefined) {
      try {
        validateS3Config();
      } catch {
        return NextResponse.json({ error: "Lỗi cấu hình máy chủ" }, { status: 500 });
      }

      // The key must belong to this report (prevents cross-report key reuse)
      if (!imageKey.startsWith(`reports/${report.id}/`)) {
        return NextResponse.json({ error: "Mã ảnh không thuộc tin báo này" }, { status: 400 });
      }

      const updated = await updateReportImage(report.id, imageKey);

      // Publish image-uploaded event for async Rekognition analysis.
      // Non-fatal: if EventBridge is unavailable the outbox/worker can retry.
      try {
        const occurredAt = new Date().toISOString();
        const eventId = `IMAGE_UPLOADED#${report.id}#${imageKey}`;
        await putOutboxEvent({
          id: eventId,
          eventType: "IMAGE_UPLOADED",
          reportId: report.id,
          imageKey,
          userId: report.userId,
          occurredAt,
          status: "PENDING",
        });
        await publishImageEvent({
          eventId,
          eventType: "IMAGE_UPLOADED",
          occurredAt,
          reportId: report.id,
          imageKey,
        });
      } catch {
        // Silently continue — the image is already attached to DynamoDB.
      }

      // Public-safe shape only — no userId or DynamoDB keys
      return NextResponse.json(updated ? toPublicReport(updated) : null);
    }

    // Content update — only validated, provided fields are written
    const updated = await updateReportContent(report.id, content);
    return NextResponse.json(updated ? toPublicReport(updated) : null);
  } catch (err) {
    console.error("[PATCH /api/reports/:id] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không thể cập nhật tin báo" }, { status: 500 });
  }
}

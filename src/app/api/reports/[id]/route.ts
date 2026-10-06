import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getReportById, updateReportImage } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { validateS3Config } from "@/lib/aws/s3";
import { publishImageEvent } from "@/lib/aws/eventbridge-image";
import { putOutboxEvent } from "@/lib/aws/outbox";
import { ReportIdSchema } from "@/lib/validations/search";

/**
 * Only permitted fields may be updated. The client can never touch
 * userId, PK, SK, GSI1PK, GSI1SK, createdAt, type, or status.
 */
const PatchSchema = z.object({
  imageKey: z
    .string()
    .regex(
      /^reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/,
      "Invalid image key",
    ),
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
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  }

  try {
    const report = await getReportById(parsedId.data);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ report: toPublicReport(report) });
  } catch (err) {
    console.error("[GET /api/reports/:id] DynamoDB error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

/**
 * PATCH /api/reports/[id]
 *
 * Authenticated. Owner-only. Currently supports attaching an uploaded
 * image key to the report.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let imageKey: string;
  try {
    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    imageKey = parsed.data.imageKey;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    validateS3Config();
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const report = await getReportById(id);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The key must belong to this report (prevents cross-report key reuse)
    if (!imageKey.startsWith(`reports/${report.id}/`)) {
      return NextResponse.json({ error: "Invalid image key for this report" }, { status: 400 });
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
  } catch (err) {
    console.error("[PATCH /api/reports/:id] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

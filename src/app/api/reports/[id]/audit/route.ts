import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getReportById } from "@/lib/repositories/report-repository";
import { ReportIdSchema } from "@/lib/validations/search";

/**
 * GET /api/reports/[id]/audit
 *
 * Authenticated endpoint. Returns the audit trail for a report.
 * Only the report owner can access the audit trail.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

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
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    // Build audit trail from report state and lifecycle events
    // In a full implementation, this would query a dedicated audit table
    // For now, we derive events from the report's current state
    const events = buildAuditEvents(report);

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[GET /api/reports/:id/audit] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không tải được lịch sử hoạt động" }, { status: 500 });
  }
}

interface AuditEvent {
  type: string;
  label: string;
  timestamp: string;
  details?: string;
}

function buildAuditEvents(report: { 
  id: string; 
  type: string; 
  title: string; 
  status: string; 
  createdAt: string; 
  updatedAt: string;
  matchedReportId?: string;
  matchedAt?: string;
  resolvedAt?: string;
  imageLabels?: string[];
  moderationLabels?: string[];
}): AuditEvent[] {
  const events: AuditEvent[] = [];

  // Report created
  events.push({
    type: "REPORT_CREATED",
    label: "Đã tạo tin báo",
    timestamp: report.createdAt,
    details: `Loại: ${report.type === "LOST" ? "Đồ bị mất" : "Đồ nhặt được"}`,
  });

  // Image analysis completed
  if (report.imageLabels && report.imageLabels.length > 0) {
    events.push({
      type: "IMAGE_ANALYSIS_COMPLETED",
      label: "Đã phân tích hình ảnh",
      timestamp: report.updatedAt,
      details: `Nhận diện: ${report.imageLabels.join(", ")}`,
    });
  }

  // Match confirmed
  if (report.status === "MATCHED" && report.matchedReportId) {
    events.push({
      type: "MATCH_CONFIRMED",
      label: "Đã xác nhận khớp",
      timestamp: report.matchedAt ?? report.updatedAt,
      details: `Khớp với tin báo ${report.matchedReportId}`,
    });
  }

  // Match reset (unmatch) - would need audit table for historical data
  // For now, we can't detect historical unmatches from current state alone

  // Report resolved
  if (report.status === "RESOLVED") {
    events.push({
      type: "REPORT_RESOLVED",
      label: "Đã giải quyết",
      timestamp: report.resolvedAt ?? report.updatedAt,
      details: report.matchedReportId ? `Đã khớp với tin báo ${report.matchedReportId}` : undefined,
    });
  }

  // Sort by timestamp ascending
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
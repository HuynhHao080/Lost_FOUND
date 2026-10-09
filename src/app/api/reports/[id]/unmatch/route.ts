import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import {
  getReportById,
  unmatchReport,
  MatchConflictError,
  BrokenMatchReferenceError,
} from "@/lib/repositories/report-repository";
import { ReportIdSchema } from "@/lib/validations/search";
import { notifyLifecycleEvent } from "@/lib/notifications/emit";

/**
 * POST /api/reports/[id]/unmatch
 *
 * Authenticated. Owner-only. Atomically resets a confirmed match so both
 * reports return to PENDING.
 *
 * The counterpart is derived server-side from the source report's
 * matchedReportId — the client never supplies it.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const parsed = ReportIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mã tin báo không hợp lệ" }, { status: 400 });
  }

  try {
    const report = await getReportById(parsed.data);
    if (!report) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }
    if (report.status !== "MATCHED" || !report.matchedReportId) {
      return NextResponse.json({ error: "Tin này hiện không ở trạng thái đã ghép" }, { status: 409 });
    }

    // Verify the counterpart points back before touching anything
    const counterpart = await getReportById(report.matchedReportId);
    if (!counterpart || counterpart.matchedReportId !== report.id) {
      // Data integrity problem — do not partially reset one side
      console.error("[POST unmatch] broken match reference:", {
        reportId: report.id,
        matchedReportId: report.matchedReportId,
      });
      throw new BrokenMatchReferenceError();
    }

    await unmatchReport(report.id);

    // Notify both owners (idempotent; failures logged, never fatal)
    await notifyLifecycleEvent("MATCH_RESET", report, counterpart);

    return NextResponse.json({
      message: "Đã hủy ghép",
      report: {
        id: report.id,
        status: "PENDING",
      },
    });
  } catch (err) {
    if (err instanceof MatchConflictError) {
      return NextResponse.json(
        { error: "Ghép vừa được người khác thay đổi" },
        { status: 409 },
      );
    }
    if (err instanceof BrokenMatchReferenceError) {
      return NextResponse.json(
        { error: "Dữ liệu ghép không nhất quán; vui lòng liên hệ quản trị viên" },
        { status: 409 },
      );
    }
    console.error("[POST /api/reports/:id/unmatch] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không thể hủy ghép" }, { status: 500 });
  }
}

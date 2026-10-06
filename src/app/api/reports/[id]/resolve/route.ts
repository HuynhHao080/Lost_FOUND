import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import {
  getReportById,
  resolveReport,
  MatchConflictError,
  BrokenMatchReferenceError,
} from "@/lib/repositories/report-repository";
import { ReportIdSchema } from "@/lib/validations/search";
import { notifyLifecycleEvent } from "@/lib/notifications/emit";

/**
 * POST /api/reports/[id]/resolve
 *
 * Authenticated. Owner-only. Atomically marks a confirmed match as RESOLVED
 * on both reports, preserving matchedReportId/matchedAt history.
 *
 * The counterpart is derived server-side from the source report's
 * matchedReportId — the client never supplies it.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const parsed = ReportIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  }

  try {
    const report = await getReportById(parsed.data);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (report.status !== "MATCHED" || !report.matchedReportId) {
      return NextResponse.json({ error: "Only MATCHED reports can be resolved" }, { status: 409 });
    }

    // Verify the counterpart points back before touching anything
    const counterpart = await getReportById(report.matchedReportId);
    if (!counterpart || counterpart.matchedReportId !== report.id) {
      console.error("[POST resolve] broken match reference:", {
        reportId: report.id,
        matchedReportId: report.matchedReportId,
      });
      throw new BrokenMatchReferenceError();
    }

    await resolveReport(report.id);

    // Notify both owners (idempotent; failures logged, never fatal)
    await notifyLifecycleEvent("REPORT_RESOLVED", report, counterpart);

    return NextResponse.json({
      message: "Match resolved",
      report: {
        id: report.id,
        status: "RESOLVED",
      },
    });
  } catch (err) {
    if (err instanceof MatchConflictError) {
      return NextResponse.json(
        { error: "The match was just changed by someone else" },
        { status: 409 },
      );
    }
    if (err instanceof BrokenMatchReferenceError) {
      return NextResponse.json(
        { error: "Match data is inconsistent; contact an administrator" },
        { status: 409 },
      );
    }
    console.error("[POST /api/reports/:id/resolve] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Failed to resolve report" }, { status: 500 });
  }
}

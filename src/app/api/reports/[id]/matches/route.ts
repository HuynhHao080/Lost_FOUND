import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import { getReportById } from "@/lib/repositories/report-repository";
import { findMatchCandidates } from "@/lib/repositories/match-repository";
import { toPublicReport, type PublicReport } from "@/lib/repositories/public-report";
import { runHybridMatching } from "@/lib/matching/hybrid";

/** Maximum number of matches returned. */
const TOP_MATCHES = 10;

interface MatchResponseItem {
  report: PublicReport;
  score: number;
  label: string;
  reasons: string[];
}

/**
 * GET /api/reports/[id]/matches
 *
 * Authenticated endpoint. Returns ranked candidate matches for the given
 * report (opposite type only). Ownership is verified server-side.
 *
 * Uses hybrid matching (deterministic + Bedrock semantic) when Bedrock is
 * configured and reachable; otherwise falls back to deterministic-only.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  // Authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const report = await getReportById(id);

    if (!report) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }

    // Authorization: ownership checked server-side; userId never comes from the client
    if (report.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    // Lifecycle: only active reports can look for matches
    if (report.status !== "PENDING") {
      return NextResponse.json(
        { error: "Chỉ tin báo ở trạng thái Đang tìm kiếm mới có thể tìm khớp" },
        { status: 409 },
      );
    }

    const oppositeType = report.type === "LOST" ? "FOUND" : "LOST";
    const candidates = await findMatchCandidates(oppositeType, report.id);

    const { matches, matchingMode } = await runHybridMatching(report, candidates);

    const responseItems: MatchResponseItem[] = matches.slice(0, TOP_MATCHES).map((m) => ({
      report: toPublicReport(m.report),
      score: m.score,
      label: m.label,
      reasons: m.reasons,
    }));

    return NextResponse.json({
      matchingMode,
      report: toPublicReport(report),
      matches: responseItems,
    });
  } catch (err) {
    console.error("[GET /api/reports/:id/matches] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không tìm được tin khớp" }, { status: 500 });
  }
}

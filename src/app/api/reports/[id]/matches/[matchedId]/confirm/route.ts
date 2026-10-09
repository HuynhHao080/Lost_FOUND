import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/cognito";
import {
  getReportById,
  confirmReportMatch,
  MatchConflictError,
} from "@/lib/repositories/report-repository";
import { calculateMatchScore, type MatchableReport } from "@/lib/matching/matching";
import { ReportIdSchema } from "@/lib/validations/search";
import { notifyLifecycleEvent } from "@/lib/notifications/emit";

/**
 * Minimum score required to CONFIRM a match. Higher than the display
 * threshold (40): weak matches are shown but cannot be confirmed.
 */
export const CONFIRM_THRESHOLD = 60;

/**
 * POST /api/reports/[id]/matches/[matchedId]/confirm
 *
 * Authenticated endpoint. Confirms a LOST ↔ FOUND match between two PENDING
 * reports owned by the caller (source) and any user (matched).
 *
 * Server-side validation only — the client never supplies scores or userId.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string; matchedId: string }> },
) {
  // Authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { id, matchedId } = await ctx.params;

  // Validate both ids as UUIDs
  const sourceParsed = ReportIdSchema.safeParse(id);
  const matchedParsed = ReportIdSchema.safeParse(matchedId);
  if (!sourceParsed.success || !matchedParsed.success) {
    return NextResponse.json({ error: "Mã tin báo không hợp lệ" }, { status: 400 });
  }

  // Reject self-confirmation
  if (sourceParsed.data === matchedParsed.data) {
    return NextResponse.json({ error: "Không thể tự ghép một tin báo với chính nó" }, { status: 400 });
  }

  try {
    const [source, matched] = await Promise.all([
      getReportById(sourceParsed.data),
      getReportById(matchedParsed.data),
    ]);

    if (!source) {
      return NextResponse.json({ error: "Không tìm thấy tin báo" }, { status: 404 });
    }
    if (!matched) {
      return NextResponse.json({ error: "Không tìm thấy tin báo được ghép" }, { status: 404 });
    }

    // Authorization: caller must own the SOURCE report
    if (source.userId !== user.sub) {
      return NextResponse.json({ error: "Bạn không có quyền thực hiện thao tác này" }, { status: 403 });
    }

    // Opposite types only
    if (source.type === matched.type) {
      return NextResponse.json(
        { error: "Chỉ có thể ghép tin Đồ bị mất với tin Đồ nhặt được" },
        { status: 400 },
      );
    }

    // Both must be PENDING
    if (source.status !== "PENDING" || matched.status !== "PENDING") {
      return NextResponse.json(
        { error: "Một trong hai tin đã không còn khả dụng để ghép" },
        { status: 409 },
      );
    }

    // Re-validate the pair server-side — never trust client-supplied scores.
    // Confirmation requires a stronger match than display does.
    const { score } = calculateMatchScore(source as MatchableReport, matched as MatchableReport);
    if (score < CONFIRM_THRESHOLD) {
      return NextResponse.json(
        {
          error: `Hai tin này chưa đạt ngưỡng xác nhận (điểm ${score}, tối thiểu ${CONFIRM_THRESHOLD})`,
        },
        { status: 400 },
      );
    }

    // Atomic confirmation; concurrent confirmations surface as conflicts
    await confirmReportMatch(source.id, matched.id);

    // Notify both owners (idempotent; failures logged, never fatal)
    await notifyLifecycleEvent("MATCH_CONFIRMED", source, matched);

    return NextResponse.json({
      message: "Đã xác nhận ghép",
      match: {
        reportId: source.id,
        matchedReportId: matched.id,
        status: "MATCHED",
        matchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof MatchConflictError) {
      return NextResponse.json(
        { error: "Một trong hai tin vừa được người khác ghép" },
        { status: 409 },
      );
    }
    console.error("[POST confirm-match] error:", {
      name: (err as { name?: string })?.name,
      message: (err as { message?: string })?.message,
    });
    return NextResponse.json({ error: "Không thể xác nhận ghép" }, { status: 500 });
  }
}

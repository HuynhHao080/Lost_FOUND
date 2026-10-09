"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchReportMatches,
  confirmReportMatch,
  ApiError,
  type MatchesResponse,
  type MatchItem,
} from "@/lib/api/reports";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Inbox, ExternalLink } from "lucide-react";
import { categoryLabel, matchLabelVi, matchReasonVi } from "@/lib/i18n/vi";

/** Minimum score to allow confirming a match (mirrors server-side rule). */
const CONFIRM_THRESHOLD = 60;

/** Visual style per match strength label (hỗ trợ cả tiếng Việt và tiếng Anh cũ). */
const labelStyles: Record<string, string> = {
  "Khớp cao": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Có thể khớp": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Khớp yếu": "bg-muted text-muted-foreground",
  "High match": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Possible match": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Weak match": "bg-muted text-muted-foreground",
};

/**
 * Inline matching panel for one of the user's own reports.
 * Fetches candidates on demand — nothing loads until the user clicks.
 */
export function ReportMatches({
  reportId,
  onMatchConfirmedAction,
}: {
  reportId: string;
  onMatchConfirmedAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MatchesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Tracks whether this panel is still open; async handlers check it before
  // setting state so a closed/unmounted panel never updates stale state.
  const openRef = useRef(false);

  useEffect(() => {
    return () => {
      openRef.current = false;
    };
  }, []);

  async function handleFindMatches() {
    setOpen(true);
    openRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchReportMatches(reportId);
      // Guard: user may have navigated away or the list may have reloaded
      if (!openRef.current) return;
      setData(result);
    } catch (err) {
      if (!openRef.current) return;
      setError(err instanceof ApiError ? err.message : "Không tìm thấy tin khớp. Vui lòng thử lại.");
    } finally {
      if (openRef.current) setLoading(false);
    }
  }

  async function handleConfirm(matchedReportId: string) {
    setConfirmError(null);
    setConfirmingId(matchedReportId);

    try {
      await confirmReportMatch(reportId, matchedReportId);
      setConfirmedIds((prev) => [...prev, matchedReportId]);
      // Dispatch lifecycle event for notification bell refresh
      window.dispatchEvent(new CustomEvent("lf:lifecycle"));
      onMatchConfirmedAction?.();
    } catch (err) {
      setConfirmError(
        err instanceof ApiError ? err.message : "Không thể xác nhận ghép. Vui lòng thử lại.",
      );
    } finally {
      setConfirmingId(null);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={handleFindMatches}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Tìm tin có thể khớp
      </Button>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {loading && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tìm các tin có thể khớp...
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && data.matches.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4 shrink-0" aria-hidden="true" />
          Chưa thấy tin nào có thể khớp. Hãy quay lại sau khi có tin mới.
        </div>
      )}

      {!loading && !error && data && data.matches.length > 0 && (
        <>
          {/* Mode indicator — subtle single line, does not dominate */}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            <Sparkles
              className={`h-3 w-3 ${data.matchingMode === "hybrid" ? "text-primary" : "opacity-40"}`}
              aria-hidden="true"
            />
            {data.matchingMode === "hybrid"
              ? "Ghép theo ngữ nghĩa + quy tắc"
              : "Chỉ ghép theo quy tắc"}
            · Điểm càng cao, tin báo càng giống nhau.
          </p>

          <ul className="space-y-3">
            {data.matches.map((match: MatchItem, index: number) => {
              const isConfirmed = confirmedIds.includes(match.report.id);
              const canConfirm =
                !isConfirmed &&
                match.score >= CONFIRM_THRESHOLD &&
                match.report.status === "PENDING";
              const isBest = index === 0 && match.score >= CONFIRM_THRESHOLD;

              return (
                <li key={match.report.id}>
                  <Card
                    size="sm"
                    className={
                      isBest ? "ring-2 ring-emerald-500/40 dark:ring-emerald-400/30" : undefined
                    }
                  >
                    <CardHeader className="gap-2">
                      {/* Score row — score is the visual anchor */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={match.report.type === "LOST" ? "destructive" : "default"}>
                            {match.report.type === "LOST" ? "Đồ bị mất" : "Đồ nhặt được"}
                          </Badge>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              labelStyles[match.label] ?? labelStyles["Khớp yếu"]
                            }`}
                          >
                            {matchLabelVi(match.label)}
                          </span>
                        </div>
                        {/* Prominent score */}
                        <span
                          className={`shrink-0 text-xl font-bold tabular-nums leading-none ${
                            match.score >= CONFIRM_THRESHOLD
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                          aria-label={`Điểm khớp ${match.score} phần trăm`}
                        >
                          {match.score}
                          <span className="text-xs font-semibold">%</span>
                        </span>
                      </div>

                      <CardTitle className="text-sm leading-snug">{match.report.title}</CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2.5">
                      <p className="wrap-break-word text-xs text-muted-foreground">
                        {categoryLabel(match.report.category)} · {match.report.location}
                        {match.report.dateOccurred && ` · ${match.report.dateOccurred}`}
                      </p>

                      {match.reasons.length > 0 && (
                        <ul className="space-y-1 rounded-md bg-muted/50 p-2">
                          {match.reasons.map((reason) => (
                            <li
                              key={reason}
                              className="flex items-start gap-1.5 text-xs text-muted-foreground"
                            >
                              <CheckCircle2
                                className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-hidden="true"
                              />
                              {matchReasonVi(reason)}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Action row — full-width button stacks cleanly on mobile */}
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        {isConfirmed ? (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Đã xác nhận khớp
                          </p>
                        ) : confirmingId === match.report.id ? (
                          // In-flight: replaces the button entirely so a rapid
                          // second click cannot fire a duplicate request.
                          <p
                            role="status"
                            aria-live="polite"
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            Đang xác nhận...
                          </p>
                        ) : canConfirm ? (
                          <Button
                            size="sm"
                            onClick={() => handleConfirm(match.report.id)}
                            disabled={confirmingId !== null}
                            className="w-full sm:w-auto"
                          >
                            Xác nhận khớp
                          </Button>
                        ) : !match.report.status || match.report.status !== "PENDING" ? (
                          <p className="text-xs text-muted-foreground">
                            Tin này không còn khả dụng để ghép.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Điểm dưới {CONFIRM_THRESHOLD}% — chi tiết khác nhau quá nhiều để
                            tự động xác nhận.
                          </p>
                        )}

                        <Link
                          href={`/reports/${match.report.id}`}
                          className="inline-flex shrink-0 items-center justify-center gap-1 text-xs text-primary hover:underline"
                        >
                          Xem chi tiết
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      </div>

                      {confirmError && confirmingId === null && !isConfirmed && (
                        <p role="alert" className="text-xs text-destructive">
                          {confirmError}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

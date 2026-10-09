"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportCard } from "./report-card";
import { ReportMatches } from "./report-matches";
import {
  fetchReports,
  unmatchReport,
  resolveReport,
  ApiError,
  type Report,
} from "@/lib/api/reports";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, AlertTriangle, RefreshCw, Link2 } from "lucide-react";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  if (err instanceof ApiError && err.status === 500) {
    return "Không tải được tin báo. Nếu bảng DynamoDB mới được tạo, chỉ mục GSI1 có thể đang khởi tạo. Vui lòng thử lại sau.";
  }
  return "Không tải được tin báo. Vui lòng thử lại.";
}

export function ReportsList({ onLoadedAction }: { onLoadedAction?: (reports: Report[]) => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchReports()
      .then((data) => {
        if (cancelled) return;
        setReports(data);
        setError(null);
        onLoadedAction?.(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const [filterType, setFilterType] = useState<"ALL" | "LOST" | "FOUND">("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "MATCHED" | "RESOLVED">("ALL");
  const [page, setPage] = useState(1);

  /** Applies a filter change and returns to the first page. */
  function applyFilter(next: {
    filterType?: "ALL" | "LOST" | "FOUND";
    filterStatus?: "ALL" | "PENDING" | "MATCHED" | "RESOLVED";
  }) {
    if (next.filterType !== undefined) setFilterType(next.filterType);
    if (next.filterStatus !== undefined) setFilterStatus(next.filterStatus);
    setPage(1);
  }

  const filtered = reports.filter((r) => {
    if (filterType !== "ALL" && r.type !== filterType) return false;
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    return true;
  });
  const pageSize = 10;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadToken((t) => t + 1);
  }

  /** Re-fetches reports without a page reload. */
  function load() {
    setReloadToken((t) => t + 1);
    // Notify the header bell to refresh its unread count
    window.dispatchEvent(new CustomEvent("lf:lifecycle"));
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Đang tải tin báo của bạn...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="max-w-md text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Thử lại
        </Button>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Chưa có tin báo nào.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tạo tin báo đầu tiên của bạn bằng biểu mẫu phía trên.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={filterType === "ALL" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterType: "ALL" })}>Tất cả</Button>
        <Button variant={filterType === "LOST" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterType: "LOST" })}>Đồ bị mất</Button>
        <Button variant={filterType === "FOUND" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterType: "FOUND" })}>Đồ nhặt được</Button>
        <span className="mx-1 text-muted-foreground">|</span>
        <Button variant={filterStatus === "ALL" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterStatus: "ALL" })}>Tất cả trạng thái</Button>
        <Button variant={filterStatus === "PENDING" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterStatus: "PENDING" })}>Đang tìm kiếm</Button>
        <Button variant={filterStatus === "MATCHED" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterStatus: "MATCHED" })}>Đã khớp</Button>
        <Button variant={filterStatus === "RESOLVED" ? "default" : "outline"} size="sm" onClick={() => applyFilter({ filterStatus: "RESOLVED" })}>Đã giải quyết</Button>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Trang trước</Button>
        <span className="text-xs text-muted-foreground">Trang {page}</span>
        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={filtered.length < 10}>Trang sau</Button>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
      {paginated.map((report) => (
        // flex column + h-full so cards in the same row align and controls
        // sit at consistent heights
        <div key={report.id} className="flex h-full flex-col gap-3">
          <ReportCard report={report} />

          {report.status === "MATCHED" && report.matchedReportId ? (
            <MatchedControls
              reportId={report.id}
              matchedReportId={report.matchedReportId}
              onChanged={load}
            />
          ) : report.status === "PENDING" ? (
            <ReportMatches reportId={report.id} onMatchConfirmedAction={load} />
          ) : null}
        </div>
      ))}
    </div>
  </div>
  );
}

/**
 * Actions shown under a MATCHED report: view counterpart, mark resolved and
 * reset match, grouped in one bordered footer so they read as a unit.
 */
function MatchedControls({
  reportId,
  matchedReportId,
  onChanged,
}: {
  reportId: string;
  matchedReportId: string;
  onChanged: () => void;
}) {
  const [pendingAction, setPendingAction] = useState<null | "resolve" | "unmatch">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "resolve" | "unmatch") {
    setBusy(true);
    setError(null);
    try {
      if (action === "resolve") {
        await resolveReport(reportId);
      } else {
        await unmatchReport(reportId);
      }
      setPendingAction(null);
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : action === "resolve"
            ? "Không thể đánh dấu đã giải quyết."
            : "Không thể hủy ghép.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      {/* Action row — wraps as a group without awkward gaps */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/reports/${matchedReportId}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-muted hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Xem tin báo đã khớp
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPendingAction("resolve")}
          disabled={busy}
        >
          Đánh dấu đã giải quyết
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPendingAction("unmatch")}
          disabled={busy}
        >
          Hủy ghép
        </Button>
      </div>

      {pendingAction && (
        <div
          role="alertdialog"
          aria-labelledby={`dialog-title-${reportId}`}
          aria-describedby={`dialog-desc-${reportId}`}
          className="mt-3 rounded-lg border border-destructive/30 bg-background p-3"
        >
          {pendingAction === "resolve" ? (
            <>
              <p id={`dialog-title-${reportId}`} className="text-sm font-medium">
                Đánh dấu ghép này là đã giải quyết?
              </p>
              <p id={`dialog-desc-${reportId}`} className="mt-0.5 text-xs text-muted-foreground">
                Cả hai tin báo sẽ chuyển sang ĐÃ GIẢI QUYẾT. Lịch sử ghép được giữ lại;
                không thể hoàn tác từ bảng điều khiển.
              </p>
            </>
          ) : (
            <>
              <p id={`dialog-title-${reportId}`} className="text-sm font-medium">
                Hủy ghép này?
              </p>
              <p id={`dialog-desc-${reportId}`} className="mt-0.5 text-xs text-muted-foreground">
                Cả hai tin báo sẽ trở lại ĐANG TÌM KIẾM và có thể ghép lại.
              </p>
            </>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => run(pendingAction)}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Đang xử lý...
                </>
              ) : pendingAction === "resolve" ? (
                "Vâng, đánh dấu đã giải quyết"
              ) : (
                "Vâng, hủy ghép"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingAction(null)}
              disabled={busy}
            >
              Hủy bỏ
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

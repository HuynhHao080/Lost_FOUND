"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportMatches } from "@/components/reports/report-matches";
import { unmatchReport, resolveReport, ApiError } from "@/lib/api/reports";
import { Loader2, Unlink2, CheckCircle2, RotateCcw } from "lucide-react";

interface ReportDetailActionsProps {
  reportId: string;
  status: string;
  onStatusChange?: () => void;
}

export function ReportDetailActions({
  reportId,
  status,
  onStatusChange,
}: ReportDetailActionsProps) {
  const [unmatching, setUnmatching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnmatch() {
    if (!confirm("Bạn có chắc muốn hủy ghép? Cả hai tin báo sẽ trở lại trạng thái Đang tìm kiếm.")) {
      return;
    }
    setError(null);
    setUnmatching(true);
    try {
      await unmatchReport(reportId);
      // Dispatch lifecycle event for notification bell refresh
      window.dispatchEvent(new CustomEvent("lf:lifecycle"));
      onStatusChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể hủy ghép. Vui lòng thử lại.");
    } finally {
      setUnmatching(false);
    }
  }

  async function handleResolve() {
    if (!confirm("Bạn có chắc muốn đánh dấu đã giải quyết? Món đồ đã về với chủ nhân.")) {
      return;
    }
    setError(null);
    setResolving(true);
    try {
      await resolveReport(reportId);
      // Dispatch lifecycle event for notification bell refresh
      window.dispatchEvent(new CustomEvent("lf:lifecycle"));
      onStatusChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể giải quyết tin báo. Vui lòng thử lại.");
    } finally {
      setResolving(false);
    }
  }

  // Only show actions for PENDING (find matches) or MATCHED (unmatch/resolve)
  if (status === "PENDING") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="text-primary" aria-hidden="true">✨</span>
            Tìm tin báo khớp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportMatches reportId={reportId} onMatchConfirmedAction={onStatusChange} />
        </CardContent>
      </Card>
    );
  }

  if (status === "MATCHED") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="text-primary" aria-hidden="true">✨</span>
              Tìm tin báo khớp khác
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ReportMatches reportId={reportId} onMatchConfirmedAction={onStatusChange} />
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnmatch}
                disabled={unmatching || resolving}
                className="flex-1 sm:flex-none"
              >
                {unmatching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    Đang hủy ghép...
                  </>
                ) : (
                  <>
                    <Unlink2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Hủy ghép
                  </>
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleResolve}
                disabled={unmatching || resolving}
                className="flex-1 sm:flex-none"
              >
                {resolving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                    Đang giải quyết...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Đánh dấu đã giải quyết
                  </>
                )}
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Hủy ghép: cả hai tin báo trở về trạng thái Đang tìm kiếm. Giải quyết: giữ lịch sử ghép, chuyển sang Đã giải quyết.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "RESOLVED") {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">Tin báo đã được giải quyết</span>
          </div>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Món đồ đã về với chủ nhân. Lịch sử ghép được bảo toàn.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "EXPIRED") {
    return (
      <Card className="border-muted/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-medium">Tin báo đã hết hạn</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Tin báo này không còn hoạt động để tìm khớp.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
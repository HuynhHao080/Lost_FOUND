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
    return "Your session has expired. Please sign in again.";
  }
  if (err instanceof ApiError && err.status === 500) {
    return "Could not load reports. If the DynamoDB table was just created, the GSI1 index may still be creating. Please try again shortly.";
  }
  return "Failed to load reports. Please try again.";
}

export function ReportsList({ onLoaded }: { onLoaded?: (reports: Report[]) => void }) {
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
        onLoaded?.(data);
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

  function handleRetry() {
    setLoading(true);
    setError(null);
    setReloadToken((t) => t + 1);
  }

  /** Re-fetches reports without a page reload. */
  function load() {
    setReloadToken((t) => t + 1);
    // Notify the header bell to refresh its unread count
    window.dispatchEvent(new Event("lf:lifecycle"));
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading your reports...
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
          Try again
        </Button>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">No reports yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create your first lost or found report using the form above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
      {reports.map((report) => (
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
            <ReportMatches reportId={report.id} onMatchConfirmed={load} />
          ) : null}
        </div>
      ))}
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
            ? "Failed to resolve."
            : "Failed to remove match.",
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
          View matched report
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPendingAction("resolve")}
          disabled={busy}
        >
          Mark as resolved
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPendingAction("unmatch")}
          disabled={busy}
        >
          Reset match
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
                Mark this match as resolved?
              </p>
              <p id={`dialog-desc-${reportId}`} className="mt-0.5 text-xs text-muted-foreground">
                Both reports will be marked RESOLVED. Match history is kept; this cannot be undone
                from the dashboard.
              </p>
            </>
          ) : (
            <>
              <p id={`dialog-title-${reportId}`} className="text-sm font-medium">
                Remove this match?
              </p>
              <p id={`dialog-desc-${reportId}`} className="mt-0.5 text-xs text-muted-foreground">
                Both reports will return to PENDING and can be matched again.
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
                  Working...
                </>
              ) : pendingAction === "resolve" ? (
                "Yes, mark resolved"
              ) : (
                "Yes, remove match"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingAction(null)}
              disabled={busy}
            >
              Cancel
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

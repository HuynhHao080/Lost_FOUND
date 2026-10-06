"use client";

import { useCallback, useState } from "react";
import { CreateReportForm } from "@/components/reports/create-report-form";
import { ReportsList } from "@/components/reports/reports-list";
import { fetchReports, type Report } from "@/lib/api/reports";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, PackageSearch, SearchIcon, CheckCircle2 } from "lucide-react";

/**
 * Client-side dashboard content that shares report state
 * between the create form and the reports list.
 */
export function DashboardContent() {
  const [reports, setReports] = useState<Report[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const handleReportsChange = useCallback((updated: Report[]) => {
    setReports(updated);
    setStatsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchReports();
      setReports(data);
    } catch {
      // Errors are surfaced by ReportsList; stats just stay stale
    }
  }, []);

  const total = reports.length;
  // Active = not yet RESOLVED. RESOLVED reports are counted separately so the
  // lifecycle PENDING → MATCHED → RESOLVED is visible at a glance.
  const activeLost = reports.filter((r) => r.type === "LOST" && r.status !== "RESOLVED").length;
  const activeFound = reports.filter((r) => r.type === "FOUND" && r.status !== "RESOLVED").length;
  const resolved = reports.filter((r) => r.status === "RESOLVED").length;

  return (
    <div className="space-y-10">
      {/* Statistics */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Your report statistics
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            label="Total reports"
            value={total}
            loading={statsLoading}
          />
          <StatCard
            icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
            label="Active lost"
            value={activeLost}
            loading={statsLoading}
          />
          <StatCard
            icon={<SearchIcon className="h-5 w-5" aria-hidden="true" />}
            label="Active found"
            value={activeFound}
            loading={statsLoading}
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            label="Resolved"
            value={resolved}
            loading={statsLoading}
          />
        </div>
      </section>

      {/* Create Report */}
      <section aria-labelledby="create-heading">
        <h2 id="create-heading" className="mb-3 text-xl font-semibold">
          Create a new report
        </h2>
        <CreateReportForm onCreated={refresh} />
      </section>

      {/* My Reports */}
      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="mb-3 text-xl font-semibold">
          My reports
        </h2>
        <ReportsList onLoaded={handleReportsChange} />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold" aria-live="polite">
            {loading ? "…" : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

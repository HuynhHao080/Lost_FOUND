"use client";

import { useEffect, useState } from "react";
import { searchReports, ApiError, type PublicReport } from "@/lib/api/public-reports";
import { ReportCard } from "@/components/reports/report-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Inbox, AlertTriangle, RefreshCw, SearchIcon } from "lucide-react";

const CATEGORIES = [
  "Electronics",
  "Wallet",
  "Keys",
  "Bag",
  "Document",
  "Clothing",
  "Other",
] as const;

type TypeFilter = "" | "LOST" | "FOUND";

const EMPTY_FILTERS = {
  search: "",
  type: "" as TypeFilter,
  category: "",
  location: "",
};

export function ReportsBrowser() {
  // Seed the category filter from ?category= (e.g. landing page category cards)
  // via lazy initializers. typeof window guard: /reports is statically
  // prerendered, so this component's first render happens on the server.
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    const param = new URLSearchParams(window.location.search).get("category");
    if (param && CATEGORIES.includes(param as (typeof CATEGORIES)[number])) {
      return { ...EMPTY_FILTERS, category: param };
    }
    return EMPTY_FILTERS;
  });
  const [applied, setApplied] = useState(filters);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Track the in-flight request via a monotonically increasing request id.
  // `loading` is derived: true whenever the latest request has not resolved yet.
  // Starts at 1/0 so the initial mount fetches immediately.
  const [requestId, setRequestId] = useState(1);
  const [resolvedId, setResolvedId] = useState(0);
  const loading = requestId !== resolvedId;

  useEffect(() => {
    let cancelled = false;
    const id = requestId;

    searchReports({
      type: applied.type || undefined,
      category: applied.category || undefined,
      location: applied.location || undefined,
      search: applied.search || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          setReports(data);
          setError(null);
          setResolvedId(id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 400
              ? "Invalid filters. Please adjust your search."
              : "Failed to load reports. Please try again.",
          );
          setResolvedId(id);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applied, requestId]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setApplied(filters);
    setRequestId((id) => id + 1);
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setRequestId((id) => id + 1);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form
        onSubmit={handleSearch}
        aria-label="Search reports"
        className="rounded-xl border bg-card p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="search">Keyword</Label>
            <Input
              id="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search by title or description..."
              maxLength={100}
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Type</legend>
            <div className="flex gap-2" role="group" aria-label="Report type filter">
              {(
                [
                  ["", "All"],
                  ["LOST", "Lost"],
                  ["FOUND", "Found"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  aria-pressed={filters.type === value}
                  onClick={() => setFilters((f) => ({ ...f, type: value }))}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    filters.type === value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g., Library"
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit">
            <SearchIcon className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
          <Button type="button" variant="outline" onClick={handleClear}>
            Clear filters
          </Button>
        </div>
      </form>

      {/* Results */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-muted-foreground"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading reports...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="max-w-md text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setRequestId((id) => id + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No reports found</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try adjusting or clearing your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <a
              key={report.id}
              href={`/reports/${report.id}`}
              className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ReportCard report={report} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

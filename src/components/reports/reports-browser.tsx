"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ApiError, type PublicReport } from "@/lib/api/public-reports";
import { ReportCard } from "@/components/reports/report-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryLabel, categoryValue } from "@/lib/i18n/vi";
import { Loader2, Inbox, AlertTriangle, RefreshCw, SearchIcon, ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import Link from "next/link";

const CATEGORIES = [
  "Electronics",
  "Wallet",
  "Keys",
  "Bag",
  "Document",
  "Clothing",
  "Other",
] as const;

const STATUSES = [
  "PENDING",
  "MATCHED",
  "RESOLVED",
  "EXPIRED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang tìm kiếm",
  MATCHED: "Đã khớp",
  RESOLVED: "Đã giải quyết",
  EXPIRED: "Đã hết hạn",
};

const EMPTY_FILTERS = {
  search: "",
  type: "" as TypeFilter,
  category: "",
  location: "",
  status: "" as string,
};

type TypeFilter = "" | "LOST" | "FOUND";

export function ReportsBrowser() {
  // Seed the category filter from ?category= (e.g. landing page category cards)
  // via lazy initializers. typeof window guard: /reports is statically
  // prerendered, so this component's first render happens on the server.
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS;
    const param = new URLSearchParams(window.location.search).get("category");
    const mapped = param ? categoryValue(param) : "";
    if (mapped && (CATEGORIES as readonly string[]).includes(mapped)) {
      return { ...EMPTY_FILTERS, category: mapped };
    }
    return EMPTY_FILTERS;
  });
  const [applied, setApplied] = useState(filters);
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Track the in-flight request via a monotonically increasing request id.
  // `loading` is derived: true whenever the latest request has not resolved yet.
  // Starts at 1/0 so the initial mount fetches immediately.
  const [requestId, setRequestId] = useState(1);
  const [resolvedId, setResolvedId] = useState(0);
  const loading = requestId !== resolvedId;

  // Use a ref to track the current cursor for load more
  const nextCursorRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);

  const fetchReports = useCallback(async (cursor?: string, isLoadMore = false) => {
    const cancelled = false;

    try {
      const params = new URLSearchParams();
      if (applied.type) params.set("type", applied.type);
      if (applied.category) params.set("category", applied.category);
      if (applied.location) params.set("location", applied.location);
      if (applied.search) params.set("search", applied.search);
      if (applied.status) params.set("status", applied.status);
      if (cursor) params.set("cursor", cursor);

      const queryString = params.toString();
      const res = await fetch(`/api/reports/search${queryString ? `?${queryString}` : ""}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        let message = "Không tìm được tin báo";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore parse errors
        }
        throw new ApiError(message, res.status);
      }

      const data: { reports: PublicReport[]; pagination?: { nextCursor: string } } = await res.json();

      if (!cancelled) {
        if (isLoadMore) {
          setReports((prev) => [...prev, ...data.reports]);
        } else {
          setReports(data.reports);
        }
        setError(null);
        nextCursorRef.current = data.pagination?.nextCursor ?? null;
        setHasMore(!!data.pagination?.nextCursor);
        setResolvedId(requestId);
      }
    } catch (err) {
      if (!cancelled) {
        setError(
          err instanceof ApiError && err.status === 400
            ? "Bộ lọc chưa hợp lệ. Vui lòng chỉnh lại tìm kiếm."
            : "Không tải được tin báo. Vui lòng thử lại.",
        );
        setResolvedId(requestId);
      }
    }
  }, [applied, requestId]);

  // Initial load and filter changes
  /* eslint-disable -- fetchReports calls setResolvedId internally; this is the intended data-fetching pattern */
  useEffect(() => {
    fetchReports();
  }, [applied, requestId, fetchReports]);
  /* eslint-enable */

  // Load more effect
  useEffect(() => {
    if (isLoadingMoreRef.current && nextCursorRef.current && !loading) {
      isLoadingMoreRef.current = false;
      fetchReports(nextCursorRef.current, true);
    }
  }, [loading, fetchReports]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setApplied(filters);
    // Reset pagination when filters change
    nextCursorRef.current = null;
    setHasMore(false);
    setRequestId((id) => id + 1);
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    // Reset pagination
    nextCursorRef.current = null;
    setHasMore(false);
    setRequestId((id) => id + 1);
  }

  function handleLoadMoreClick() {
    if (nextCursorRef.current && !loading) {
      isLoadingMoreRef.current = true;
      setRequestId((id) => id + 1);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Report CTA */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 h-10 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Báo mất đồ
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-5 h-10 text-sm font-medium hover:bg-muted"
        >
          Báo nhặt được
        </Link>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleSearch}
        aria-label="Tìm kiếm tin báo"
        className="rounded-xl border bg-card p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="search">Từ khóa</Label>
            <Input
              id="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Tìm theo tiêu đề hoặc mô tả..."
              maxLength={100}
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Loại tin</legend>
            <div className="flex gap-2" role="group" aria-label="Lọc theo loại tin">
              {(
                [
                  ["", "Tất cả"],
                  ["LOST", "Đồ bị mất"],
                  ["FOUND", "Đồ nhặt được"],
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
            <Label htmlFor="category">Danh mục</Label>
            <select
              id="category"
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Tất cả danh mục</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">Trạng thái</Label>
            <select
              id="status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Tất cả trạng thái</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="location">Địa điểm</Label>
            <Input
              id="location"
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
              placeholder="VD: Thư viện"
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="submit">
            <SearchIcon className="h-4 w-4" aria-hidden="true" />
            Tìm kiếm
          </Button>
          <Button type="button" variant="outline" onClick={handleClear}>
            Xóa bộ lọc
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
          Đang tải tin báo...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 py-12 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          <p className="max-w-md text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setRequestId((id) => id + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Thử lại
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Không tìm thấy tin nào</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Hãy thử đổi hoặc xóa bớt bộ lọc.
          </p>
        </div>
      ) : (
        <>
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

          {/* Pagination - Load More */}
          {hasMore && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Previous page not implemented for cursor-based pagination
                }}
                disabled
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Trang trước
              </Button>
              <span className="text-xs text-muted-foreground">Tải thêm</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMoreClick}
                disabled={loading}
              >
                Tải thêm
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
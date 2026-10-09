/**
 * Frontend API client for public report browsing.
 * No authentication required; no tokens or secrets handled here.
 */

export interface PublicReport {
  id: string;
  type: "LOST" | "FOUND";
  title: string;
  description?: string;
  category: string;
  location: string;
  dateOccurred?: string;
  status: "PENDING" | "MATCHED" | "RESOLVED" | "EXPIRED";
  hasImage: boolean;
  /** S3 object key for the report's image (optional, for edit form). */
  imageKey?: string;
  /** Image analysis labels from Amazon Rekognition (optional, public-safe). */
  imageLabels?: string[];
  /** Moderation labels from Amazon Rekognition (optional, public-safe). */
  moderationLabels?: string[];
  /** Image analysis processing status. */
  imageAnalysisStatus?: "PENDING" | "PROCESSING" | "COMPLETED" | "NO_LABELS" | "FAILED";
  /** Public id of the confirmed counterpart report, when MATCHED. */
  matchedReportId?: string;
  /** ISO timestamp when the match was resolved, if applicable. */
  resolvedAt?: string;
  createdAt: string;
}

export interface ReportFilters {
  type?: string;
  category?: string;
  status?: string;
  location?: string;
  search?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function buildQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Searches public reports with optional filters.
 */
export async function searchReports(filters: ReportFilters = {}): Promise<PublicReport[]> {
  const res = await fetch(`/api/reports/search${buildQueryString(filters)}`, {
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

  const data: { reports: PublicReport[] } = await res.json();
  return data.reports ?? [];
}

/**
 * Fetches a single public report by id.
 */
export async function fetchPublicReport(id: string): Promise<PublicReport> {
  const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) {
    throw new ApiError("Không tìm thấy tin báo", 404);
  }

  if (!res.ok) {
    let message = "Không tải được tin báo";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  const data: { report: PublicReport } = await res.json();
  return data.report;
}

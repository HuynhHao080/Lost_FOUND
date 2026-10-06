/**
 * Frontend API client for reports.
 *
 * Uses fetch with credentials included so HTTP-only cookies are sent.
 * No tokens or secrets are handled in client code.
 */

export interface Report {
  id: string;
  userId: string;
  type: "LOST" | "FOUND";
  title: string;
  description?: string;
  category: string;
  location: string;
  dateOccurred?: string;
  status: "PENDING" | "MATCHED" | "RESOLVED" | "EXPIRED";
  imageKey?: string;
  imageLabels?: string[];
  moderationLabels?: string[];
  matchedReportId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportsResponse {
  reports: Report[];
  pagination?: { lastKey: unknown };
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetches the authenticated user's reports.
 */
export async function fetchReports(): Promise<Report[]> {
  const res = await fetch("/api/reports", {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let message = "Failed to fetch reports";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  const data: ReportsResponse = await res.json();
  return data.reports ?? [];
}

/**
 * Creates a new report.
 */
export async function createReport(
  input: import("@/lib/validations/report").ReportInput,
): Promise<Report> {
  const res = await fetch("/api/reports", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let message = "Failed to create report";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export interface MatchItem {
  report: {
    id: string;
    type: "LOST" | "FOUND";
    title: string;
    description?: string;
    category: string;
    location: string;
    dateOccurred?: string;
    status: string;
    createdAt: string;
  };
  score: number;
  label: string;
  reasons: string[];
}

export interface MatchesResponse {
  matchingMode: "hybrid" | "deterministic";
  report: {
    id: string;
    type: "LOST" | "FOUND";
    title: string;
    category: string;
    location: string;
    dateOccurred?: string;
    status: string;
  };
  matches: MatchItem[];
}

/**
 * Fetches ranked candidate matches for one of the user's own reports.
 * Requires an authenticated session (HTTP-only cookie).
 */
export async function fetchReportMatches(reportId: string): Promise<MatchesResponse> {
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/matches`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      401: "Your session has expired. Please sign in again.",
      403: "You can only find matches for your own reports.",
      404: "Report not found.",
      500: "Failed to find matches. Please try again later.",
    };
    let message = fallbacks[res.status] ?? "Failed to find matches";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

export interface ConfirmMatchResponse {
  message: string;
  match: {
    reportId: string;
    matchedReportId: string;
    status: string;
    matchedAt: string;
  };
}

/**
 * Confirms a match between two reports. The caller must own the source report.
 */
export async function confirmReportMatch(
  reportId: string,
  matchedReportId: string,
): Promise<ConfirmMatchResponse> {
  const res = await fetch(
    `/api/reports/${encodeURIComponent(reportId)}/matches/${encodeURIComponent(matchedReportId)}/confirm`,
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      400: "These reports cannot be matched.",
      401: "Your session has expired. Please sign in again.",
      403: "You can only confirm matches for your own reports.",
      404: "Report not found.",
      409: "One of the reports was just matched by someone else.",
      500: "Failed to confirm match. Please try again later.",
    };
    let message = fallbacks[res.status] ?? "Failed to confirm match";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

/**
 * Removes an existing match from one of the user's own MATCHED reports.
 * Both reports return to PENDING.
 */
export async function unmatchReport(reportId: string): Promise<{ message: string }> {
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/unmatch`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      400: "Invalid report id.",
      401: "Your session has expired. Please sign in again.",
      403: "You can only remove matches from your own reports.",
      404: "Report not found.",
      409: "This report is not currently matched, or the match just changed.",
      500: "Failed to remove match. Please try again later.",
    };
    let message = fallbacks[res.status] ?? "Failed to remove match";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

/**
 * Marks a MATCHED report (and its counterpart) as RESOLVED.
 * Match history is preserved.
 */
export async function resolveReport(reportId: string): Promise<{ message: string }> {
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      400: "Invalid report id.",
      401: "Your session has expired. Please sign in again.",
      403: "You can only resolve your own reports.",
      404: "Report not found.",
      409: "This report is not currently matched, or the match just changed.",
      500: "Failed to resolve report. Please try again later.",
    };
    let message = fallbacks[res.status] ?? "Failed to resolve report";
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

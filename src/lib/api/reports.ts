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
    let message = "Không tải được tin báo";
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
    let message = "Không thể tạo tin báo";
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

/** Editable content fields of a report. */
export interface ReportContentInput {
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  dateOccurred?: string;
}

/**
 * Updates the editable content of a report (owner-only PATCH).
 */
export async function updateReport(
  reportId: string,
  input: ReportContentInput,
): Promise<Report> {
  const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      400: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.",
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      403: "Bạn chỉ có thể chỉnh sửa tin báo của mình.",
      404: "Không tìm thấy tin báo.",
      500: "Không thể cập nhật tin báo. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Không thể cập nhật tin báo";
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
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      403: "Bạn chỉ có thể tìm khớp cho tin báo của mình.",
      404: "Không tìm thấy tin báo.",
      500: "Không tìm được tin khớp. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Không tìm được tin khớp";
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
      400: "Hai tin này không thể ghép với nhau.",
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      403: "Bạn chỉ có thể xác nhận ghép cho tin báo của mình.",
      404: "Không tìm thấy tin báo.",
      409: "Một trong hai tin vừa được người khác ghép.",
      500: "Không thể xác nhận ghép. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Không thể xác nhận ghép";
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
      400: "Mã tin báo không hợp lệ.",
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      403: "Bạn chỉ có thể hủy ghép của tin báo mình.",
      404: "Không tìm thấy tin báo.",
      409: "Tin này hiện không ghép, hoặc ghép vừa thay đổi.",
      500: "Không thể hủy ghép. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Không thể hủy ghép";
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
      400: "Mã tin báo không hợp lệ.",
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      403: "Bạn chỉ có thể giải quyết tin báo của mình.",
      404: "Không tìm thấy tin báo.",
      409: "Tin này hiện không ghép, hoặc ghép vừa thay đổi.",
      500: "Không thể giải quyết tin báo. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Không thể giải quyết tin báo";
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

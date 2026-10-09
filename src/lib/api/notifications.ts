/**
 * Frontend API client for in-app notifications.
 * Session is carried by HTTP-only cookies; no tokens handled here.
 */

import { ApiError } from "./reports";

export type NotificationType = "MATCH_CONFIRMED" | "MATCH_RESET" | "REPORT_RESOLVED" | "IMAGE_UPLOADED";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  reportId: string;
  relatedReportId?: string;
  createdAt: string;
  readAt?: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
  pagination?: { hasMore: boolean };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
    ...init,
  });

  if (!res.ok) {
    const fallbacks: Record<number, string> = {
      401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      500: "Đã xảy ra lỗi. Vui lòng thử lại sau.",
    };
    let message = fallbacks[res.status] ?? "Yêu cầu thất bại";
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

export function fetchNotifications(limit = 30): Promise<NotificationsResponse> {
  return request<NotificationsResponse>(`/api/notifications?limit=${limit}`);
}

export function markNotificationRead(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(): Promise<{ message: string; updated: number }> {
  return request<{ message: string; updated: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}

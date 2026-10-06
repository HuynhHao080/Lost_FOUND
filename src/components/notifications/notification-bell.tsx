"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from "@/lib/api/notifications";
import { ApiError } from "@/lib/api/reports";
import { Bell, CheckCheck, UserPlus2, Unlink, PartyPopper, Inbox, Loader2 } from "lucide-react";

const typeIcon: Record<AppNotification["type"], React.ReactNode> = {
  MATCH_CONFIRMED: (
    <UserPlus2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
  ),
  MATCH_RESET: <Unlink className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
  REPORT_RESOLVED: (
    <PartyPopper className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
  ),
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Compact notification bell with dropdown panel for the dashboard header.
 * Loads on first open; refreshes via the `refreshKey` prop after lifecycle
 * actions so newly created notifications appear without a page reload.
 */
export function NotificationBell({ refreshKey = 0 }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Monotonic token so an older in-flight fetch can never overwrite the
  // results of a newer one (rapid open/close / repeated lifecycle events).
  const requestToken = useRef(0);

  const load = useCallback(async () => {
    const token = ++requestToken.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications();
      if (token !== requestToken.current) return; // superseded by a newer request
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      if (token !== requestToken.current) return;
      if (!(err instanceof ApiError && err.status === 401)) {
        setError("Could not load notifications.");
      }
    } finally {
      if (token === requestToken.current) setLoading(false);
    }
  }, []);

  // Initial load + reload whenever a lifecycle action happens elsewhere
  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {
        /* silent — bell badge is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Lifecycle actions (confirm/unmatch/resolve) dispatch this window event so
  // the bell refreshes without a page reload, even though it's a sibling of
  // the dashboard content tree.
  useEffect(() => {
    function onLifecycle() {
      load();
    }
    window.addEventListener("lf:lifecycle", onLifecycle);
    return () => window.removeEventListener("lf:lifecycle", onLifecycle);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  async function handleClickNotification(n: AppNotification) {
    if (!n.readAt) {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await markNotificationRead(n.id);
      } catch {
        /* optimistic update kept; server state reconciles on next load */
      }
    }
  }

  async function handleMarkAllRead() {
    if (markingAll) return; // double-click guard
    setMarkingAll(true);
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      /* optimistic; reconciles on next load */
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={markingAll}>
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading...
              </div>
            ) : error ? (
              <p role="alert" className="px-3 py-6 text-center text-sm text-destructive">
                {error}
              </p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">No notifications</p>
                <p className="px-6 text-xs text-muted-foreground">
                  You&apos;ll see updates here when something happens to your reports.
                </p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id} className={n.readAt ? "opacity-70" : undefined}>
                    <Link
                      href={`/reports/${n.reportId}`}
                      onClick={() => handleClickNotification(n)}
                      className={`flex items-start gap-2.5 border-b px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50 ${
                        !n.readAt ? "bg-primary/[0.04]" : ""
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">{typeIcon[n.type]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!n.readAt && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          )}
                          <span className="truncate text-xs font-medium">{n.title}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">
                          {n.message}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

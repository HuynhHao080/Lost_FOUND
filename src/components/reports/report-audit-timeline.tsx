"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ShieldCheck, Loader2 } from "lucide-react";

interface AuditEvent {
  type: string;
  label: string;
  timestamp: string;
  details?: string;
}

interface ReportAuditTimelineProps {
  reportId: string;
}

export function ReportAuditTimeline({ reportId }: ReportAuditTimelineProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAudit() {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/audit`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            // Not authorized - silently skip audit for public reports
            if (!cancelled) {
              setEvents([]);
              setLoading(false);
            }
            return;
          }
          throw new Error("Không tải được lịch sử hoạt động");
        }

        const data = await res.json();
        if (!cancelled) {
          setEvents(data.events ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không tải được lịch sử hoạt động");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAudit();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "REPORT_CREATED":
        return <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
      case "IMAGE_ANALYSIS_COMPLETED":
        return <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
      case "MATCH_CONFIRMED":
        return <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />;
      case "MATCH_RESET":
        return <ShieldCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />;
      case "REPORT_RESOLVED":
        return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Lịch sử hoạt động
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div role="status" className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải lịch sử...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Lịch sử hoạt động
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Lịch sử hoạt động
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Chưa có hoạt động nào được ghi nhận.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Lịch sử hoạt động
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {events.map((event, index) => (
            <li key={`${event.type}-${event.timestamp}-${index}`} className="flex items-start gap-2.5 text-xs text-muted-foreground">
              {getEventIcon(event.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{event.label}</span>
                  <span className="text-[10px] text-muted-foreground/70">{formatTimestamp(event.timestamp)}</span>
                </div>
                {event.details && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">{event.details}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
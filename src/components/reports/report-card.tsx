import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Calendar, ImageIcon, CheckCircle2 } from "lucide-react";

/**
 * Status pill styles. Kept deliberately subtle: soft backgrounds, consistent
 * structure. RESOLVED reads as "completed" via a check icon rather than a
 * louder color.
 */
const statusStyles: Record<string, { className: string; icon?: React.ReactNode }> = {
  PENDING: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  MATCHED: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  RESOLVED: {
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  },
  EXPIRED: {
    className: "bg-muted text-muted-foreground",
  },
};

/** Minimal shape needed by the card — works for both public and own reports. */
interface ReportCardProps {
  report: {
    id: string;
    type: string;
    title: string;
    description?: string;
    category: string;
    location: string;
    dateOccurred?: string;
    status: string;
    hasImage?: boolean;
    imageKey?: string;
    matchedReportId?: string;
    resolvedAt?: string;
    createdAt: string;
  };
}

export function ReportCard({ report }: ReportCardProps) {
  const isLost = report.type === "LOST";
  const showImage = Boolean(report.hasImage || report.imageKey);
  const status = statusStyles[report.status] ?? statusStyles.PENDING;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Image area — fixed aspect ratio, graceful fallback */}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned redirect endpoint, not a static asset
        <img
          src={`/api/reports/${report.id}/image`}
          alt={`Photo of ${report.title}`}
          className="w-full aspect-[4/3] object-cover"
          loading="lazy"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex w-full aspect-[4/3] items-center justify-center bg-muted text-muted-foreground"
        >
          <ImageIcon className="h-8 w-8 opacity-30" />
        </div>
      )}

      <CardHeader className="flex-none space-y-2">
        {/* Badges row — wraps cleanly without breaking layout */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={isLost ? "destructive" : "default"}>{isLost ? "Lost" : "Found"}</Badge>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.icon}
            {report.status}
          </span>
        </div>

        <CardTitle className="line-clamp-2 leading-snug">{report.title}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-2">
          {report.description && (
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2 break-words">
              {report.description}
            </p>
          )}

          {/* Metadata rows — single column keeps alignment consistent */}
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Location</dt>
              <dd className="min-w-0 flex-1 break-words">{report.location}</dd>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <dt className="sr-only">Date occurred</dt>
              <dd>{report.dateOccurred || "Not specified"}</dd>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <dt className="sr-only">Category</dt>
              <dd>{report.category}</dd>
            </div>
          </dl>
        </div>

        <p className="text-xs text-muted-foreground/80">
          Reported{" "}
          {new Date(report.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </CardContent>
    </Card>
  );
}

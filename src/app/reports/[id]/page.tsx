import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReportById } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { MapPin, Calendar, ArrowLeft, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  MATCHED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let report = null;
  try {
    const internal = await getReportById(id);
    report = internal ? toPublicReport(internal) : null;
  } catch {
    report = null;
  }

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-lg font-medium">Report not found</p>
        <p className="text-sm text-muted-foreground">
          This report may have been removed or the link is incorrect.
        </p>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to reports
        </Link>
      </div>
    );
  }

  const isLost = report.type === "LOST";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to reports
          </Link>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant={isLost ? "destructive" : "default"}>
                  {isLost ? "Lost" : "Found"}
                </Badge>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[report.status] ?? statusStyles.PENDING}`}
                >
                  {report.status}
                </span>
              </div>
              <CardTitle className="text-2xl leading-snug">{report.title}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {report.hasImage && (
                // eslint-disable-next-line @next/next/no-img-element -- presigned redirect endpoint, not a static asset
                <img
                  src={`/api/reports/${report.id}/image`}
                  alt={`Photo of ${report.title}`}
                  className="w-full aspect-[4/3] rounded-lg object-cover"
                />
              )}

              {report.description && (
                <div>
                  <h2 className="text-sm font-medium mb-1">Description</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {report.description}
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-medium">{report.category}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">{report.status}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Location
                  </dt>
                  <dd className="font-medium">{report.location}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Date occurred
                  </dt>
                  <dd className="font-medium">{report.dateOccurred || "Not specified"}</dd>
                </div>
              </dl>

              {report.status === "MATCHED" && report.matchedReportId && (
                <div className="rounded-lg bg-blue-50 px-3 py-3 dark:bg-blue-900/20">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-blue-900 dark:text-blue-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Matched with another report
                  </p>
                  <Link
                    href={`/reports/${report.matchedReportId}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View matched report
                  </Link>
                </div>
              )}

              {report.status === "RESOLVED" && report.matchedReportId && (
                <div className="rounded-lg bg-green-50 px-3 py-3 dark:bg-green-900/20">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-green-900 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Resolved — this item was reunited with its owner
                  </p>
                  {report.resolvedAt && (
                    <p className="mt-0.5 text-xs text-green-800/80 dark:text-green-400/80">
                      Resolved on{" "}
                      {new Date(report.resolvedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}
                  <Link
                    href={`/reports/${report.matchedReportId}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View matched report
                  </Link>
                </div>
              )}

              {report.imageLabels && report.imageLabels.length > 0 && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Image analysis
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {report.imageLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground border-t pt-3">
                Reported on{" "}
                {new Date(report.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

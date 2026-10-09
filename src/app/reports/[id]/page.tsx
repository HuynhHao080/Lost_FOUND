import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReportById } from "@/lib/repositories/report-repository";
import { toPublicReport } from "@/lib/repositories/public-report";
import { categoryLabel, statusLabel } from "@/lib/i18n/vi";
import { MapPin, Calendar, ArrowLeft, CheckCircle2 } from "lucide-react";
import { ReportDetailActions } from "@/components/reports/report-detail-actions";
import { ReportAuditTimeline } from "@/components/reports/report-audit-timeline";

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
        <p className="text-lg font-medium">Không tìm thấy tin báo</p>
        <p className="text-sm text-muted-foreground">
          Tin báo này có thể đã bị xóa hoặc đường dẫn không đúng.
        </p>
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Về danh sách tin báo
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
            Về danh sách tin báo
          </Link>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant={isLost ? "destructive" : "default"}>
                  {isLost ? "Đồ bị mất" : "Đồ nhặt được"}
                </Badge>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[report.status] ?? statusStyles.PENDING}`}
                >
                  {report.status === "PENDING" ? "Đang tìm kiếm" : report.status === "MATCHED" ? "Đã khớp" : report.status === "RESOLVED" ? "Đã giải quyết" : report.status === "EXPIRED" ? "Đã hết hạn" : report.status}
                </span>
              </div>
              <CardTitle className="text-2xl leading-snug">{report.title}</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {report.hasImage && (
                // eslint-disable-next-line @next/next/no-img-element -- presigned redirect endpoint, not a static asset
                <img
                  src={`/api/reports/${report.id}/image`}
                  alt={`Ảnh của ${report.title}`}
                  className="w-full aspect-4/3 rounded-lg object-cover"
                />
              )}

              {report.description && (
                <div>
                  <h2 className="text-sm font-medium mb-1">Mô tả</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {report.description}
                  </p>
                </div>
              )}

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Danh mục</dt>
                  <dd className="font-medium">{categoryLabel(report.category)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Trạng thái</dt>
                  <dd className="font-medium">{statusLabel(report.status)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Địa điểm
                  </dt>
                  <dd className="font-medium">{report.location}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Thời gian xảy ra
                  </dt>
                  <dd className="font-medium">{report.dateOccurred || "Chưa ghi rõ"}</dd>
                </div>
              </dl>

              {report.status === "MATCHED" && report.matchedReportId && (
                <div className="rounded-lg bg-blue-50 px-3 py-3 dark:bg-blue-900/20">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-blue-900 dark:text-blue-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Đã khớp với một tin báo khác
                  </p>
                  <Link
                    href={`/reports/${report.matchedReportId}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Xem tin báo đã khớp
                  </Link>
                </div>
              )}

              {report.status === "RESOLVED" && report.matchedReportId && (
                <div className="rounded-lg bg-green-50 px-3 py-3 dark:bg-green-900/20">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-green-900 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Đã giải quyết — món đồ đã về với chủ nhân
                  </p>
                  {report.resolvedAt && (
                    <p className="mt-0.5 text-xs text-green-800/80 dark:text-green-400/80">
                      Giải quyết ngày{" "}
                      {new Date(report.resolvedAt).toLocaleDateString("vi-VN", {
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
                    Xem tin báo đã khớp
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/reports/${report.id}/edit`} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Chỉnh sửa</Link>
              </div>

              <ReportDetailActions
                reportId={report.id}
                status={report.status}
              />

              {report.hasImage && (
                <div className="rounded-lg border bg-card px-3 py-2">
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                    Phân tích hình ảnh
                    {(() => {
                      const status = report.imageAnalysisStatus;
                      if (status === "COMPLETED") {
                        return (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Hoàn tất
                          </span>
                        );
                      }
                      if (status === "NO_LABELS") {
                        return (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive/80">
                            Không phát hiện nhãn
                          </span>
                        );
                      }
                      if (status === "FAILED") {
                        return (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive/80">
                            Phân tích thất bại
                          </span>
                        );
                      }
                      // PENDING, PROCESSING, or undefined
                      return (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                          Đang phân tích...
                        </span>
                      );
                    })()}
                  </h3>
                  {report.imageLabels && report.imageLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {report.imageLabels.map((label) => (
                        <span key={label} className="inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-300">{label}</span>
                      ))}
                    </div>
                  ) : report.imageAnalysisStatus === "NO_LABELS" || (report.moderationLabels !== undefined && report.moderationLabels.length === 0 && !report.imageLabels?.length) ? (
                    <p className="text-xs text-muted-foreground">Hình ảnh đã được phân tích nhưng không phát hiện đặc điểm nhận diện rõ ràng.</p>
                  ) : report.imageAnalysisStatus === "FAILED" ? (
                    <p className="text-xs text-destructive">Phân tích hình ảnh thất bại. Vui lòng thử tải ảnh khác.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Đang phân tích hình ảnh... Vui lòng tải lại trang sau vài phút.</p>
                  )}
                </div>
              )}

              <ReportAuditTimeline reportId={report.id} />

              <p className="text-xs text-muted-foreground border-t pt-3">
                Đăng ngày{" "}
                {new Date(report.createdAt).toLocaleDateString("vi-VN", {
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
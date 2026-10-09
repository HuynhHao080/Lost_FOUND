import "server-only";
import type { Report } from "@/lib/repositories/report-repository";

/**
 * Public-safe representation of a report.
 * Deliberately excludes userId and all DynamoDB key attributes.
 */
export interface PublicReport {
  id: string;
  type: Report["type"];
  title: string;
  description?: string;
  category: string;
  location: string;
  dateOccurred?: string;
  status: Report["status"];
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

/**
 * Maps an internal Report to its public-safe shape.
 */
export function toPublicReport(report: Report): PublicReport {
  return {
    id: report.id,
    type: report.type,
    title: report.title,
    description: report.description,
    category: report.category,
    location: report.location,
    dateOccurred: report.dateOccurred,
    status: report.status,
    // Only a boolean is exposed — the raw key stays server-side
    hasImage: Boolean(report.imageKey || report.imageUrl),
    imageKey: report.imageKey,
    imageLabels: report.imageLabels ?? [],
    moderationLabels: report.moderationLabels ?? [],
    imageAnalysisStatus: report.imageAnalysisStatus,
    matchedReportId: report.matchedReportId,
    resolvedAt: report.resolvedAt,
    createdAt: report.createdAt,
  };
}

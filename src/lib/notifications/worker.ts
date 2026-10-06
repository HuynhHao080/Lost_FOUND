/**
 * Notification / Image-analysis worker.
 *
 * Reads pending outbox events from DynamoDB, performs Rekognition
 * analysis when the event is IMAGE_UPLOADED, writes notifications
 * for lifecycle events, and marks events as published.
 *
 * Designed to run as a Lambda or EC2 process. For local demo,
 * run `node scripts/notification-worker.mjs`.
 */

import "server-only";
import { getPendingOutboxEvents, markOutboxPublished } from "@/lib/aws/outbox";
import { analyzeImage } from "@/lib/aws/rekognition";
import { REPORTS_BUCKET } from "@/lib/aws/s3";
import { updateImageAnalysis, getReportById } from "@/lib/repositories/report-repository";
import { createNotification } from "@/lib/repositories/notification-repository";

const MAX_BATCH = 10;

export async function processBatch(): Promise<{ processed: number; hasMore: boolean }> {
  const { events, lastKey } = await getPendingOutboxEvents(MAX_BATCH);

  for (const event of events) {
    try {
      if (event.eventType === "IMAGE_UPLOADED") {
        const report = await getReportById(event.reportId);
        const imageKey = event.imageKey ?? report?.imageKey;
        if (report && imageKey && report.userId) {
          const analysis = await analyzeImage(REPORTS_BUCKET, imageKey);
          if (analysis) {
            await updateImageAnalysis(report.id, analysis.labels, analysis.moderationLabels);
          }
        }
      }

      // Always emit notification for lifecycle events (idempotent)
      if (
        event.eventType === "MATCH_CONFIRMED" ||
        event.eventType === "MATCH_RESET" ||
        event.eventType === "REPORT_RESOLVED"
      ) {
        // Resolve the owner from the report so notifications land in the
        // right USER# partition. Falls back to the embedded userId, then
        // skips (never writes to a garbage "unknown" partition).
        const report = await getReportById(event.reportId);
        const userId = report?.userId ?? event.userId;
        if (userId) {
          await createNotification({
            userId,
            type: event.eventType,
            title:
              event.eventType === "MATCH_CONFIRMED"
                ? "Match confirmed"
                : event.eventType === "MATCH_RESET"
                  ? "Match reset"
                  : "Report resolved",
            message: `Event: ${event.eventType}`,
            reportId: event.reportId,
            relatedReportId: event.relatedReportId,
            eventDate: event.occurredAt.slice(0, 10),
          });
        }
      }

      await markOutboxPublished(event.id, event.occurredAt);
    } catch (err) {
      console.error(`[worker] Failed to process outbox event ${event.id}:`, {
        name: (err as { name?: string })?.name,
        message: (err as { message?: string })?.message,
      });
    }
  }

  if (lastKey) {
    console.log("[worker] More outbox events available; run again.");
  }
  return { processed: events.length, hasMore: Boolean(lastKey) };
}

// Only auto-run when executed directly (Lambda imports this module
// without running it; `next build` must never spawn a worker loop).
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => a.endsWith("worker.ts") || a.endsWith("worker.js"));
if (isDirectRun) {
  processBatch()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[worker] Batch failed:", err);
      process.exit(1);
    });
}

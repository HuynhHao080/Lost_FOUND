/**
 * Amazon SQS queue and DLQ configuration for notification processing.
 *
 * This module provides the queue names and a documentation reference for
 * the AWS Console setup. It does not create resources automatically.
 *
 * Recommended AWS Console setup:
 *
 * Queue: LostFound-Notifications
 *   Type: Standard
 *   Visibility timeout: 30 seconds
 *   Message retention: 4 days
 *   DLQ: LostFound-Notifications-DLQ
 *     Max receive count: 3
 *
 * The worker reads from LostFound-Notifications and writes notifications
 * to DynamoDB using the existing notification repository.
 */

export const NOTIFICATION_QUEUE_NAME = process.env.SQS_NOTIFICATION_QUEUE || "LostFound-Notifications";
export const NOTIFICATION_DLQ_NAME = process.env.SQS_NOTIFICATION_DLQ || "LostFound-Notifications-DLQ";

/**
 * Recommended SQS message format (used by the worker when reading from
 * EventBridge via SQS subscription, or when reading from the outbox).
 */
export interface NotificationMessage {
  eventId: string;
  eventType: "MATCH_CONFIRMED" | "MATCH_RESET" | "REPORT_RESOLVED" | "IMAGE_UPLOADED";
  occurredAt: string;
  reportId: string;
  relatedReportId?: string;
  imageKey?: string;
}

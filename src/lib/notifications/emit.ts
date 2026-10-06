import "server-only";
import {
  createNotification,
  deterministicId,
  type NotificationType,
} from "@/lib/repositories/notification-repository";
import { putOutboxEvent } from "@/lib/aws/outbox";
import type { Report } from "@/lib/repositories/report-repository";

/**
 * Emits lifecycle notifications for match/unmatch/resolve events.
 *
 * Idempotency: notification ids are deterministic per (type, report pair,
 * event date), so a retried request cannot create duplicates.
 *
 * Same-user case: when both reports share an owner, exactly one notification
 * is created (for that owner) — no duplicates.
 *
 * Notification failures never break the underlying lifecycle action.
 */
export async function notifyLifecycleEvent(
  type: NotificationType,
  source: Report,
  counterpart?: Report,
): Promise<void> {
  const eventDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const copy: Record<NotificationType, { title: string; message: (ownTitle: string, otherTitle: string) => string }> = {
    MATCH_CONFIRMED: {
      title: "Match confirmed",
      message: (ownTitle: string, otherTitle: string) =>
        `A possible match for "${ownTitle}" was confirmed with "${otherTitle}".`,
    },
    MATCH_RESET: {
      title: "Match reset",
      message: (ownTitle: string, otherTitle: string) =>
        `The match between "${ownTitle}" and "${otherTitle}" was removed. Both reports are pending again.`,
    },
    REPORT_RESOLVED: {
      title: "Report resolved",
      message: (ownTitle: string, otherTitle: string) =>
        `"${ownTitle}" was resolved — matched with "${otherTitle}". Congratulations!`,
    },
    IMAGE_UPLOADED: {
      title: "Image analyzed",
      message: (ownTitle: string) =>
        `Image analysis complete for "${ownTitle}". Visual labels have been added.`,
    },
  } as const;

  const template = copy[type];

  // Recipients: both owners, deduplicated (same-user case → one notification)
  const recipients = new Map<string, { own: Report; other?: Report }>();
  recipients.set(source.userId, { own: source, other: counterpart });
  if (counterpart && counterpart.userId !== source.userId) {
    recipients.set(counterpart.userId, { own: counterpart, other: source });
  }

  await Promise.allSettled(
    Array.from(recipients.values()).map(async ({ own, other }) => {
      const otherId = other?.id;
      const eventId = deterministicId(type, own.id, otherId, eventDate);
      await putOutboxEvent({
        id: eventId,
        eventType: type,
        reportId: own.id,
        relatedReportId: otherId,
        occurredAt: eventDate,
        status: "PENDING",
      });
      await createNotification({
        userId: own.userId,
        type,
        title: template.title,
        message: template.message(own.title, other?.title ?? ""),
        reportId: own.id,
        relatedReportId: otherId,
        eventDate,
      });
    }),
  );
}

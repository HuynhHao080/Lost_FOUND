import "server-only";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

/**
 * Amazon EventBridge event bus for Lost & Found lifecycle events.
 *
 * Server-side only. Uses the standard AWS credential provider chain.
 *
 * Required environment variables:
 * - AWS_REGION
 * - EVENTBRIDGE_BUS_NAME (optional; defaults to default bus)
 *
 * The application must keep working when EventBridge is unavailable —
 * the outbox pattern ensures events are durable even if the bus is down.
 */

const REGION = process.env.AWS_REGION || "us-east-1";
const BUS_NAME = process.env.EVENTBRIDGE_BUS_NAME || "default";

const eventBridgeClient = new EventBridgeClient({ region: REGION });

/**
 * Publishes a lifecycle event to the EventBridge bus.
 * Returns true if published, false if unavailable (caller logs, never fails).
 */
export async function publishLifecycleEvent(
  eventType: string,
  eventId: string,
  occurredAt: string,
  reportId: string,
  relatedReportId?: string,
): Promise<boolean> {
  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "lost-found.app",
            EventBusName: BUS_NAME,
            DetailType: eventType,
            Detail: JSON.stringify({
              eventId,
              eventType,
              occurredAt,
              reportId,
              relatedReportId,
            }),
            Time: new Date(occurredAt),
          },
        ],
      }),
    );
    return true;
  } catch (err) {
    console.warn("[eventbridge] Publish failed (will retry from outbox):", {
      name: (err as { name?: string })?.name,
    });
    return false;
  }
}

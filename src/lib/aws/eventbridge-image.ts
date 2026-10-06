import "server-only";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

/**
 * EventBridge event bus for image-analysis lifecycle events.
 *
 * Published when an image is successfully attached to a report (PATCH).
 * The worker reads from SQS and performs Rekognition analysis.
 */

const REGION = process.env.AWS_REGION || "us-east-1";
const BUS_NAME = process.env.EVENTBRIDGE_BUS_NAME || "default";

const eventBridgeClient = new EventBridgeClient({ region: REGION });

export interface ImageEventPayload {
  eventId: string;
  eventType: "IMAGE_UPLOADED";
  occurredAt: string;
  reportId: string;
  imageKey: string;
}

/**
 * Publishes an image-uploaded event to the EventBridge bus.
 * Returns true if published; false if unavailable (non-fatal).
 */
export async function publishImageEvent(
  payload: ImageEventPayload,
): Promise<boolean> {
  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "lost-found.app",
            EventBusName: BUS_NAME,
            DetailType: payload.eventType,
            Detail: JSON.stringify({
              eventId: payload.eventId,
              eventType: payload.eventType,
              occurredAt: payload.occurredAt,
              reportId: payload.reportId,
              imageKey: payload.imageKey,
            }),
            Time: new Date(payload.occurredAt),
          },
        ],
      }),
    );
    return true;
  } catch (err) {
    console.warn("[eventbridge] Image event publish failed (will retry from outbox):", {
      name: (err as { name?: string })?.name,
    });
    return false;
  }
}

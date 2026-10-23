import { z } from "zod";
import { infrai } from "./delivery_queue.js";
import { paymentEventSchema } from "./payment_policy.js";

const notificationSchema = z.object({
  notificationId: z.string(),
  event: paymentEventSchema,
  action: z.enum(["fulfill_order", "hold_for_review", "record_failure"]),
  reason: z.string()
});

export async function deliverBatch(): Promise<number> {
  const destination = process.env.MERCHANT_WEBHOOK_URL;
  if (!destination) throw new Error("Set MERCHANT_WEBHOOK_URL before running the worker");

  const messages = await infrai.queue.consume(10, 30);
  let delivered = 0;

  for (const message of messages) {
    const notification = notificationSchema.parse(message.payload);
    const response = await fetch(destination, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-id": notification.notificationId
      },
      body: JSON.stringify(notification)
    });

    if (response.ok) {
      await infrai.queue.ack(message.message_id);
      delivered += 1;
    }
  }
  return delivered;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deliverBatch()
    .then((count) => console.log(`Delivered and acknowledged ${count} payment notifications`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

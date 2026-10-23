import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./delivery_queue.js";
import { paymentEventSchema, planNotification } from "./payment_policy.js";

function reply(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payment-events") {
    reply(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const event = paymentEventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const notification = planNotification(event);
    await infrai.queue.publish(notification);
    reply(response, 202, {
      notificationId: notification.notificationId,
      action: notification.action,
      queued: true
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_payment_event" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      reply(response, error.status, { error: error.code });
      return;
    }
    console.error(error);
    reply(response, 503, { error: "delivery_queue_unavailable" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Payment event route listening on http://localhost:${port}`));

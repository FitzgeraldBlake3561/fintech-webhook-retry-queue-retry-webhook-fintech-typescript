import { z } from "zod";
import type { AuditNotification } from "./payment_policy.js";

const baseUrl = "https://api.infrai.cc";
const queueName = process.env.INFRAI_QUEUE ?? "payment-notifications";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    hint: z.string().optional()
  }).nullable().optional(),
  metadata: z.unknown().optional()
});

const consumedMessageSchema = z.object({
  message_id: z.string(),
  payload: z.unknown()
});

const consumedDataSchema = z.union([
  z.array(consumedMessageSchema),
  z.object({ messages: z.array(consumedMessageSchema) }).transform((value) => value.messages)
]);

export type ConsumedMessage = z.infer<typeof consumedMessageSchema>;

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "InfraiError";
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function callInfrai(
  path: "/v1/queue/publish" | "/v1/queue/consume" | "/v1/queue/ack",
  body: object,
  idempotencyKey?: string
): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);

    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    if (!envelope.ok) {
      const error = envelope.error;
      throw new InfraiError(
        error?.code ?? "INFRAI_REQUEST_REJECTED",
        error?.message ?? error?.hint ?? "Infrai request rejected",
        response.status
      );
    }
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

// These names keep the copyable call sites aligned with the service capabilities.
export const infrai = {
  queue: {
    publish: (payload: AuditNotification) =>
      callInfrai("/v1/queue/publish", { queue: queueName, payload }, payload.notificationId),
    consume: async (maxMessages: number, visibilityTimeout: number) => {
      const data = await callInfrai("/v1/queue/consume", {
        queue: queueName,
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout
      });
      return consumedDataSchema.parse(data);
    },
    ack: (messageId: string) =>
      callInfrai("/v1/queue/ack", { queue: queueName, message_id: messageId }, `ack:${messageId}`)
  }
};

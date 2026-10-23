import { z } from "zod";

export const paymentEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(["payment.authorized", "payment.captured", "payment.failed"]),
  orderId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  riskScore: z.number().min(0).max(100),
  occurredAt: z.string().datetime()
}).strict();

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type RiskAction = "fulfill_order" | "hold_for_review" | "record_failure";

export type AuditNotification = {
  notificationId: string;
  event: PaymentEvent;
  action: RiskAction;
  reason: string;
};

export function planNotification(event: PaymentEvent): AuditNotification {
  let action: RiskAction;
  let reason: string;

  if (event.type === "payment.failed") {
    action = "record_failure";
    reason = "payment_failed";
  } else if (event.riskScore >= 70) {
    action = "hold_for_review";
    reason = "risk_threshold_reached";
  } else {
    action = "fulfill_order";
    reason = "payment_cleared";
  }

  return {
    notificationId: `payment:${event.eventId}`,
    event,
    action,
    reason
  };
}

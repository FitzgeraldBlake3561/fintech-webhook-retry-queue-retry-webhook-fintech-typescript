import assert from "node:assert/strict";
import test from "node:test";
import { paymentEventSchema, planNotification } from "../src/payment_policy.js";

test("a high-risk authorization is held instead of released for fulfillment", () => {
  const event = paymentEventSchema.parse({
    eventId: "evt_risk_7",
    type: "payment.authorized",
    orderId: "order_7",
    amountMinor: 8400,
    currency: "USD",
    riskScore: 86,
    occurredAt: "2026-09-08T09:30:00.000Z"
  });

  assert.deepEqual(planNotification(event), {
    notificationId: "payment:evt_risk_7",
    event,
    action: "hold_for_review",
    reason: "risk_threshold_reached"
  });
});

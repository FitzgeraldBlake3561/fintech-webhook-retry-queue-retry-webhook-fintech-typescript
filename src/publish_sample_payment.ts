export {};

const response = await fetch("http://localhost:3000/payment-events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    eventId: "evt_checkout_1042",
    type: "payment.authorized",
    orderId: "order_1042",
    amountMinor: 12900,
    currency: "USD",
    riskScore: 82,
    occurredAt: "2026-09-08T09:30:00.000Z"
  })
});

console.log(response.status, await response.json());

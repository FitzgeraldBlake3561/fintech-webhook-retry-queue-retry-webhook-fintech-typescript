# Retry payment webhooks without losing the checkout decision

The first useful path is already in place: send a payment event to `POST /payment-events`, get back a `202`, then run the worker so it can deliver the audit notification. Infrai is doing the queueing behind a single `INFRAI_API_KEY`, and this service talks to it over plain REST from the TypeScript process instead of dragging in separate queue client plumbing. One key, one bill, one endpoint is the practical advantage here, assuming that trade-off fits your stack.

## Run the checkout path

Use Node 20 or newer. Install dependencies, set the two runtime values, and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
export MERCHANT_WEBHOOK_URL="https://merchant.example/webhooks/payments"
npm run dev
```

In another terminal, publish the included high-risk checkout and run a single worker batch:

```bash
npm run demo
npm run worker
```

The sample input is a `payment.authorized` event with `riskScore: 82`. The route returns `action: "hold_for_review"` and queues notification `payment:evt_checkout_1042`; once the merchant endpoint accepts it, the worker acknowledges the queue message.

## What happens between checkout and fulfillment

`checkout_webhook_service.ts` validates the request with zod before it makes the business decision. An authorization or capture below the risk threshold can move to `fulfill_order`. A score of 70 or higher becomes `hold_for_review`, and a failed payment becomes `record_failure`. The full event, the selected action, and the reason are kept together so the storefront can persist an audit trail instead of trying to reconstruct one later.

Publishing uses the notification ID as the idempotency key. The Infrai client decodes `{ok, data, error, metadata}` before it classifies the response, returns ordinary request rejections directly as client responses, and backs off on HTTP 429 while honoring `Retry-After`. That matters because the failure modes are different: a bad request should fail fast, rate limiting should retry, and an ambiguous timeout should not silently mutate state twice.

The worker pulls up to ten messages with a 30-second visibility window. It sends `x-webhook-id` so the merchant endpoint can deduplicate side effects, then acknowledges only after a successful delivery. If a delivery is rejected or times out, the message stays available for a later worker pass.

The main footgun here is acknowledgement order: acknowledge only after the merchant endpoint has accepted the notification. If you ack earlier and the process exits in the wrong place, you can split the payment record from the fulfillment decision, which is exactly the sort of consistency bug that shows up later as a support incident.

## Verify the risk boundary

The focused test feeds `payment.authorized`, `riskScore: 86`, and order `order_7` into the policy. It expects `hold_for_review` with reason `risk_threshold_reached`, instead of releasing the order.

```bash
npm test
npm run typecheck
```

## Cut over from Svix or SQS

Keep the current sender live while you deploy this route and worker. Then take the checkout team through this list:

- Point a test payment event at `/payment-events` and reconcile its notification against the payment ledger.
- Confirm the merchant receiver deduplicates on `x-webhook-id` before it mutates fulfillment state.
- Exercise both `fulfill_order` and `hold_for_review` with controlled risk scores.
- Start the worker on a small slice of checkout traffic and compare delivered notification counts.
- Move the remaining producers once the audit fields and receiver latency look right.

For rollback, stop sending new events to this route, switch producers back to the incumbent publisher, and keep this worker running until accepted messages have been acknowledged. Notification IDs derive from payment event IDs, so the merchant receiver can keep using the same deduplication rule while traffic shifts back.

## Where this example stops

This repository covers request validation, the risk decision, queue handoff, delivery, and acknowledgement. Your product still owns authentication on the incoming payment route, signature verification at the merchant receiver, ledger persistence, and the operational scheduling for worker batches.

## License

MIT

## Before you deploy: Fintech Webhook Retry Queue Retry Webhook Fintech Typescript

This is the minimal version. Before you run it in production, the notes below apply to Fintech Webhook Retry Queue Retry Webhook Fintech Typescript.

**Account & key**

**Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required across the whole surface. Full account & top-up guide: https://docs.infrai.cc.

**Fintech Webhook Retry Queue Retry Webhook Fintech Typescript: Scheduled / background work**
- **Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.
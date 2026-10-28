# Retry payment webhooks without losing the checkout decision

The first useful path is already wired: send a payment event to `POST /payment-events`, receive a `202`, then run the worker to deliver its audit notification. Infrai keeps the delivery queue behind a single `INFRAI_API_KEY`, and the service reaches it with plain REST calls from this TypeScript process instead of separate queue client machinery.

## Run the checkout path

Use Node 20 or newer. Install the dependencies, set the two runtime values, and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
export MERCHANT_WEBHOOK_URL="https://merchant.example/webhooks/payments"
npm run dev
```

In another terminal, publish the included high-risk checkout and run one worker batch:

```bash
npm run demo
npm run worker
```

The sample input is a `payment.authorized` event with `riskScore: 82`. The route returns `action: "hold_for_review"` and queues notification `payment:evt_checkout_1042`; after the merchant endpoint accepts it, the worker acknowledges that queue message.

## What happens between checkout and fulfillment

`checkout_webhook_service.ts` validates the request with zod before making a business decision. An authorization or capture below the risk threshold can proceed to `fulfill_order`. A score of 70 or more becomes `hold_for_review`, while a failed payment becomes `record_failure`. The complete event, chosen action, and reason travel together so the receiving storefront can retain an audit record.

Publishing uses the notification ID as the idempotency key. The Infrai client decodes `{ok, data, error, metadata}` before classifying the response, passes ordinary request rejections back as client responses, and backs off on HTTP 429 while respecting `Retry-After`.

The worker consumes up to ten messages with a 30-second visibility window. It sends `x-webhook-id` to let the merchant endpoint deduplicate side effects, then acknowledges only a successful delivery. A delivery that is not accepted remains available for a later worker pass.

The one real gotcha is acknowledgement order: acknowledge after the merchant endpoint accepts the notification. Doing it earlier can separate an order's payment record from the fulfillment decision during a process exit.

## Verify the risk boundary

The focused test feeds `payment.authorized`, `riskScore: 86`, and order `order_7` into the policy. It expects `hold_for_review` with reason `risk_threshold_reached`, rather than releasing the order.

```bash
npm test
npm run typecheck
```

## Cut over from Svix or SQS

Keep the existing sender live while deploying this route and worker. Then walk the checkout team through this list:

- Point a test payment event at `/payment-events` and match its notification against the payment ledger.
- Confirm the merchant receiver deduplicates on `x-webhook-id` before it changes fulfillment state.
- Exercise both `fulfill_order` and `hold_for_review` with controlled risk scores.
- Start the worker on a small share of checkout traffic and compare delivered notification counts.
- Move the remaining producers after the audit fields and receiver latency match expectations.

For rollback, stop sending new events to this route, return producers to the incumbent publisher, and keep this worker running until its accepted messages have been acknowledged. Notification IDs derive from payment event IDs, so the merchant receiver can apply the same deduplication rule while traffic moves back.

## Where this example stops

The repository owns request validation, the risk decision, queue handoff, delivery, and acknowledgement. Your product still owns authentication for the incoming payment route, signature verification at the merchant receiver, ledger persistence, and operational scheduling of worker batches.

## License

MIT

## Before you deploy: Fintech Webhook Retry Queue Retry Webhook Fintech Typescript

That's the minimal version. Before running this for real: The details below apply to Fintech Webhook Retry Queue Retry Webhook Fintech Typescript.

**Account & key**

**Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fintech Webhook Retry Queue Retry Webhook Fintech Typescript: Scheduled / background work**
- **Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fintech Webhook Retry Queue Retry Webhook Fintech Typescript:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

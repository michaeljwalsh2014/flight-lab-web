# Flight Lab Pro billing and access

Launch price: **$2.99 USD/month**, automatically renewed until canceled. No annual plan at launch. The owner keeps free Lifetime Pro. Existing browser storage keys and data formats are unchanged.

## Current activation state

The pricing page and server integration can be deployed before Stripe setup is finished. With missing credentials or activation disabled, the page says subscriptions are opening soon and checkout fails closed. Code redemption still works. A successful browser redirect is never treated as payment proof.

## Finish Stripe setup

1. Finish creating **Flight Lab Pro**, a recurring **$2.99 USD monthly** price, in the sandbox. Enable Managed Payments for an eligible product tax category.
2. Complete business verification and payout setup directly in Stripe before real-money activation.
3. Create the matching live product/price. Use its `price_…` ID, not the product ID.
4. Configure a **snapshot webhook destination** pointing to:
   `https://flight-lab-airplane.mikewalsh3119.chatgpt.site/api/billing/webhook`
   Use API version `2025-03-31.basil` and these event types:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Configure runtime secrets through Sites settings, never in Git, client code, or chat:
   - `STRIPE_SECRET_KEY`: matching account's live secret API key
   - `STRIPE_PRICE_ID`: live monthly price ID
   - `STRIPE_WEBHOOK_SECRET`: matching live endpoint's signing secret
   - `FLIGHT_LAB_PAYMENTS_ENABLED`: leave absent/false until integration verification is complete; set to `true` for activation.
6. Complete end-to-end Stripe sandbox verification in an isolated test environment before enabling real charges. Current production checkout intentionally rejects test keys. Verify initial purchase, duplicate clicks/concurrent sessions, renewal, failed renewal, delayed/replayed/out-of-order webhooks, account association, cancellation, and paid-period expiry. Unit fixtures do not replace this check.
7. Save and deploy a new Sites version to apply runtime changes. Keep previous versions available for rollback.

References: [Managed Payments integration](https://docs.stripe.com/payments/managed-payments/set-up), [webhook verification](https://docs.stripe.com/webhooks).

Checkout validates the configured price, currency, billing interval and live mode server-side. Persistent account reservations and Stripe idempotency reuse an outstanding checkout. Stripe customer subscriptions are checked before creating another checkout. Webhooks verify the raw-body signature and replay window, retrieve the current Stripe subscription, and match it to a server-created account/customer record. Paid-period access is stored in D1; cancellation at period end retains paid access. Failed renewal cannot extend a paid term. Existing grants remain intact if subscriptions expire.

## Free Pro codes

Sign in as the Flight Lab owner and open `/pricing`. Expand **Owner: free Pro pass code**, then generate a code. It is a randomly generated reusable code displayed only in the response to that owner action. Save it privately. Only its SHA-256 digest is stored in D1.

Recipients sign in, select **More → Enter a code**, and redeem it. Access is attached to the verified account and persists across devices. Each account gets two guesses. The second incorrect guess locks entry for 24 hours; the server atomically reserves attempts before comparing a digest. Clearing browser data cannot reset the lockout. Locks do not block payment or Free features. Blank inputs do not consume an attempt.

Generating a replacement retires previous codes for new redemptions, while keeping existing account grants. Legacy `/pro/share/...` bearer links now redirect to `/pricing`; the old environment secret is preserved but no longer authorizes access.

New tables and bounded schema-only migrations are additive. No planes, throws, photos, feedback, Coach conversations or browser preferences are deleted or migrated by this update.

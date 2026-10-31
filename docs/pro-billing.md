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

Only the one code verified against `FLIGHT_LAB_BROWSER_CODE_HASH` is accepted. Stored legacy codes are not consulted, and `/api/billing/codes` cannot generate additional codes. The plaintext code is not stored in source or the database. Existing grants and browser passes remain intact; an existing grant never causes a wrong code to be reported as valid.

Recipients enter the code at `/pricing` without signing in. Two incorrect guesses trigger the existing 24-hour server-side lockout. Legacy `/pro/share/...` bearer links redirect to the code-entry page.

New tables and bounded schema-only migrations are additive. No planes, throws, photos, feedback, Coach conversations or browser preferences are deleted or migrated by this update.

## Code-only testing (payments paused)

`/pricing` now serves a direct code-entry screen without payment or sign-in. `FLIGHT_LAB_PAYMENTS_ENABLED` is false. The reusable test code is configured as a digest in secret `FLIGHT_LAB_BROWSER_CODE_HASH`; `FLIGHT_LAB_BROWSER_PASS_SECRET` signs 30-day, Secure, HttpOnly, SameSite=Lax browser passes. Neither plaintext code nor signing secret belongs in source control. Anonymous redemptions do not create persistent grants tied to network addresses. Two failed guesses are limited in D1 by verified account or Cloudflare-supplied network identity (a shared anonymous bucket if that header is unavailable). Anonymous code holders share the code's existing AI budgets; changing browser client IDs cannot reset them. Signed-in accounts retain their existing daily allowance identities.

## Persistent entry lockout UI

The code page reads the D1 lockout during server rendering and disables entry before hydration. The browser also checks the no-store status endpoint on mount, focus, visibility changes and expiry; only a successful server check can enable entry. Status reads do not spend guesses or extend the lockout. The field and submit button stay disabled while locked, checking, or unable to verify status. The advance warning about attempt counts has been removed; a locked screen shows when entry can resume.

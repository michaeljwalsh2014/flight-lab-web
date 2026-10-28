import { billingDb, type SubscriptionRecord } from "./billing-store";
export const SITE_ORIGIN = "https://flight-lab-airplane.mikewalsh3119.chatgpt.site";
export function checkoutReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") && process.env.STRIPE_PRICE_ID?.startsWith("price_") && process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") && process.env.FLIGHT_LAB_PAYMENTS_ENABLED === "true");
}
export async function stripe<T>(path: string, values?: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not connected yet.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: values ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2025-03-31.basil", ...(values ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: values ? new URLSearchParams(values).toString() : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Stripe could not complete that request. Please try again shortly.");
  return response.json() as Promise<T>;
}
export async function stripeCustomer(account: string, email: string) {
  const db = await billingDb();
  const saved = await db.prepare("SELECT customer FROM billing_customers WHERE account = ?").bind(account).first<{ customer: string }>();
  if (saved) return saved.customer;
  const customer = await stripe<{ id: string }>("customers", { email, "metadata[flight_lab_account]": account }, `flight-lab-customer-${account}`);
  await db.prepare("INSERT OR IGNORE INTO billing_customers (account, customer) VALUES (?, ?)").bind(account, customer.id).run();
  return customer.id;
}
export type StripeSubscription = {
  id: string; customer: string; status: string; metadata?: { flight_lab_account?: string }; cancel_at_period_end: boolean;
  items: { data: Array<{ current_period_end: number; price: { id: string } }> };
  latest_invoice?: { status: string } | null;
};
export function subscriptionSnapshot(sub: StripeSubscription, account: string, eventTime: number): SubscriptionRecord {
  const item = sub.items.data.find(item => item.price.id === process.env.STRIPE_PRICE_ID);
  const paid = sub.latest_invoice?.status === "paid";
  return { subscription: sub.id, account, customer: sub.customer, status: sub.status,
    paid_until: item && paid ? item.current_period_end * 1000 : 0, cancel_at_end: sub.cancel_at_period_end ? 1 : 0, updated_at: eventTime };
}
export async function syncSubscription(subscriptionId: string, eventTime: number) {
  if (!/^sub_[a-zA-Z0-9]+$/.test(subscriptionId)) throw new Error("Invalid subscription.");
  const sub = await stripe<StripeSubscription>(`subscriptions/${subscriptionId}?expand[]=latest_invoice`);
  const account = sub.metadata?.flight_lab_account;
  if (!account || !/^[a-f0-9]{64}$/.test(account)) return;
  const db = await billingDb();
  const customer = await db.prepare("SELECT account FROM billing_customers WHERE account = ? AND customer = ?").bind(account, sub.customer).first();
  if (!customer) throw new Error("Subscription account not available yet.");
  const row = subscriptionSnapshot(sub, account, eventTime);
  // Preserve the previously paid term when a renewal fails; never extend it.
  await db.prepare(`INSERT INTO billing_subscriptions (subscription, account, customer, status, paid_until, cancel_at_end, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(subscription) DO UPDATE SET status = excluded.status,
    paid_until = CASE WHEN excluded.status = 'past_due' THEN MAX(billing_subscriptions.paid_until, excluded.paid_until) ELSE excluded.paid_until END,
    cancel_at_end = excluded.cancel_at_end, updated_at = excluded.updated_at
    WHERE billing_subscriptions.account = excluded.account AND billing_subscriptions.updated_at <= excluded.updated_at`)
    .bind(row.subscription, row.account, row.customer, row.status, row.paid_until, row.cancel_at_end, row.updated_at).run();
}
export async function verifyStripeSignature(raw: string, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(",");
  const timestamp = parts.find(part => part.startsWith("t="))?.slice(2) ?? "";
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  for (const value of signatures) {
    if (!/^[a-f0-9]{64}$/.test(value)) continue;
    const bytes = Uint8Array.from(value.match(/../g)!, byte => parseInt(byte, 16));
    if (await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(`${timestamp}.${raw}`))) return true;
  }
  return false;
}

import { getProAccess } from "@/app/pro-access";
import { readEntitlement, billingDb } from "@/app/billing-store";
import { checkoutReady, stripe, stripeCustomer, SITE_ORIGIN } from "@/app/stripe-server";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  const { user, account, hasPro } = await getProAccess();
  if (!user || !account) return json({ message: "Sign in to subscribe." }, 401);
  if (hasPro) return json({ message: "Your account already has Pro." }, 409);
  if (!checkoutReady()) return json({ message: "Paid subscriptions are not open yet. Access codes are available under More." }, 503);
  try {
    const entitlement = await readEntitlement(account);
    if (entitlement.subscriptions.some(sub => !["canceled", "incomplete_expired"].includes(sub.status))) return json({ message: "You already have a subscription. Manage it below instead of starting another." }, 409);
    const priceId = process.env.STRIPE_PRICE_ID!;
    const price = await stripe<{ active: boolean; currency: string; unit_amount: number; recurring: { interval: string; interval_count: number }; livemode: boolean }>(`prices/${encodeURIComponent(priceId)}`);
    if (!price.active || !price.livemode || price.currency !== "usd" || price.unit_amount !== 299 || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) return json({ message: "The monthly plan is not configured correctly yet." }, 503);
    const customer = await stripeCustomer(account, user.email);
    // Stripe is authoritative even if a webhook has not arrived yet.
    const current = await stripe<{ data: Array<{ status: string }> }>(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
    if (current.data.some(sub => !["canceled", "incomplete_expired"].includes(sub.status))) return json({ message: "A subscription is already associated with this account. Please refresh in a moment." }, 409);
    const db = await billingDb();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`INSERT INTO checkout_reservations (account, nonce, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(account) DO UPDATE SET nonce = excluded.nonce, expires_at = excluded.expires_at
      WHERE checkout_reservations.expires_at <= ?`).bind(account, crypto.randomUUID(), now + 1900, now).run();
    const reservation = await db.prepare("SELECT nonce, expires_at FROM checkout_reservations WHERE account = ?").bind(account).first<{ nonce: string; expires_at: number }>();
    if (!reservation) throw new Error("Checkout reservation unavailable.");
    const session = await stripe<{ url: string }>("checkout/sessions", {
      mode: "subscription", customer, "line_items[0][price]": priceId, "line_items[0][quantity]": "1",
      "managed_payments[enabled]": "true", "subscription_data[metadata][flight_lab_account]": account,
      "metadata[flight_lab_account]": account, client_reference_id: account,
      success_url: `${SITE_ORIGIN}/pricing?checkout=success`, cancel_url: `${SITE_ORIGIN}/pricing?checkout=canceled`,
      expires_at: String(reservation.expires_at),
    }, `flight-lab-checkout-${account}-${reservation.nonce}`);
    return json({ url: session.url });
  } catch { return json({ message: "Checkout is unavailable right now. Please try again shortly." }, 503); }
}

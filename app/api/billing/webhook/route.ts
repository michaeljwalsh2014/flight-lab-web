import { verifyStripeSignature, syncSubscription } from "@/app/stripe-server";
import { billingJson as json } from "@/app/billing-http";
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "webhook_not_configured" }, 503);
  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: "payload_too_large" }, 413);
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature") ?? "", secret))) return json({ error: "invalid_signature" }, 400);
  try {
    const event = JSON.parse(raw);
    if (event.livemode !== Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"))) return json({ error: "mode_mismatch" }, 400);
    const object = event.data?.object;
    let subscription = "";
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) subscription = object?.id;
    else if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid", "invoice.payment_failed"].includes(event.type)) subscription = object?.subscription ?? object?.parent?.subscription_details?.subscription;
    if (typeof subscription === "string" && subscription) await syncSubscription(subscription, event.created);
    return json({ received: true });
  } catch { return json({ error: "sync_failed" }, 503); }
}

import { getProAccess } from "@/app/pro-access";
import { readEntitlement } from "@/app/billing-store";
import { stripe, syncSubscription } from "@/app/stripe-server";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  const { account } = await getProAccess();
  if (!account) return json({ message: "Sign in first." }, 401);
  try {
    const { subscriptions } = await readEntitlement(account);
    const active = subscriptions.filter(sub => ["active", "past_due", "unpaid"].includes(sub.status));
    if (!active.length) return json({ message: "No renewable subscription was found." }, 404);
    for (const sub of active) {
      await stripe(`subscriptions/${encodeURIComponent(sub.subscription)}`, { cancel_at_period_end: "true" });
      await syncSubscription(sub.subscription, Math.floor(Date.now() / 1000));
    }
    return json({ message: "Renewal canceled. Pro remains available until the end of your paid period." });
  } catch { return json({ message: "Cancellation could not be confirmed. Please try again, or manage the purchase through Link." }, 503); }
}

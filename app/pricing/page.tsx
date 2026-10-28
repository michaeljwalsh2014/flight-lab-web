import { getProAccess } from "@/app/pro-access";
import { checkoutReady } from "@/app/stripe-server";
import { readEntitlement } from "@/app/billing-store";
import Pricing from "./pricing";
export const dynamic = "force-dynamic";
export default async function PricingPage() {
  const access = await getProAccess();
  let subscription: { endsAt: number; cancelAtEnd: boolean } | null = null;
  if (access.account) {
    try {
      const { subscriptions } = await readEntitlement(access.account);
      const sub = subscriptions.find(sub => ["active", "past_due", "unpaid"].includes(sub.status));
      if (sub) subscription = { endsAt: sub.paid_until, cancelAtEnd: Boolean(sub.cancel_at_end) };
    } catch { /* Checkout and redemption fail closed if storage is unavailable. */ }
  }
  return <Pricing authenticated={Boolean(access.user)} isOwner={access.isOwner} hasPro={access.hasPro} freePass={access.freePass} ready={checkoutReady()} subscription={subscription} unavailable={access.unavailable} />;
}

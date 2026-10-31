import { billingJson as json, sameOrigin } from "@/app/billing-http";
// Code issuance is intentionally disabled: only the existing configured code
// can redeem Pro. Keep historical code/grant records intact.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  return json({ message: "Creating additional codes is disabled. Use the existing Pro access code." }, 409);
}

import { getProAccess } from "@/app/pro-access";
import { issueCode } from "@/app/billing-store";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  if (!(await getProAccess()).isOwner) return json({ message: "Owner access required." }, 403);
  try { return json({ code: await issueCode(), message: "Share this code privately. It is shown only now. Previous codes stop accepting new redemptions; people already granted Pro keep it." }); }
  catch { return json({ message: "The code could not be created. Try again later." }, 503); }
}

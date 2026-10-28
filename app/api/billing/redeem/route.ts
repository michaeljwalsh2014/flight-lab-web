import { getProAccess } from "@/app/pro-access";
import { redeemCode } from "@/app/billing-store";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  const { account } = await getProAccess();
  if (!account) return json({ message: "Sign in before entering your code." }, 401);
  const raw = await request.text();
  if (raw.length > 512) return json({ message: "That code is too long." }, 400);
  let code = "";
  try { const body = JSON.parse(raw); if (typeof body.code === "string") code = body.code.slice(0, 128); } catch { return json({ message: "Enter your access code." }, 400); }
  if (!code.trim()) return json({ message: "Enter your access code." }, 400);
  try {
    const result = await redeemCode(account, code);
    return json({ ...result, message: result.ok ? "Free Pro is now active for your account." : result.remaining === 0 ? "Code entry is locked for 24 hours. You can still subscribe to Pro." : "Incorrect code. You have one attempt remaining." }, result.ok ? 200 : result.remaining === 0 ? 429 : 400);
  } catch { return json({ message: "Code entry is temporarily unavailable. No access has been changed." }, 503); }
}

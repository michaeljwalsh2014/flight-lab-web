import { getProAccess } from "@/app/pro-access";
import { makeBrowserPass, PRO_PASS_COOKIE, PASS_SECONDS } from "@/app/browser-pro-pass";
import { redeemCode, sha256 } from "@/app/billing-store";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  const { account } = await getProAccess();
  if (!process.env.FLIGHT_LAB_BROWSER_PASS_SECRET || !process.env.FLIGHT_LAB_BROWSER_CODE_HASH) return json({ message: "Pro code access is temporarily unavailable." }, 503);
  // Cloudflare supplies this header; no client ID or browser storage resets it.
  // If the edge does not expose an IP, use a shared anonymous bucket rather
  // than accepting a caller-controlled identity and an unlimited guess budget.
  const attemptIdentity = account ?? await sha256(`anonymous-pro-code:${request.headers.get("cf-connecting-ip") ?? "shared"}`);
  const raw = await request.text();
  if (raw.length > 512) return json({ message: "That code is too long." }, 400);
  let code = "";
  try { const body = JSON.parse(raw); if (typeof body.code === "string") code = body.code.slice(0, 128); } catch { return json({ message: "Enter your access code." }, 400); }
  if (!code.trim()) return json({ message: "Enter your access code." }, 400);
  try {
    const result = await redeemCode(attemptIdentity, code, Date.now(), Boolean(account));
    const response = json({ ...result, message: result.ok ? "Pro is unlocked on this browser. No sign-in or payment needed." : result.remaining === 0 ? "Code entry is locked for 24 hours." : "Incorrect code. You have one attempt remaining." }, result.ok ? 200 : result.remaining === 0 ? 429 : 400);
    if (result.ok) response.headers.append("Set-Cookie", `${PRO_PASS_COOKIE}=${await makeBrowserPass()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${PASS_SECONDS}`);
    return response;
  } catch { return json({ message: "Code entry is temporarily unavailable. No access has been changed." }, 503); }
}

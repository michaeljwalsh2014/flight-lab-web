import { getProAccess } from "@/app/pro-access";
import { makeBrowserPass, PRO_PASS_COOKIE, PASS_SECONDS } from "@/app/browser-pro-pass";
import { redeemCode, codeAttemptIdentity, readCodeLockout } from "@/app/billing-store";
import { billingJson as json, sameOrigin } from "@/app/billing-http";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "Refresh the page and try again." }, 403);
  const { account } = await getProAccess();
  if (!process.env.FLIGHT_LAB_BROWSER_PASS_SECRET || !process.env.FLIGHT_LAB_BROWSER_CODE_HASH) return json({ message: "Pro code access is temporarily unavailable." }, 503);
  const attemptIdentity = await codeAttemptIdentity(account, request.headers);
  const raw = await request.text();
  if (raw.length > 512) return json({ message: "That code is too long." }, 400);
  let code = "";
  try { const body = JSON.parse(raw); if (typeof body.code === "string") code = body.code.slice(0, 128); } catch { return json({ message: "Enter your access code." }, 400); }
  if (!code.trim()) return json({ message: "Enter your access code." }, 400);
  try {
    const result = await redeemCode(attemptIdentity, code, Date.now(), Boolean(account));
    const response = json({ ...result, serverNow: Date.now(), message: result.ok ? "Pro is unlocked on this browser. No sign-in or payment needed." : result.remaining === 0 ? "Code entry is temporarily unavailable." : "Incorrect code. Try again." }, result.ok ? 200 : result.remaining === 0 ? 429 : 400);
    if (result.ok) response.headers.append("Set-Cookie", `${PRO_PASS_COOKIE}=${await makeBrowserPass()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${PASS_SECONDS}`);
    return response;
  } catch { return json({ message: "Code entry is temporarily unavailable. No access has been changed." }, 503); }
}

export const dynamic = "force-dynamic";
// Checking status never consumes a guess or extends the lockout.
export async function GET(request: Request) {
  try {
    const { account } = await getProAccess();
    const identity = await codeAttemptIdentity(account, request.headers);
    const serverNow = Date.now();
    return json({ retryAt: await readCodeLockout(identity, serverNow), serverNow });
  } catch { return json({ message: "Code entry could not be checked. Please try again." }, 503); }
}

import { headers } from "next/headers";
export const PRO_PASS_COOKIE = "__Host-flight-lab-pro-pass";
export const PASS_SECONDS = 30 * 24 * 60 * 60;
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
async function signingKey() {
  const secret = process.env.FLIGHT_LAB_BROWSER_PASS_SECRET;
  if (!secret) throw new Error("Pro pass is not configured.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function makeBrowserPass(now = Date.now()) {
  const version = process.env.FLIGHT_LAB_BROWSER_CODE_HASH;
  if (!version || !/^[a-f0-9]{64}$/.test(version)) throw new Error("Pro code is not configured.");
  const payload = `${Math.floor(now / 1000) + PASS_SECONDS}.${version}`;
  const signature = hex(await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(payload)));
  return `${payload}.${signature}`;
}
export async function verifyBrowserPass(token: string, now = Date.now()) {
  const [expires, version, signature, extra] = token.split(".");
  if (extra !== undefined || !/^\d+$/.test(expires ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "") || !version || version !== process.env.FLIGHT_LAB_BROWSER_CODE_HASH || Number(expires) <= now / 1000 || Number(expires) > now / 1000 + PASS_SECONDS + 60) return false;
  try {
    const bytes = Uint8Array.from(signature.match(/../g)!, byte => parseInt(byte, 16));
    return await crypto.subtle.verify("HMAC", await signingKey(), bytes, new TextEncoder().encode(`${expires}.${version}`));
  } catch { return false; }
}
export async function readBrowserPass() {
  const cookie = (await headers()).get("cookie") ?? "";
  const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${PRO_PASS_COOKIE}=`))?.slice(PRO_PASS_COOKIE.length + 1) ?? "";
  return token && await verifyBrowserPass(token) ? `browser-pass:${process.env.FLIGHT_LAB_BROWSER_CODE_HASH}` : null;
}

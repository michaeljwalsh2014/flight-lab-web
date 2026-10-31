export async function billingDb() {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Account storage is unavailable. Please try again later.");
  return db;
}
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
export const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
export const LOCKOUT_MS = 24 * 60 * 60 * 1000;
export type SubscriptionRecord = { subscription: string; account: string; customer: string; status: string; paid_until: number; cancel_at_end: number; updated_at: number };
export function subscriptionHasAccess(row: SubscriptionRecord, now = Date.now()) {
  return ["active", "past_due"].includes(row.status) && row.paid_until > now;
}
export async function readEntitlement(account: string) {
  const db = await billingDb();
  const grant = await db.prepare("SELECT account FROM pro_grants WHERE account = ?").bind(account).first();
  const rows = await db.prepare("SELECT * FROM billing_subscriptions WHERE account = ? ORDER BY paid_until DESC").bind(account).all<SubscriptionRecord>();
  return { grant: Boolean(grant), subscriptions: rows.results, hasPro: Boolean(grant) || rows.results.some(row => subscriptionHasAccess(row)) };
}
// Reserve each guess atomically before checking it. Two simultaneous requests
// cannot both claim the final remaining attempt, even on separate Workers.
export const RESERVE_CODE_ATTEMPT = `INSERT INTO pro_code_attempts (account, attempts, resets_at) VALUES (?, 1, ?)
 ON CONFLICT(account) DO UPDATE SET attempts = CASE WHEN resets_at <= ? THEN 1 ELSE attempts + 1 END,
 resets_at = CASE WHEN resets_at <= ? OR attempts = 1 THEN ? ELSE resets_at END
 WHERE resets_at <= ? OR attempts < 2 RETURNING attempts, resets_at`;
export async function redeemCode(account: string, code: string, now = Date.now(), persistentGrant = true) {
  const db = await billingDb();
  if (persistentGrant && await db.prepare("SELECT account FROM pro_grants WHERE account = ?").bind(account).first()) return { ok: true };
  const attempt = await db.prepare(RESERVE_CODE_ATTEMPT).bind(account, now + LOCKOUT_MS, now, now, now + LOCKOUT_MS, now).first<{ attempts: number; resets_at: number }>();
  if (!attempt) {
    const locked = await db.prepare("SELECT resets_at FROM pro_code_attempts WHERE account = ?").bind(account).first<{ resets_at: number }>();
    return { ok: false, remaining: 0, retryAt: locked?.resets_at ?? now + LOCKOUT_MS };
  }
  const digest = await sha256(normalizeCode(code));
  const valid = await db.prepare("SELECT digest FROM pro_codes WHERE digest = ? AND active = 1").bind(digest).first();
  const browserCodeMatches = Boolean(process.env.FLIGHT_LAB_BROWSER_CODE_HASH && digest === process.env.FLIGHT_LAB_BROWSER_CODE_HASH);
  if (!valid && !browserCodeMatches) return { ok: false, remaining: 2 - attempt.attempts, retryAt: attempt.attempts === 2 ? attempt.resets_at : null };
  if (persistentGrant) await db.prepare("INSERT OR IGNORE INTO pro_grants (account, created_at) VALUES (?, ?)").bind(account, now).run();
  await db.prepare("DELETE FROM pro_code_attempts WHERE account = ?").bind(account).run();
  return { ok: true };
}
export async function issueCode() {
  const code = "FL-" + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const db = await billingDb();
  await db.batch([
    db.prepare("UPDATE pro_codes SET active = 0 WHERE active = 1"),
    db.prepare("INSERT INTO pro_codes (digest, active, created_at) VALUES (?, 1, ?)").bind(await sha256(normalizeCode(code)), Date.now()),
  ]);
  return code;
}

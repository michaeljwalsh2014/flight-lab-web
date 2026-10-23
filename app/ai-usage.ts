import { freePeriod } from "./free-usage";
import { getProAccess } from "./pro-access";
/** D1 atomically budgets each account or shared pass across Worker instances. */
export async function allowAIUsage(kind: string, limit: number): Promise<boolean> {
  try {
    const { user, isOwner } = await getProAccess();
    const identity = user && isOwner ? `owner:${user.email.toLowerCase()}` : `pass:${process.env.FLIGHT_LAB_PRO_SHARE_TOKEN ?? ""}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    const key = `${kind}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return false;
    await db.prepare("CREATE TABLE IF NOT EXISTS ai_usage (identity TEXT PRIMARY KEY, window INTEGER NOT NULL, requests INTEGER NOT NULL)").run();
    const window = Math.floor(Date.now() / 600_000);
    const row = await db.prepare(`INSERT INTO ai_usage (identity, window, requests) VALUES (?, ?, 1)
      ON CONFLICT(identity) DO UPDATE SET window = excluded.window,
      requests = CASE WHEN ai_usage.window = excluded.window THEN ai_usage.requests + 1 ELSE 1 END
      WHERE ai_usage.window != excluded.window OR ai_usage.requests < ? RETURNING requests`).bind(key, window, limit).first();
    return Boolean(row);
  } catch { return false; }
}

/** Daily Pro chat allowance uses verified accounts, never client-controlled IDs. */
async function reserveProDaily(kind: "coach" | "reviews", limit: number, now = new Date()): Promise<"allowed" | "sign_in_required" | "exhausted" | "unavailable"> {
  const { user } = await getProAccess();
  if (!user) return "sign_in_required";
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return "unavailable";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pro-${kind}:${user.email.trim().toLowerCase()}`));
    const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await db.prepare("CREATE TABLE IF NOT EXISTS pro_coach_daily_usage (identity TEXT NOT NULL, period TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (identity, period))").run();
    const row = await db.prepare(`INSERT INTO pro_coach_daily_usage (identity, period, messages) VALUES (?, ?, 1)
      ON CONFLICT(identity, period) DO UPDATE SET messages = messages + 1
      WHERE messages < ? RETURNING messages`).bind(identity, freePeriod(now).period, limit).first();
    return row ? "allowed" : "exhausted";
  } catch { return "unavailable"; }
}

export const reserveProMessage = (now = new Date()) => reserveProDaily("coach", 50, now);
export const reserveProReview = (now = new Date()) => reserveProDaily("reviews", 7, now);
export async function refundProReview(now: Date) {
  try {
    const { user } = await getProAccess();
    if (!user) return;
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pro-reviews:${user.email.trim().toLowerCase()}`));
    const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await db?.prepare("UPDATE pro_coach_daily_usage SET messages = MAX(0, messages - 1) WHERE identity = ? AND period = ?").bind(identity, freePeriod(now).period).run();
  } catch { /* Leave the daily cap conservative when storage is unavailable. */ }
}

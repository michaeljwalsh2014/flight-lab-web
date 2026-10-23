export const FREE_LIMITS = { messages: 20, photos: 3 } as const;
export type FreeFeature = keyof typeof FREE_LIMITS;
export type FreeUsage = { authenticated: boolean; messagesRemaining: number; photosRemaining: number; resetsAt: string };
const CENTRAL = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function centralParts(date: Date) {
  return Object.fromEntries(CENTRAL.formatToParts(date).map(part => [part.type, part.value]));
}
function sixAM(localDate: number) {
  // At noon UTC, Chicago is either 6 a.m. (standard) or 7 a.m. (daylight time).
  // Resolving each date separately keeps both spring and fall DST resets at 6 a.m.
  const noon = new Date(localDate + 12 * 3600000);
  return new Date(noon.getTime() + (6 - Number(centralParts(noon).hour)) * 3600000);
}
export function freePeriod(now = new Date()) {
  const local = centralParts(now);
  const date = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day));
  const todayReset = sixAM(date);
  const afterReset = now.getTime() >= todayReset.getTime();
  const start = date - (afterReset ? 0 : 86400000);
  return { period: new Date(start).toISOString().slice(0, 10), resetsAt: (afterReset ? sixAM(date + 86400000) : todayReset).toISOString() };
}
export function usageView(messages = 0, photos = 0, now = new Date()): FreeUsage {
  return { authenticated: true, messagesRemaining: Math.max(0, FREE_LIMITS.messages - messages), photosRemaining: Math.max(0, FREE_LIMITS.photos - photos), resetsAt: freePeriod(now).resetsAt };
}
export async function freeUsageDb() {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Free AI allowance is temporarily unavailable. Please try again shortly.");
  await db.prepare("CREATE TABLE IF NOT EXISTS free_ai_usage (identity TEXT NOT NULL, period TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0, photos INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (identity, period))").run();
  return db;
}
export async function freeIdentity(email: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`flight-lab-free:${email.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function readFreeUsage(db: D1Database, identity: string, now = new Date()) {
  const row = await db.prepare("SELECT messages, photos FROM free_ai_usage WHERE identity = ? AND period = ?").bind(identity, freePeriod(now).period).first<{ messages: number; photos: number }>();
  return usageView(row?.messages, row?.photos, now);
}
export async function reserveFreeUsage(db: D1Database, identity: string, feature: FreeFeature, now = new Date()) {
  // Column and limit come only from server-owned constants. The condition and increment are atomic.
  if (feature !== "messages" && feature !== "photos") throw new Error("Invalid free feature");
  return db.prepare(`INSERT INTO free_ai_usage (identity, period, ${feature}) VALUES (?, ?, 1)
    ON CONFLICT(identity, period) DO UPDATE SET ${feature} = ${feature} + 1
    WHERE ${feature} < ? RETURNING messages, photos`).bind(identity, freePeriod(now).period, FREE_LIMITS[feature]).first<{ messages: number; photos: number }>();
}
export async function refundFreeMessage(db: D1Database, identity: string, period: string) {
  await db.prepare("UPDATE free_ai_usage SET messages = MAX(0, messages - 1) WHERE identity = ? AND period = ?").bind(identity, period).run();
}

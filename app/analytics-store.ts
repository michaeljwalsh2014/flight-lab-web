async function analyticsDb() {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Flight Lab analytics storage is unavailable.");
  return db;
}

export async function recordAnonymousView() {
  const db = await analyticsDb();
  await db.prepare(`
    INSERT INTO site_analytics (id, total_views, updated_at)
    VALUES (1, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      total_views = total_views + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run();
}

export async function readAnonymousViews() {
  const db = await analyticsDb();
  const row = await db.prepare("SELECT total_views FROM site_analytics WHERE id = ?")
    .bind(1).first<{ total_views: number }>();
  return Math.max(0, Number(row?.total_views) || 0);
}

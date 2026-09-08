import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const siteAnalytics = sqliteTable("site_analytics", {
  id: integer("id").primaryKey(),
  totalViews: integer("total_views").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

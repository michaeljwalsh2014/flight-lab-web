import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const siteAnalytics = sqliteTable("site_analytics", {
  id: integer("id").primaryKey(),
  totalViews: integer("total_views").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const proGrants = sqliteTable("pro_grants", {
  account: text("account").primaryKey(), createdAt: integer("created_at").notNull(),
});
export const proCodes = sqliteTable("pro_codes", {
  digest: text("digest").primaryKey(), active: integer("active").notNull().default(1), createdAt: integer("created_at").notNull(),
});
export const proCodeAttempts = sqliteTable("pro_code_attempts", {
  account: text("account").primaryKey(), attempts: integer("attempts").notNull(), resetsAt: integer("resets_at").notNull(),
});
export const billingCustomers = sqliteTable("billing_customers", {
  account: text("account").primaryKey(), customer: text("customer").notNull(),
});
export const billingSubscriptions = sqliteTable("billing_subscriptions", {
  subscription: text("subscription").primaryKey(), account: text("account").notNull(), customer: text("customer").notNull(),
  status: text("status").notNull(), paidUntil: integer("paid_until").notNull(), cancelAtEnd: integer("cancel_at_end").notNull().default(0), updatedAt: integer("updated_at").notNull(),
});

export const checkoutReservations = sqliteTable("checkout_reservations", {
  account: text("account").primaryKey(), nonce: text("nonce").notNull(), expiresAt: integer("expires_at").notNull(),
});

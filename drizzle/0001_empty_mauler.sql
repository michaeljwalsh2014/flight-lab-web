CREATE TABLE `billing_customers` (
	`account` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`subscription` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`customer` text NOT NULL,
	`status` text NOT NULL,
	`paid_until` integer NOT NULL,
	`cancel_at_end` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pro_code_attempts` (
	`account` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`resets_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pro_codes` (
	`digest` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pro_grants` (
	`account` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);

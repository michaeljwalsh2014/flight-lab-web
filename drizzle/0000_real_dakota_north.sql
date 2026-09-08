CREATE TABLE `site_analytics` (
	`id` integer PRIMARY KEY NOT NULL,
	`total_views` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

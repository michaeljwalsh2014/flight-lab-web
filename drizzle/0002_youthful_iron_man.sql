CREATE TABLE `checkout_reservations` (
	`account` text PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL
);

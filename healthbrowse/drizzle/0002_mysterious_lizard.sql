ALTER TABLE `hb_accounts` ADD `first_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hb_accounts` ADD `last_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hb_accounts` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hb_accounts` ADD `avatar` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hb_accounts` ADD `timezone` text DEFAULT 'UTC' NOT NULL;
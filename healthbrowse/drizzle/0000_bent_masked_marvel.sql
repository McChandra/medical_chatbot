CREATE TABLE `hb_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`save_chats` integer DEFAULT 1 NOT NULL,
	`save_history` integer DEFAULT 0 NOT NULL,
	`reading_mode` text DEFAULT 'General reader' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`history_epoch` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_research_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`kind` text NOT NULL,
	`section` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `hb_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hb_activity_owner_time` ON `hb_research_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hb_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `hb_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hb_bookmarks_owner_time` ON `hb_bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hb_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`reading_mode` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `hb_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hb_chats_owner_time` ON `hb_chats` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `hb_chat_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`turn_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `hb_chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hb_turns_chat_time` ON `hb_chat_turns` (`chat_id`,`created_at`);
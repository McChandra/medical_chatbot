CREATE TABLE `hb_buddy_sessions` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `session_id`),
	FOREIGN KEY (`user_id`) REFERENCES `hb_accounts`(`user_id`) ON UPDATE no action ON DELETE cascade
);

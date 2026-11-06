CREATE TABLE `hb_model_limits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`requests` integer NOT NULL
);

CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`first_failure_at` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);

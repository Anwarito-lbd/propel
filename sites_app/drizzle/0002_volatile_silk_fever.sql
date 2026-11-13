CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`job_url` text DEFAULT '' NOT NULL,
	`job_description` text DEFAULT '' NOT NULL,
	`difficulty` text DEFAULT 'balanced' NOT NULL,
	`turns_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

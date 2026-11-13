CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text DEFAULT 'Canada' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Shortlisted' NOT NULL,
	`source` text DEFAULT 'Career-Ops' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`location` text DEFAULT 'Canada' NOT NULL,
	`target_titles` text DEFAULT '' NOT NULL,
	`resume_markdown` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);
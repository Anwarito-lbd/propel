CREATE TABLE `candidate_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`location` text DEFAULT 'Canada' NOT NULL,
	`university` text DEFAULT '' NOT NULL,
	`program` text DEFAULT '' NOT NULL,
	`degree` text DEFAULT '' NOT NULL,
	`graduation_year` text DEFAULT '' NOT NULL,
	`work_authorization` text DEFAULT '' NOT NULL,
	`target_titles` text DEFAULT '' NOT NULL,
	`preferred_locations` text DEFAULT '' NOT NULL,
	`languages` text DEFAULT '' NOT NULL,
	`linkedin_url` text DEFAULT '' NOT NULL,
	`portfolio_url` text DEFAULT '' NOT NULL,
	`resume_object_key` text DEFAULT '' NOT NULL,
	`resume_file_name` text DEFAULT '' NOT NULL,
	`resume_content_type` text DEFAULT '' NOT NULL,
	`resume_text` text DEFAULT '' NOT NULL,
	`onboarding_completed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `career_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `career_opportunities` (
	`id` text NOT NULL,
	`owner_email` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`url` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Shortlisted' NOT NULL,
	`source` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_opportunities_owner_id_unique` ON `career_opportunities` (`id`,`owner_email`);--> statement-breakpoint
CREATE TABLE `verified_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`company` text NOT NULL,
	`public_url` text NOT NULL,
	`source` text NOT NULL,
	`verified_at` integer NOT NULL
);

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  location: text("location").notNull().default("Canada"),
  targetTitles: text("target_titles").notNull().default(""),
  resumeMarkdown: text("resume_markdown").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("profiles_email_unique").on(table.email)]);

export const opportunities = sqliteTable("opportunities", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull().default("Canada"),
  url: text("url").notNull().default(""),
  score: integer("score").notNull().default(0),
  status: text("status").notNull().default("Shortlisted"),
  source: text("source").notNull().default("Career-Ops"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const candidateProfiles = sqliteTable("candidate_profiles", {
  email: text("email").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default("Canada"),
  university: text("university").notNull().default(""),
  program: text("program").notNull().default(""),
  degree: text("degree").notNull().default(""),
  graduationYear: text("graduation_year").notNull().default(""),
  workAuthorization: text("work_authorization").notNull().default(""),
  targetTitles: text("target_titles").notNull().default(""),
  preferredLocations: text("preferred_locations").notNull().default(""),
  languages: text("languages").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  portfolioUrl: text("portfolio_url").notNull().default(""),
  resumeObjectKey: text("resume_object_key").notNull().default(""),
  resumeFileName: text("resume_file_name").notNull().default(""),
  resumeContentType: text("resume_content_type").notNull().default(""),
  resumeText: text("resume_text").notNull().default(""),
  onboardingCompleted: integer("onboarding_completed").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const careerOpportunities = sqliteTable("career_opportunities", {
  id: text("id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  url: text("url").notNull(),
  score: integer("score").notNull().default(0),
  status: text("status").notNull().default("Shortlisted"),
  source: text("source").notNull(),
  description: text("description").notNull().default(""),
  checkedAt: integer("checked_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("career_opportunities_owner_id_unique").on(table.id, table.ownerEmail)]);

export const careerArtifacts = sqliteTable("career_artifacts", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const verifiedLeads = sqliteTable("verified_leads", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  company: text("company").notNull(),
  publicUrl: text("public_url").notNull(),
  source: text("source").notNull(),
  verifiedAt: integer("verified_at").notNull(),
});

export const interviewSessions = sqliteTable("interview_sessions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  jobUrl: text("job_url").notNull().default(""),
  jobDescription: text("job_description").notNull().default(""),
  difficulty: text("difficulty").notNull().default("balanced"),
  turnsJson: text("turns_json").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  score: integer("score").notNull().default(0),
  startedAt: integer("started_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type CandidateProfile = {
  email: string;
  fullName: string;
  phone: string;
  location: string;
  university: string;
  program: string;
  degree: string;
  graduationYear: string;
  workAuthorization: string;
  targetTitles: string;
  preferredLocations: string;
  languages: string;
  linkedinUrl: string;
  portfolioUrl: string;
  resumeFileName: string;
  resumeContentType: string;
  resumeText: string;
  onboardingCompleted: boolean;
  updatedAt: number;
};

const profileSchema = `CREATE TABLE IF NOT EXISTS candidate_profiles (
  email TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT 'Canada',
  university TEXT NOT NULL DEFAULT '',
  program TEXT NOT NULL DEFAULT '',
  degree TEXT NOT NULL DEFAULT '',
  graduation_year TEXT NOT NULL DEFAULT '',
  work_authorization TEXT NOT NULL DEFAULT '',
  target_titles TEXT NOT NULL DEFAULT '',
  preferred_locations TEXT NOT NULL DEFAULT '',
  languages TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  portfolio_url TEXT NOT NULL DEFAULT '',
  resume_object_key TEXT NOT NULL DEFAULT '',
  resume_file_name TEXT NOT NULL DEFAULT '',
  resume_content_type TEXT NOT NULL DEFAULT '',
  resume_text TEXT NOT NULL DEFAULT '',
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const opportunitySchema = `CREATE TABLE IF NOT EXISTS career_opportunities (
  id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  url TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Shortlisted',
  source TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  checked_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, owner_email)
)`;

const artifactSchema = `CREATE TABLE IF NOT EXISTS career_artifacts (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

const leadSchema = `CREATE TABLE IF NOT EXISTS verified_leads (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  company TEXT NOT NULL,
  public_url TEXT NOT NULL,
  source TEXT NOT NULL,
  verified_at INTEGER NOT NULL
)`;

const interviewSchema = `CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  job_url TEXT NOT NULL DEFAULT '',
  job_description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'balanced',
  turns_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  score INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

let schemaReady: Promise<void> | null = null;

export async function database() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("D1 binding DB is unavailable.");
  return env.DB;
}

export async function ensureSchema() {
  if (!schemaReady) {
    const db = await database();
    schemaReady = db.batch([
      db.prepare(profileSchema),
      db.prepare(opportunitySchema),
      db.prepare(artifactSchema),
      db.prepare(leadSchema),
      db.prepare(interviewSchema),
      db.prepare("CREATE INDEX IF NOT EXISTS career_opportunities_owner_idx ON career_opportunities(owner_email, updated_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS career_artifacts_owner_idx ON career_artifacts(owner_email, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS verified_leads_owner_idx ON verified_leads(owner_email, verified_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS interview_sessions_owner_idx ON interview_sessions(owner_email, updated_at)"),
    ]).then(() => undefined).catch((error: unknown) => { schemaReady = null; throw error; });
  }
  await schemaReady;
}

export async function getProfile(email: string): Promise<CandidateProfile | null> {
  await ensureSchema();
  const db = await database();
  const row = await db.prepare(`SELECT email, full_name AS fullName, phone, location, university,
    program, degree, graduation_year AS graduationYear, work_authorization AS workAuthorization,
    target_titles AS targetTitles, preferred_locations AS preferredLocations, languages,
    linkedin_url AS linkedinUrl, portfolio_url AS portfolioUrl, resume_file_name AS resumeFileName,
    resume_content_type AS resumeContentType, resume_text AS resumeText,
    onboarding_completed AS onboardingCompleted, updated_at AS updatedAt
    FROM candidate_profiles WHERE email = ?`).bind(email).first<Record<string, unknown>>();
  if (!row) return null;
  return { ...row, onboardingCompleted: Boolean(row.onboardingCompleted) } as CandidateProfile;
}

export function safePublicProfile(profile: CandidateProfile | null) {
  if (!profile) return null;
  const publicProfile = { ...profile } as Partial<CandidateProfile>;
  delete publicProfile.resumeText;
  return { ...publicProfile, hasResume: Boolean(profile.resumeText), resumeCharacters: profile.resumeText.length };
}

export async function upsertOpportunity(email: string, job: {
  id: string; company: string; title: string; location: string; url: string; score: number;
  source: string; description?: string;
}, status = "Shortlisted") {
  await ensureSchema();
  const now = Date.now();
  const db = await database();
  await db.prepare(`INSERT INTO career_opportunities
    (id, owner_email, company, title, location, url, score, status, source, description, checked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, owner_email) DO UPDATE SET score=excluded.score, status=excluded.status,
      source=excluded.source, description=excluded.description, checked_at=excluded.checked_at, updated_at=excluded.updated_at`)
    .bind(job.id, email, job.company, job.title, job.location, job.url, job.score, status,
      job.source, job.description ?? "", now, now, now).run();
}

export async function saveVerifiedSearchLeads(email: string, jobs: Array<{
  id: string; company: string; title: string; url: string; source: string;
}>) {
  await ensureSchema();
  if (!jobs.length) return;
  const db = await database();
  const now = Date.now();
  const statements = jobs.slice(0, 60).map((job) => db.prepare(`INSERT INTO verified_leads
    (id, owner_email, opportunity_id, name, role, company, public_url, source, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET public_url=excluded.public_url, source=excluded.source,
      verified_at=excluded.verified_at`).bind(`lead-${job.id}`, email, job.id, `${job.company} hiring channel`,
      `Official channel for ${job.title}`, job.company, job.url, job.source, now));
  await db.batch(statements);
}

export const PIPELINE_STATUSES = ["Shortlisted", "CV ready", "Lead ready", "Applied", "Interview", "Offer", "Rejected", "Archived"] as const;

export async function updateOpportunityStatus(email: string, id: string, status: string) {
  if (!PIPELINE_STATUSES.includes(status as typeof PIPELINE_STATUSES[number])) throw new Error("Invalid pipeline status.");
  await ensureSchema();
  const db = await database();
  const result = await db.prepare(`UPDATE career_opportunities SET status = ?, updated_at = ? WHERE id = ? AND owner_email = ?`)
    .bind(status, Date.now(), id, email).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function deleteOpportunity(email: string, id: string) {
  await ensureSchema();
  const db = await database();
  const result = await db.prepare(`DELETE FROM career_opportunities WHERE id = ? AND owner_email = ?`).bind(id, email).run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function workspaceData(email: string) {
  await ensureSchema();
  const db = await database();
  const [opportunities, artifacts, leads, interviews] = await Promise.all([
    db.prepare(`SELECT id, company, title, location, url, score, status, source,
      checked_at AS checkedAt, updated_at AS updatedAt FROM career_opportunities
      WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 100`).bind(email).all(),
    db.prepare(`SELECT a.id, a.opportunity_id AS opportunityId, a.kind, a.content, a.model,
      a.created_at AS createdAt, o.company, o.title FROM career_artifacts a
      LEFT JOIN career_opportunities o ON o.id = a.opportunity_id AND o.owner_email = a.owner_email
      WHERE a.owner_email = ? ORDER BY a.created_at DESC LIMIT 100`).bind(email).all(),
    db.prepare(`SELECT id, opportunity_id AS opportunityId, name, role, company,
      public_url AS publicUrl, source, verified_at AS verifiedAt FROM verified_leads
      WHERE owner_email = ? ORDER BY verified_at DESC LIMIT 100`).bind(email).all(),
    db.prepare(`SELECT id, company, title, job_url AS jobUrl, difficulty, status, score,
      turns_json AS turnsJson, started_at AS startedAt, updated_at AS updatedAt
      FROM interview_sessions WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 20`).bind(email).all(),
  ]);
  return { opportunities: opportunities.results, artifacts: artifacts.results, leads: leads.results, interviews: interviews.results };
}

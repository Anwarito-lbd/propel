import { authenticatedEmail, authenticatedName, unauthorized } from "../../../lib/auth";
import { database, ensureSchema, getProfile, safePublicProfile } from "../../../lib/data";
import { normalizeProfileUrl } from "../../../lib/profile-url";

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const profile = await getProfile(email);
  return Response.json({ profile: safePublicProfile(profile), identity: { email, name: authenticatedName(request) } });
}

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const body = await request.json() as Record<string, unknown>;
  const fields = {
    fullName: clean(body.fullName, 120) || authenticatedName(request), phone: clean(body.phone, 40), location: clean(body.location, 120),
    university: clean(body.university, 180), program: clean(body.program, 180), degree: clean(body.degree, 180),
    graduationYear: clean(body.graduationYear, 20), workAuthorization: clean(body.workAuthorization, 180),
    targetTitles: clean(body.targetTitles, 500), preferredLocations: clean(body.preferredLocations, 500),
    languages: clean(body.languages, 300), linkedinUrl: clean(body.linkedinUrl, 500), portfolioUrl: clean(body.portfolioUrl, 500),
  };
  const linkedinUrl = normalizeProfileUrl(fields.linkedinUrl);
  const portfolioUrl = normalizeProfileUrl(fields.portfolioUrl);
  if (linkedinUrl === null || portfolioUrl === null) {
    return Response.json({ error: "Profile links must be valid HTTPS URLs." }, { status: 400 });
  }
  fields.linkedinUrl = linkedinUrl;
  fields.portfolioUrl = portfolioUrl;
  await ensureSchema();
  const db = await database();
  const existing = await getProfile(email);
  const completed = Boolean(body.onboardingCompleted) && Boolean(existing?.resumeText);
  if (body.onboardingCompleted && !existing?.resumeText) {
    return Response.json({ error: "Upload a readable resume before finishing onboarding." }, { status: 409 });
  }
  const now = Date.now();
  await db.prepare(`INSERT INTO candidate_profiles
    (email, full_name, phone, location, university, program, degree, graduation_year, work_authorization,
      target_titles, preferred_locations, languages, linkedin_url, portfolio_url, created_at, updated_at, onboarding_completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, phone=excluded.phone, location=excluded.location,
      university=excluded.university, program=excluded.program, degree=excluded.degree,
      graduation_year=excluded.graduation_year, work_authorization=excluded.work_authorization,
      target_titles=excluded.target_titles, preferred_locations=excluded.preferred_locations,
      languages=excluded.languages, linkedin_url=excluded.linkedin_url, portfolio_url=excluded.portfolio_url,
      onboarding_completed=excluded.onboarding_completed, updated_at=excluded.updated_at`)
    .bind(email, fields.fullName, fields.phone, fields.location, fields.university, fields.program, fields.degree,
      fields.graduationYear, fields.workAuthorization, fields.targetTitles, fields.preferredLocations, fields.languages,
      fields.linkedinUrl, fields.portfolioUrl, now, now, completed ? 1 : 0).run();
  return Response.json({ ok: true, profile: safePublicProfile(await getProfile(email)) });
}

import { authenticatedEmail, authenticatedName, unauthorized } from "../../../lib/auth";
import { database, ensureSchema } from "../../../lib/data";
import { extractResume, inferProfileFromResume, type ResumeProfileSuggestions } from "../../../lib/gemini";

const MAX_BYTES = 8 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "resume";
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const form = await request.formData();
  const file = form.get("resume");
  if (!(file instanceof File)) return Response.json({ error: "Choose a resume file." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return Response.json({ error: "The resume must be between 1 byte and 8 MB." }, { status: 400 });
  const allowed = file.type === "application/pdf" || /^text\/(plain|markdown)$/i.test(file.type) || /\.(pdf|txt|md)$/i.test(file.name);
  if (!allowed) return Response.json({ error: "Upload a PDF, TXT, or Markdown resume." }, { status: 415 });
  const bytes = await file.arrayBuffer();
  let extracted;
  try { extracted = await extractResume({ bytes, type: file.type, name: file.name }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Resume extraction failed." }, { status: 502 }); }
  let suggestions: ResumeProfileSuggestions | null = null;
  try { suggestions = await inferProfileFromResume(extracted.text); } catch { suggestions = null; }
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET) return Response.json({ error: "Resume storage is unavailable." }, { status: 503 });
  const objectKey = `resumes/${await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)).then((hash) => Array.from(new Uint8Array(hash)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join(""))}/${Date.now()}-${safeName(file.name)}`;
  await env.BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { owner: email, originalName: file.name },
  });
  await ensureSchema();
  const db = await database();
  const now = Date.now();
  const identityName = authenticatedName(request);
  const suggestedName = identityName !== "Candidate" ? identityName : suggestions?.fullName || identityName;
  await db.prepare(`INSERT INTO candidate_profiles
    (email, full_name, phone, location, university, program, degree, graduation_year, work_authorization,
      target_titles, preferred_locations, languages, linkedin_url, portfolio_url,
      resume_object_key, resume_file_name, resume_content_type, resume_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET resume_object_key=excluded.resume_object_key,
      resume_file_name=excluded.resume_file_name, resume_content_type=excluded.resume_content_type,
      resume_text=excluded.resume_text,
      full_name=CASE WHEN candidate_profiles.full_name='' THEN excluded.full_name ELSE candidate_profiles.full_name END,
      phone=CASE WHEN candidate_profiles.phone='' THEN excluded.phone ELSE candidate_profiles.phone END,
      location=CASE WHEN candidate_profiles.location='' OR candidate_profiles.location='Canada' THEN excluded.location ELSE candidate_profiles.location END,
      university=CASE WHEN candidate_profiles.university='' THEN excluded.university ELSE candidate_profiles.university END,
      program=CASE WHEN candidate_profiles.program='' THEN excluded.program ELSE candidate_profiles.program END,
      degree=CASE WHEN candidate_profiles.degree='' THEN excluded.degree ELSE candidate_profiles.degree END,
      graduation_year=CASE WHEN candidate_profiles.graduation_year='' THEN excluded.graduation_year ELSE candidate_profiles.graduation_year END,
      target_titles=CASE WHEN candidate_profiles.target_titles='' THEN excluded.target_titles ELSE candidate_profiles.target_titles END,
      preferred_locations=CASE WHEN candidate_profiles.preferred_locations='' THEN excluded.preferred_locations ELSE candidate_profiles.preferred_locations END,
      languages=CASE WHEN candidate_profiles.languages='' THEN excluded.languages ELSE candidate_profiles.languages END,
      linkedin_url=CASE WHEN candidate_profiles.linkedin_url='' THEN excluded.linkedin_url ELSE candidate_profiles.linkedin_url END,
      portfolio_url=CASE WHEN candidate_profiles.portfolio_url='' THEN excluded.portfolio_url ELSE candidate_profiles.portfolio_url END,
      onboarding_completed=0, updated_at=excluded.updated_at`)
    .bind(email, suggestedName, suggestions?.phone || "", suggestions?.location || "", suggestions?.university || "",
      suggestions?.program || "", suggestions?.degree || "", suggestions?.graduationYear || "", "",
      suggestions?.targetTitles || "", suggestions?.preferredLocations || "", suggestions?.languages || "",
      suggestions?.linkedinUrl || "", suggestions?.portfolioUrl || "", objectKey, file.name,
      file.type || "application/octet-stream", extracted.text, now, now).run();
  return Response.json({ ok: true, fileName: file.name, characters: extracted.text.length, extractionModel: extracted.model, suggestions });
}

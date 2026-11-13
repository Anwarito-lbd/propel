import { authenticatedEmail, unauthorized } from "../../../../lib/auth";
import { getProfile, saveVerifiedSearchLeads } from "../../../../lib/data";
import { searchLiveJobs } from "../../../../lib/careerops-live";

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const profile = await getProfile(email);
  if (!profile?.resumeText) {
    return Response.json({ error: "Upload your resume before searching so matches can be scored honestly." }, { status: 428 });
  }
  const params = new URL(request.url).searchParams;
  const title = params.get("title")?.trim().slice(0, 160) || profile.targetTitles.split(",")[0]?.trim();
  if (!title || title.length < 2) return Response.json({ error: "Enter a job title." }, { status: 400 });
  const maxAgeDays = Math.max(0, Math.min(365, Number(params.get("maxAgeDays")) || 0));
  const duration = params.get("duration")?.trim().slice(0, 40) || "any";
  const studentOnly = params.get("studentOnly") === "true";
  const result = await searchLiveJobs(title, profile.resumeText, { maxAgeDays: maxAgeDays || undefined, duration, studentOnly });
  await saveVerifiedSearchLeads(email, result.jobs);
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}

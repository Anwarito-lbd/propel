import { authenticatedEmail, unauthorized } from "../../../../lib/auth";
import { database, ensureSchema, getProfile, upsertOpportunity } from "../../../../lib/data";
import { generateWithGemini, parseModelJson, safeOutreachFallback } from "../../../../lib/gemini";
import { stableId } from "../../../../lib/careerops";
import { discoverPublicLead, fetchPublicJobDescription } from "../../../../lib/leads";
import { allowedPublicHttpsUrl } from "../../../../lib/public-url";

type JobPayload = {
  id: string; company: string; title: string; location: string; description: string; url: string;
  source: string; sourceUrl?: string; score: number; tags?: string[]; evidence?: string[]; gaps?: string[];
};

function validJob(job: Partial<JobPayload>): job is JobPayload {
  if (!job.id || !job.company || !job.title || !job.url || !job.source) return false;
  return Boolean(allowedPublicHttpsUrl(job.url));
}

function rejectInventedNumbers(generated: string, source: string) {
  const numbers = generated.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
  const unsupported = numbers.filter((number) => !source.includes(number));
  if (unsupported.length) throw new Error(`Fact gate rejected unsupported numbers: ${[...new Set(unsupported)].slice(0, 5).join(", ")}`);
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const body = await request.json() as { kind?: "cv" | "cover_letter" | "message"; job?: Partial<JobPayload> };
  if (!body.kind || !["cv", "cover_letter", "message"].includes(body.kind) || !body.job || !validJob(body.job)) {
    return Response.json({ error: "A verified live job and artifact type are required." }, { status: 400 });
  }
  const profile = await getProfile(email);
  if (!profile?.resumeText) return Response.json({ error: "Upload your resume first." }, { status: 428 });
  const job = body.job;
  const verifiedDescription = await fetchPublicJobDescription(job.url, job.description);
  const shared = `CANDIDATE SOURCE OF TRUTH:\n${profile.resumeText}\n\nCANDIDATE PROFILE:\nName: ${profile.fullName}\nLocation: ${profile.location}\nUniversity: ${profile.university}\nProgram: ${profile.program}\nWork authorization: ${profile.workAuthorization}\nLanguages: ${profile.languages}\n\nVERIFIED LIVE JOB:\nCompany: ${job.company}\nTitle: ${job.title}\nLocation: ${job.location}\nDescription: ${verifiedDescription}\nApplication URL: ${job.url}\nPublic source: ${job.source}`;
  const verifiedLead = body.kind === "message" ? await discoverPublicLead(job.url, job.company, job.source) : null;
  const instruction = body.kind === "cv"
    ? `You are following the fact-safe CV mode from Career-Ops. Tailor the resume for the verified job. Reorder and carefully rephrase only facts already present in the candidate source. Do not invent skills, roles, metrics, dates, employers, education, or claims. Produce a polished ATS-friendly single-column Markdown resume that preserves the source resume's professional hierarchy. Use exactly one # heading for the candidate name, place the supported contact details on the next line separated by |, use ## section headings, ### organization/project headings with location or date after | when supported, italic lines for degree/role/date details, and concise - bullets. Explicitly preserve contact and education facts. Return JSON with keys content (Markdown string), gaps (array of important job requirements unsupported by the resume), and evidence (array of strongest supported matches).`
    : body.kind === "cover_letter"
    ? `Write a concise, professional cover letter for the verified role. Use only facts from the candidate source, never invent experience, skills, metrics, dates, names, or claims. Connect two or three supported experiences to the role and keep it under 350 words. Do not use placeholders. Return JSON with keys content (Markdown string), gaps (unsupported important requirements), and evidence (facts used).`
    : `You are following the Career-Ops contact mode. The verified public lead is "${verifiedLead?.name}" (${verifiedLead?.role}) at ${verifiedLead?.publicUrl}. Do not invent a person's name, title, email, or profile. Draft one specific message of at most 300 characters addressed to "${verifiedLead?.name}". Use only candidate facts supported by the source. Ask one useful question, avoid generic flattery, never claim an application was sent, and never promise an outcome. Return JSON with keys content, recipient, and publicUrl.`;
  try {
    let generated: { text: string; model: string };
    let parsed: Record<string, unknown>;
    try {
      generated = await generateWithGemini([{ text: `${instruction}\n\n${shared}` }], {
        json: true,
        maxTokens: body.kind === "cv" ? 8192 : body.kind === "message" ? 2048 : 1024,
      });
      parsed = parseModelJson(generated.text);
    } catch (generationError) {
      if (body.kind !== "message") throw generationError;
      generated = { text: "", model: "verified-lead-template" };
      parsed = {
        content: safeOutreachFallback(job.title, job.company),
        recipient: verifiedLead?.name ?? `${job.company} recruiting team`,
        publicUrl: verifiedLead?.publicUrl ?? job.url,
      };
    }
    const content = String(parsed.content ?? "").trim();
    if (!content) throw new Error("Gemini returned no usable draft.");
    if (body.kind === "message" && [...content].length > 300) throw new Error("Gemini exceeded the 300-character outreach limit.");
    rejectInventedNumbers(content, `${profile.resumeText}\n${verifiedDescription}`);
    const status = body.kind === "message" ? "Lead ready" : "CV ready";
    await upsertOpportunity(email, job, status);
    await ensureSchema();
    const db = await database();
    const now = Date.now();
    const artifactId = stableId(email, job.id, body.kind, String(now));
    await db.prepare(`INSERT INTO career_artifacts (id, owner_email, opportunity_id, kind, content, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(artifactId, email, job.id, body.kind, content, generated.model, now).run();
    if (body.kind === "message") {
      const leadId = stableId(email, job.id, verifiedLead?.name ?? "official-application-channel");
      await db.prepare(`INSERT INTO verified_leads (id, owner_email, opportunity_id, name, role, company, public_url, source, verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET public_url=excluded.public_url,
        source=excluded.source, verified_at=excluded.verified_at`).bind(leadId, email, job.id, verifiedLead?.name ?? `${job.company} recruiting team`,
          verifiedLead?.role ?? "Official application channel", job.company, verifiedLead?.publicUrl ?? job.url, verifiedLead?.source ?? job.source, now).run();
    }
    return Response.json({ content, artifactId, model: generated.model, gaps: parsed.gaps ?? job.gaps ?? [], evidence: parsed.evidence ?? job.evidence ?? [],
      lead: body.kind === "message" ? verifiedLead : null,
      approvalRequired: true, factGatePassed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 502 });
  }
}

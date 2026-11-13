import { authenticatedEmail, unauthorized } from "../../../lib/auth";
import { deleteOpportunity, updateOpportunityStatus, upsertOpportunity, workspaceData } from "../../../lib/data";
import { allowedPublicHttpsUrl } from "../../../lib/public-url";

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  return Response.json(await workspaceData(email), { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const body = await request.json() as { job?: Record<string, unknown> };
  const job = body.job;
  if (!job || !job.id || !job.company || !job.title || !job.url || !job.source) return Response.json({ error: "A verified job is required." }, { status: 400 });
  try {
    const url = allowedPublicHttpsUrl(String(job.url));
    if (!url) throw new Error("Only public secure job URLs are accepted.");
    await upsertOpportunity(email, {
      id: String(job.id), company: String(job.company), title: String(job.title), location: String(job.location ?? "Canada"),
      url: url.href, score: Math.max(0, Math.min(100, Number(job.score) || 0)), source: String(job.source), description: String(job.description ?? ""),
    });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save job." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const body = await request.json() as { id?: string; status?: string };
  if (!body.id || !body.status) return Response.json({ error: "Job and status are required." }, { status: 400 });
  try {
    const updated = await updateOpportunityStatus(email, body.id, body.status);
    return updated ? Response.json({ ok: true }) : Response.json({ error: "Opportunity not found." }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update pipeline." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Opportunity id is required." }, { status: 400 });
  return (await deleteOpportunity(email, id)) ? Response.json({ ok: true }) : Response.json({ error: "Opportunity not found." }, { status: 404 });
}

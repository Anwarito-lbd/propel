import { authenticatedEmail, unauthorized } from "../../../../lib/auth";
import { database, ensureSchema } from "../../../../lib/data";
import { createDocx, createPdf } from "../../../../lib/documents";

export { createPdf, createDocx };

type ArtifactRow = { content: string; company: string | null; title: string | null; kind: string };

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "propel-document";
}

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const params = new URL(request.url).searchParams;
  const id = params.get("id")?.trim();
  const format = params.get("format");
  if (!id || !["pdf", "docx"].includes(format ?? "")) {
    return Response.json({ error: "Artifact id and PDF or DOCX format are required." }, { status: 400 });
  }
  await ensureSchema();
  const db = await database();
  const row = await db.prepare(`SELECT a.content, a.kind, o.company, o.title FROM career_artifacts a
    LEFT JOIN career_opportunities o ON o.id = a.opportunity_id AND o.owner_email = a.owner_email
    WHERE a.id = ? AND a.owner_email = ?`).bind(id, email).first<ArtifactRow>();
  if (!row) return Response.json({ error: "Document not found." }, { status: 404 });
  const base = safeName(`${row.company ?? "propel"}-${row.title ?? row.kind}-cv`);
  if (format === "pdf") {
    const bytes = await createPdf(row.content);
    return new Response(bytes as BodyInit, {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"`, "cache-control": "private, no-store" },
    });
  }
  const blob = await createDocx(row.content);
  return new Response(blob, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${base}.docx"`,
      "cache-control": "private, no-store",
    },
  });
}

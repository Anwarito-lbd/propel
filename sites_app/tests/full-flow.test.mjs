import assert from "node:assert/strict";
import test from "node:test";
import { Packer, Document, Paragraph } from "docx";
import { PDFDocument } from "pdf-lib";
import { createDocx, createPdf } from "../lib/documents.ts";
import { durationMatches, titleMatches } from "../lib/job-filters.mjs";
import { normalizeProfileUrl } from "../lib/profile-url.ts";
import { allowedPublicHttpsUrl } from "../lib/public-url.ts";
import { safeOutreachFallback } from "../lib/gemini.ts";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("flow-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const auth = { "oai-authenticated-user-email": "candidate@example.com", accept: "application/json" };

function statement(sql) {
  return {
    sql,
    bind() { return this; },
    async run() { return { success: true, meta: { changes: 1 } }; },
    async all() { return { success: true, results: [] }; },
    async first() {
      if (sql.includes("FROM career_artifacts")) return { content: "# Candidate\n\n## Education\n- University", company: "Verified Co", title: "Developer", kind: "cv" };
      return null;
    },
  };
}

const env = {
  DB: { prepare: statement, async batch(items) { return Promise.all(items.map((item) => item.run())); } },
  BUCKET: { async get() { return null; }, async put() {} },
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("private API rejects anonymous access", async () => {
  const response = await worker.fetch(new Request("https://propel.example/api/workspace"), env, ctx);
  assert.equal(response.status, 401);
});

test("profile links automatically receive a secure scheme", async () => {
  assert.equal(normalizeProfileUrl("linkedin.com/in/anwarissaoui"), "https://linkedin.com/in/anwarissaoui");
  assert.equal(normalizeProfileUrl("http://example.com"), "https://example.com/");
  assert.equal(normalizeProfileUrl("mailto:person@example.com"), null);
});

test("SSRF guard rejects non-HTTPS, localhost, and private IP URLs", () => {
  assert.equal(allowedPublicHttpsUrl("http://example.com/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://localhost/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://127.0.0.1/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://service.internal/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://user:pass@example.com/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://example.com:8443/job"), null);
  assert.equal(allowedPublicHttpsUrl("https://boards.greenhouse.io/faire/jobs/123")?.hostname, "boards.greenhouse.io");
});

test("lead outreach has a safe response when AI JSON is incomplete", () => {
  const message = safeOutreachFallback("Software Developer", "Verified Company");
  assert.match(message, /Software Developer/);
  assert.match(message, /Verified Company/);
  assert.ok([...message].length <= 300);
});

test("capability status reports the complete production workflow", async () => {
  const response = await worker.fetch(new Request("http://localhost/api/system/status", { headers: auth }), env, ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.demoData, false);
  assert.equal(body.editablePipeline, true);
  assert.equal(body.handsFreeInterview, true);
  assert.deepEqual(body.documentExports, ["pdf", "docx"]);
  assert.equal(body.publicLeadVerification, true);
});

test("invalid pipeline transitions are rejected", async () => {
  const response = await worker.fetch(new Request("http://localhost/api/workspace", {
    method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ id: "job-1", status: "Auto-applied" }),
  }), env, ctx);
  assert.equal(response.status, 400);
});

test("API validation rejects insecure job URLs, invalid profile links, and bad export params", async () => {
  const badSave = await worker.fetch(new Request("http://localhost/api/workspace", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ job: { id: "j1", company: "Test", title: "Dev", url: "http://localhost/job", source: "Test" } }),
  }), env, ctx);
  assert.equal(badSave.status, 400);

  const badGenerate = await worker.fetch(new Request("http://localhost/api/careerops/generate", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ kind: "cv", job: { id: "j1", company: "Test", title: "Dev", url: "https://127.0.0.1/job", source: "Test", description: "x", location: "Ottawa", score: 80 } }),
  }), env, ctx);
  assert.equal(badGenerate.status, 400);

  const badProfile = await worker.fetch(new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Candidate", linkedinUrl: "mailto:bad@example.com" }),
  }), env, ctx);
  assert.equal(badProfile.status, 400);

  const badExport = await worker.fetch(new Request("http://localhost/api/documents/export?id=art-1&format=exe", { headers: auth }), env, ctx);
  assert.equal(badExport.status, 400);
});

test("student filters reject senior roles and accept explicit co-op roles", () => {
  assert.equal(titleMatches("Senior Software Engineer", "software engineer intern"), false);
  assert.equal(durationMatches({ title: "Senior Software Engineer", description: "Mentor interns" }, "internship"), false);
  assert.equal(durationMatches({ title: "Software Developer Co-op", type: "Student" }, "internship"), true);
  assert.equal(durationMatches({ title: "Software Engineer", description: "This team supports our internship program" }, "internship"), false);
});

test("document engines generate valid PDF and DOCX bytes and sanitize non-WinAnsi characters", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage(); const pdfBytes = await pdf.save();
  assert.equal(new TextDecoder().decode(pdfBytes.slice(0, 4)), "%PDF");

  const tailoredPdf = await createPdf("# Candidate Name\nOttawa, ON | candidate@example.com\n\n## Experience\n### Verified Co | 2025 – 2026\n*Software Developer Intern*\n- Built “fast” APIs ✓ → exported cleanly • bullet");
  assert.equal(new TextDecoder().decode(tailoredPdf.slice(0, 4)), "%PDF");

  const docx = new Document({ sections: [{ children: [new Paragraph("Verified resume")]}] });
  const docxBytes = await Packer.toBuffer(docx);
  assert.equal(new TextDecoder().decode(docxBytes.subarray(0, 2)), "PK");

  const tailoredDocx = await createDocx("# Candidate Name\n\n## Experience\n- Built APIs");
  const tailoredDocxBytes = new Uint8Array(await tailoredDocx.arrayBuffer());
  assert.equal(new TextDecoder().decode(tailoredDocxBytes.subarray(0, 2)), "PK");
});

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { authenticatedEmail, unauthorized } from "../../../../lib/auth";
import { database, ensureSchema } from "../../../../lib/data";

type ArtifactRow = { content: string; company: string | null; title: string | null; kind: string };

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "propel-document";
}

function plain(value: string) {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*|__|[*_`]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  const words = text.split(/\s+/).filter(Boolean); let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function createPdf(content: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const contact = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = [612, 792];
  const margin = 42; const bottom = 42; const usableWidth = pageSize[0] - margin * 2;
  let page: PDFPage = pdf.addPage(pageSize); let y = 748; let afterName = false;

  function addPage() { page = pdf.addPage(pageSize); y = 748; }
  function ensureSpace(height: number) { if (y - height < bottom) addPage(); }
  function drawWrapped(text: string, font: PDFFont, size: number, x: number, width: number, lineHeight: number, centered = false) {
    for (const line of wrap(text, font, size, width)) {
      ensureSpace(lineHeight);
      const lineWidth = font.widthOfTextAtSize(line, size);
      page.drawText(line, { x: centered ? margin + (usableWidth - lineWidth) / 2 : x, y, size, font, color: rgb(0.07, 0.07, 0.07) });
      y -= lineHeight;
    }
  }
  function drawPair(text: string, font: PDFFont, size: number, lineHeight: number) {
    const separator = text.lastIndexOf("|");
    if (separator < 0) { drawWrapped(text, font, size, margin + 10, usableWidth - 10, lineHeight); return; }
    const left = text.slice(0, separator).trim(); const right = text.slice(separator + 1).trim();
    const rightWidth = font.widthOfTextAtSize(right, size);
    const leftWidth = usableWidth - Math.min(rightWidth + 18, usableWidth * 0.42);
    const leftLines = wrap(left, font, size, leftWidth);
    ensureSpace(Math.max(lineHeight, leftLines.length * lineHeight));
    const firstY = y;
    for (const line of leftLines) { page.drawText(line, { x: margin + 10, y, size, font, color: rgb(0.07, 0.07, 0.07) }); y -= lineHeight; }
    page.drawText(right, { x: pageSize[0] - margin - rightWidth, y: firstY, size, font, color: rgb(0.07, 0.07, 0.07) });
  }

  for (const rawSource of content.replace(/\r/g, "").split("\n")) {
    const source = rawSource.trim();
    if (!source) { y -= 3.5; continue; }
    const h1 = source.match(/^#\s+(.+)$/); const h2 = source.match(/^##\s+(.+)$/); const h3 = source.match(/^###\s+(.+)$/);
    const bullet = source.match(/^[-*]\s+(.+)$/); const italicLine = source.match(/^\*([^*].*)\*$/);
    if (h1) {
      const text = plain(h1[1]); ensureSpace(36); const size = 24;
      const width = bold.widthOfTextAtSize(text, size);
      page.drawText(text, { x: Math.max(margin, (pageSize[0] - width) / 2), y, size, font: bold, color: rgb(0.04, 0.04, 0.04) });
      y -= 29; afterName = true; continue;
    }
    if (afterName) {
      drawWrapped(plain(source), contact, 8.7, margin, usableWidth, 11, true);
      y -= 7; afterName = false; continue;
    }
    if (h2) {
      ensureSpace(26); y -= 5; const text = plain(h2[1]).toUpperCase();
      page.drawText(text, { x: margin, y, size: 11.5, font: regular, color: rgb(0.05, 0.05, 0.05) });
      y -= 4; page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.7, color: rgb(0.1, 0.1, 0.1) });
      y -= 13; continue;
    }
    if (h3) { drawPair(plain(h3[1]), bold, 10.7, 12.5); y -= 1; continue; }
    if (italicLine) { drawPair(plain(italicLine[1]), italic, 9.6, 11.5); y -= 1; continue; }
    if (bullet) {
      const lines = wrap(plain(bullet[1]), regular, 9.5, usableWidth - 36);
      for (let index = 0; index < lines.length; index++) {
        ensureSpace(11.8);
        if (index === 0) page.drawText("-", { x: margin + 16, y, size: 9.5, font: regular, color: rgb(0.07, 0.07, 0.07) });
        page.drawText(lines[index], { x: margin + 30, y, size: 9.5, font: regular, color: rgb(0.07, 0.07, 0.07) }); y -= 11.8;
      }
      y -= 1; continue;
    }
    drawWrapped(plain(source), regular, 9.6, margin + 10, usableWidth - 10, 12);
    y -= 1;
  }
  pdf.setTitle("Propel Tailored CV"); pdf.setCreator("Propel"); pdf.setProducer("Propel professional document export");
  return pdf.save();
}

async function createDocx(content: string) {
  const children = content.split(/\n/).map((source) => {
    const heading = source.match(/^(#{1,3})\s+(.*)$/);
    if (heading) return new Paragraph({ text: plain(heading[2]), heading: heading[1].length === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: 120, after: 60 } });
    const bullet = source.match(/^[-*]\s+(.*)$/);
    if (bullet) return new Paragraph({ children: [new TextRun(plain(bullet[1]))], bullet: { level: 0 }, spacing: { after: 30 } });
    return new Paragraph({ children: [new TextRun(plain(source))], spacing: { after: source.trim() ? 50 : 20 } });
  });
  const doc = new Document({ styles: { default: { document: { run: { font: "Arial", size: 20 } } } }, sections: [{ properties: { page: { margin: { top: 576, right: 576, bottom: 576, left: 576 } } }, children }] });
  return Packer.toBlob(doc);
}

export async function GET(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  const params = new URL(request.url).searchParams; const id = params.get("id")?.trim(); const format = params.get("format");
  if (!id || !["pdf", "docx"].includes(format ?? "")) return Response.json({ error: "Artifact id and PDF or DOCX format are required." }, { status: 400 });
  await ensureSchema(); const db = await database();
  const row = await db.prepare(`SELECT a.content, a.kind, o.company, o.title FROM career_artifacts a
    LEFT JOIN career_opportunities o ON o.id = a.opportunity_id AND o.owner_email = a.owner_email
    WHERE a.id = ? AND a.owner_email = ?`).bind(id, email).first<ArtifactRow>();
  if (!row) return Response.json({ error: "Document not found." }, { status: 404 });
  const base = safeName(`${row.company ?? "propel"}-${row.title ?? row.kind}-cv`);
  if (format === "pdf") {
    const bytes = await createPdf(row.content);
    return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"`, "cache-control": "private, no-store" } });
  }
  const blob = await createDocx(row.content);
  return new Response(blob, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${base}.docx"`, "cache-control": "private, no-store" } });
}

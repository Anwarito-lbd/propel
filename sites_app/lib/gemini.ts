type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

const MODEL_CANDIDATES = ["gemini-3-flash-preview", "gemini-2.5-flash"];

export function parseModelJson(text: string): Record<string, unknown> {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const start = clean.indexOf("{");
    if (start < 0) throw new Error("The AI response did not contain a JSON object.");
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < clean.length; index++) {
      const character = clean[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        return JSON.parse(clean.slice(start, index + 1)) as Record<string, unknown>;
      }
    }
    throw new Error("The AI response ended before its JSON object was complete.");
  }
}

export function safeOutreachFallback(jobTitle: string, company: string): string {
  const title = jobTitle.replace(/\s+/g, " ").trim().slice(0, 120) || "open role";
  const employer = company.replace(/\s+/g, " ").trim().slice(0, 100) || "your organization";
  const message = `Hello, I'm interested in the ${title} opportunity at ${employer}. Could you share whether applications are still open and the best public channel for questions? Thank you.`;
  if ([...message].length <= 300) return message;
  return [...`Hello, I'm interested in the ${title.slice(0, 80)} role at ${employer.slice(0, 60)}. Are applications still open? Thank you.`]
    .slice(0, 300).join("");
}

function getKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Gemini is not configured on the server.");
  return key;
}

function responseText(payload: Record<string, unknown>): string {
  const candidates = payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export async function generateWithGemini(parts: GeminiPart[], options?: { json?: boolean; maxTokens?: number }) {
  const key = getKey();
  const requested = process.env.GEMINI_MODEL?.trim();
  const models = [...new Set([requested, ...MODEL_CANDIDATES].filter(Boolean) as string[])];
  let lastError = "Gemini request failed.";
  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: options?.maxTokens ?? 4096,
          ...(options?.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok) {
      const text = responseText(payload);
      if (!text) throw new Error("Gemini returned an empty response.");
      return { text, model };
    }
    const error = payload.error as { message?: string } | undefined;
    lastError = error?.message || `Gemini returned HTTP ${response.status}.`;
    if (response.status !== 404) break;
  }
  throw new Error(lastError);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function extractResume(file: { bytes: ArrayBuffer; type: string; name: string }) {
  if (/^(text\/plain|text\/markdown)$/i.test(file.type) || /\.(txt|md)$/i.test(file.name)) {
    const text = new TextDecoder().decode(file.bytes).trim();
    if (text.length < 80) throw new Error("The uploaded resume does not contain enough readable text.");
    return { text, model: "direct-text-extraction" };
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    throw new Error("Upload a PDF, TXT, or Markdown resume.");
  }
  const prompt = `Extract the candidate resume into clean Markdown. Preserve every factual detail, spelling, date, metric, link, role, project, skill and education item exactly as supported by the document. Do not infer, improve, add, or invent anything. Omit decorative layout and return only the resume text.`;
  const result = await generateWithGemini([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: arrayBufferToBase64(file.bytes) } },
  ], { maxTokens: 8192 });
  if (result.text.length < 80) throw new Error("The PDF could not be read as a resume.");
  return result;
}

export type ResumeProfileSuggestions = {
  fullName: string; phone: string; location: string; university: string; program: string;
  degree: string; graduationYear: string; workAuthorization: string; targetTitles: string;
  preferredLocations: string; languages: string; linkedinUrl: string; portfolioUrl: string;
};

export async function inferProfileFromResume(resumeText: string): Promise<ResumeProfileSuggestions> {
  const prompt = `Extract a candidate profile from the resume below. Return JSON only with these string keys:
fullName, phone, location, university, program, degree, graduationYear, workAuthorization, targetTitles, preferredLocations, languages, linkedinUrl, portfolioUrl.
Use only explicit resume facts. Use an empty string when unknown. targetTitles may contain up to three reasonable job-title suggestions directly supported by the resume, comma-separated. Do not infer citizenship, immigration status, work authorization, age, or protected traits.

RESUME:\n${resumeText.slice(0, 45_000)}`;
  const generated = await generateWithGemini([{ text: prompt }], { json: true, maxTokens: 1400 });
  const parsed = parseModelJson(generated.text);
  const value = (key: string, limit = 500) => typeof parsed[key] === "string" ? parsed[key].trim().slice(0, limit) : "";
  return {
    fullName: value("fullName", 120), phone: value("phone", 40), location: value("location", 120),
    university: value("university", 180), program: value("program", 180), degree: value("degree", 180),
    graduationYear: value("graduationYear", 20), workAuthorization: "", targetTitles: value("targetTitles"),
    preferredLocations: value("preferredLocations"), languages: value("languages", 300),
    linkedinUrl: value("linkedinUrl"), portfolioUrl: value("portfolioUrl"),
  };
}

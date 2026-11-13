import { allowedPublicHttpsUrl } from "./public-url";

const GENERIC_EMAIL = /^(?:noreply|no-reply|privacy|legal|security|support|hello|info)@/i;
const RECRUITING_CONTEXT = /recruit|talent|hiring|human resources|people team|careers?|job contact|staffing/i;

export type PublicLead = { name: string; role: string; publicUrl: string; source: string; evidence: string };

export async function discoverPublicLead(jobUrl: string, company: string, fallbackSource: string): Promise<PublicLead> {
  const url = allowedPublicHttpsUrl(jobUrl);
  if (!url) throw new Error("The job URL is not an allowed public HTTPS page.");
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Propel/1.1 public-contact-verification" } });
    if (response.ok) {
      const html = (await response.text()).slice(0, 1_500_000);
      const decoded = html.replace(/&#64;|\[at\]/gi, "@").replace(/&#46;|\[dot\]/gi, ".");
      const emails = [...new Set(decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])]
        .filter((email) => !GENERIC_EMAIL.test(email) && !/example\.|sentry\.|cloudflare\./i.test(email));
      const recruiting = emails.find((email) => {
        if (RECRUITING_CONTEXT.test(email)) return true;
        const index = decoded.toLowerCase().indexOf(email.toLowerCase());
        return index >= 0 && RECRUITING_CONTEXT.test(readableText(decoded.slice(Math.max(0, index - 350), index + 500)));
      });
      if (recruiting) return {
        name: recruiting, role: "Public recruiting email listed on the job page", publicUrl: `mailto:${recruiting}`,
        source: `${fallbackSource} · page verified`, evidence: "Exact address found on the public posting; it was not guessed.",
      };
      for (const match of decoded.matchAll(/href=["']([^"']*linkedin\.com\/in\/[^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const index = match.index ?? 0;
        const context = readableText(decoded.slice(Math.max(0, index - 450), index + 700));
        if (!RECRUITING_CONTEXT.test(context)) continue;
        const linkedin = allowedPublicHttpsUrl(match[1].replace(/&amp;/gi, "&").replace(/^http:\/\//i, "https://"));
        if (!linkedin || !/(^|\.)linkedin\.com$/i.test(linkedin.hostname)) continue;
        const label = readableText(match[2]).slice(0, 100);
        return {
          name: label && !/^linkedin$/i.test(label) ? label : "Verified recruiting contact",
          role: "Public recruiting LinkedIn profile linked from the job page", publicUrl: linkedin.href,
          source: `${fallbackSource} · LinkedIn verified`, evidence: "Exact LinkedIn profile linked in recruiting context on the public posting.",
        };
      }
    }
  } catch { /* A public page can block server fetches; the official URL remains verified. */ }
  return {
    name: `${company} recruiting team`, role: "Official application channel", publicUrl: url.href,
    source: fallbackSource, evidence: "Verified application URL; no public recruiter identity was found.",
  };
}

function readableText(html: string) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return main
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPublicJobDescription(jobUrl: string, fallback: string) {
  const url = allowedPublicHttpsUrl(jobUrl);
  if (!url) throw new Error("The job URL is not an allowed public HTTPS page.");
  if (fallback.trim().length >= 500) return fallback.trim().slice(0, 16_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": "Propel/1.2 public-job-verification" },
    });
    if (!response.ok) return fallback;
    const text = readableText((await response.text()).slice(0, 1_500_000));
    return text.length >= 160 ? text.slice(0, 16_000) : fallback;
  } catch {
    return fallback;
  }
}

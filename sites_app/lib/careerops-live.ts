/**
 * Live job discovery adapted from the provider architecture in
 * santifer/career-ops v1.21.0 (commit e8ba1a42beec3a638f34a862d238f5e42174dcb1).
 * The original MIT license and provenance are recorded in vendor/career-ops.
 */
import { extractTags, stableId, stripHtml, words } from "./careerops";
import { durationMatches, titleMatches } from "./job-filters.mjs";

export type LiveJob = {
  id: string;
  company: string;
  monogram: string;
  title: string;
  location: string;
  mode: string;
  type: string;
  posted: string;
  postedAt: number | null;
  score: number;
  tags: string[];
  evidence: string[];
  gaps: string[];
  color: string;
  source: string;
  sourceUrl: string;
  description: string;
  url: string;
  verifiedAt: string;
};

export type JobSearchFilters = {
  maxAgeDays?: number;
  duration?: string;
  studentOnly?: boolean;
};

type RawJob = {
  title: string;
  company: string;
  location: string;
  description?: string;
  url: string;
  type?: string;
  postedAt?: number;
  source: string;
  sourceUrl: string;
};

type ProviderResult = { provider: string; sourceUrl: string; jobs: RawJob[]; error?: string };

const COMPANY_BOARDS = [
  { kind: "greenhouse", slug: "faire", company: "Faire" },
  { kind: "greenhouse", slug: "touchbistro", company: "TouchBistro" },
  { kind: "greenhouse", slug: "stackadapt", company: "StackAdapt" },
  { kind: "greenhouse", slug: "hootsuite", company: "Hootsuite" },
  { kind: "greenhouse", slug: "geotab", company: "Geotab" },
  { kind: "greenhouse", slug: "leagueinc", company: "League" },
  { kind: "greenhouse", slug: "ritual", company: "Ritual" },
  { kind: "ashby", slug: "cohere", company: "Cohere" },
  { kind: "ashby", slug: "wealthsimple", company: "Wealthsimple" },
  { kind: "ashby", slug: "1password", company: "1Password" },
  { kind: "ashby", slug: "koho", company: "KOHO" },
  { kind: "ashby", slug: "hiive", company: "Hiive" },
  { kind: "ashby", slug: "clearco", company: "Clearco" },
  { kind: "lever", slug: "pointclickcare", company: "PointClickCare" },
  { kind: "greenhouse", slug: "clio", company: "Clio" },
  { kind: "greenhouse", slug: "applyboard", company: "ApplyBoard" },
  { kind: "greenhouse", slug: "ecobee", company: "ecobee" },
  { kind: "greenhouse", slug: "benchsci", company: "BenchSci" },
  { kind: "ashby", slug: "waabi", company: "Waabi" },
] as const;

const CANADA = /canada|canadian|remote\s*[-–—,/ ]*ca\b|\bca\s+remote|north america|americas|worldwide|anywhere|global|ontario|qu[eé]bec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|northwest territories|nunavut|toronto|ottawa|montr[eé]al|vancouver|calgary|edmonton|waterloo|kitchener|halifax|winnipeg|victoria/i;
const STOP_SKILLS = new Set(["work", "team", "years", "role", "experience", "skills", "company", "remote", "canada"]);

function httpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
}

function epoch(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value !== "string" || !value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "user-agent": "Propel/1.0 (+private candidate search)", ...(init?.headers ?? {}) },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function text(url: string): Promise<string> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (![429, 502, 503, 504].includes(response.status)) break;
  }
  throw new Error(`HTTP ${lastStatus || "request failed"}`);
}

function decodeHtml(value: string) {
  return stripHtml(value)
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function articleField(article: string, className: string) {
  const match = article.match(new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

async function jobBank(query: string): Promise<ProviderResult> {
  const sourceUrl = `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${encodeURIComponent(query)}&locationstring=Canada&sort=M`;
  const html = await text(sourceUrl);
  const jobs: RawJob[] = [];
  for (const match of html.matchAll(/<article\s+id=["']article-(\d+)["'][\s\S]*?<\/article>/gi)) {
    const article = match[0];
    const href = article.match(/<a\s+href=["']([^"']+)["'][^>]*class=["'][^"']*resultJobItem/i)?.[1] ?? "";
    const title = articleField(article, "noctitle");
    const company = articleField(article, "business");
    const location = articleField(article, "location").replace(/^Location\s*/i, "");
    const postedAt = epoch(articleField(article, "date"));
    const salary = articleField(article, "salary");
    const workMode = articleField(article, "telework");
    if (!href || !title || !company) continue;
    const cleanPath = href.replace(/;jsessionid=[^?]+/i, "");
    const url = new URL(cleanPath, "https://www.jobbank.gc.ca").href;
    jobs.push({
      title, company, location: [location, workMode].filter(Boolean).join(" · "),
      description: salary ? `Compensation listed by Job Bank: ${salary}` : "",
      url, postedAt, source: "Government of Canada Job Bank", sourceUrl,
    });
  }
  return { provider: "Job Bank Canada · public search", sourceUrl, jobs };
}

async function fetchCompanyBoard(board: typeof COMPANY_BOARDS[number]): Promise<ProviderResult> {
  if (board.kind === "greenhouse") {
    const sourceUrl = `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`;
    const data = await json(sourceUrl) as { jobs?: Array<Record<string, unknown>> };
    return { provider: `Career-Ops · Greenhouse · ${board.company}`, sourceUrl, jobs: (data.jobs ?? []).map((job) => ({
      title: String(job.title ?? ""), company: board.company,
      location: String((job.location as { name?: string } | undefined)?.name ?? ""),
      description: stripHtml(String(job.content ?? "")), url: httpsUrl(job.absolute_url),
      postedAt: epoch(job.first_published ?? job.updated_at), source: "Greenhouse public ATS",
      sourceUrl,
    })).filter((job) => job.title && job.url) };
  }
  if (board.kind === "lever") {
    const sourceUrl = `https://api.lever.co/v0/postings/${board.slug}?mode=json`;
    const data = await json(sourceUrl) as Array<Record<string, unknown>>;
    return { provider: `Career-Ops · Lever · ${board.company}`, sourceUrl, jobs: (Array.isArray(data) ? data : []).map((job) => {
      const categories = job.categories as { location?: string; commitment?: string } | undefined;
      return { title: String(job.text ?? ""), company: board.company, location: String(categories?.location ?? ""),
        description: String(job.descriptionPlain ?? ""), url: httpsUrl(job.hostedUrl), type: categories?.commitment,
        postedAt: epoch(job.createdAt), source: "Lever public ATS", sourceUrl };
    }).filter((job) => job.title && job.url) };
  }
  const sourceUrl = `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`;
  const data = await json(sourceUrl) as { jobs?: Array<Record<string, unknown>> };
  return { provider: `Career-Ops · Ashby · ${board.company}`, sourceUrl, jobs: (data.jobs ?? []).map((job) => ({
    title: String(job.title ?? ""), company: board.company, location: String(job.location ?? job.workplaceType ?? ""),
    description: String(job.descriptionPlain ?? ""), url: httpsUrl(job.jobUrl), type: String(job.employmentType ?? ""),
    postedAt: epoch(job.publishedAt), source: "Ashby public ATS", sourceUrl,
  })).filter((job) => job.title && job.url) };
}

async function remotive(query: string): Promise<ProviderResult> {
  const sourceUrl = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=100`;
  const data = await json(sourceUrl) as { jobs?: Array<Record<string, unknown>> };
  return { provider: "Career-Ops · Remotive", sourceUrl, jobs: (data.jobs ?? []).map((job) => ({
    title: String(job.title ?? ""), company: String(job.company_name ?? ""),
    location: String(job.candidate_required_location ?? ""), description: stripHtml(String(job.description ?? "")),
    url: httpsUrl(job.url), type: String(job.job_type ?? ""), postedAt: epoch(job.publication_date),
    source: "Remotive public feed", sourceUrl,
  })).filter((job) => job.title && job.company && job.url) };
}

async function remoteOk(): Promise<ProviderResult> {
  const sourceUrl = "https://remoteok.com/api";
  const data = await json(sourceUrl) as Array<Record<string, unknown>>;
  return { provider: "Career-Ops · RemoteOK", sourceUrl, jobs: (Array.isArray(data) ? data : []).map((job) => ({
    title: String(job.position ?? ""), company: String(job.company ?? ""), location: String(job.location ?? ""),
    description: stripHtml(String(job.description ?? "")), url: httpsUrl(job.url),
    postedAt: epoch(job.epoch ?? job.date), source: "RemoteOK public feed", sourceUrl,
  })).filter((job) => job.title && job.company && job.url) };
}

async function jobicy(): Promise<ProviderResult> {
  const sourceUrl = "https://jobicy.com/api/v2/remote-jobs?count=50";
  const data = await json(sourceUrl) as { jobs?: Array<Record<string, unknown>> };
  return { provider: "Career-Ops · Jobicy", sourceUrl, jobs: (data.jobs ?? []).map((job) => ({
    title: String(job.jobTitle ?? ""), company: String(job.companyName ?? ""), location: String(job.jobGeo ?? ""),
    description: stripHtml(String(job.jobDescription ?? "")), url: httpsUrl(job.url), type: String(job.jobType ?? ""),
    postedAt: epoch(job.pubDate), source: "Jobicy public feed", sourceUrl,
  })).filter((job) => job.title && job.company && job.url) };
}

async function himalayas(): Promise<ProviderResult> {
  const sourceUrl = "https://himalayas.app/jobs/api?limit=50";
  const data = await json(sourceUrl) as { jobs?: Array<Record<string, unknown>> };
  return { provider: "Career-Ops · Himalayas", sourceUrl, jobs: (data.jobs ?? []).map((job) => ({
    title: String(job.title ?? ""), company: String(job.companyName ?? ""),
    location: Array.isArray(job.locationRestrictions) ? job.locationRestrictions.join(", ") : String(job.location ?? ""),
    description: stripHtml(String(job.description ?? "")), url: httpsUrl(job.applicationLink) || httpsUrl(job.guid),
    postedAt: epoch(job.pubDate), source: "Himalayas public feed", sourceUrl,
  })).filter((job) => job.title && job.company && job.url) };
}

function apifyDatePosted(maxAgeDays?: number) {
  if (!maxAgeDays) return "r2592000";
  if (maxAgeDays <= 1) return "r86400";
  if (maxAgeDays <= 7) return "r604800";
  if (maxAgeDays <= 30) return "r2592000";
  return "";
}

async function apifyLinkedIn(query: string, filters: JobSearchFilters): Promise<ProviderResult> {
  const token = process.env.APIFY_API_TOKEN;
  const sourceUrl = "https://apify.com/crawlerbros/linkedin-jobs-scraper";
  if (!token) return { provider: "Apify · LinkedIn public jobs", sourceUrl, jobs: [], error: "Not configured" };

  const endpoint = new URL("https://api.apify.com/v2/acts/crawlerbros~linkedin-jobs-scraper/run-sync-get-dataset-items");
  endpoint.searchParams.set("token", token);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Propel/1.0 (+private candidate search)" },
    body: JSON.stringify({
      keywords: query,
      location: "Canada",
      timePosted: apifyDatePosted(filters.maxAgeDays),
      scrapeJobDetails: true,
      maxItems: 10,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as Array<Record<string, unknown>>;
  const jobs = (Array.isArray(data) ? data : []).map((job): RawJob | null => {
    const title = String(job.title ?? "").trim();
    const company = String(job.companyName ?? job.company ?? "").trim();
    const url = httpsUrl(job.applyUrl) || httpsUrl(job.link) || httpsUrl(job.jobUrl);
    if (!title || !company || !url) return null;
    const workplace = String(job.workplaceType ?? "").trim();
    const location = [String(job.location ?? "").trim(), workplace].filter(Boolean).join(" · ");
    return {
      title,
      company,
      location: location || "Canada",
      description: stripHtml(String(job.descriptionText ?? job.descriptionHtml ?? "")),
      url,
      type: String(job.employmentType ?? ""),
      postedAt: epoch(job.postedDate ?? job.postedAt),
      source: "LinkedIn public jobs via Apify",
      sourceUrl,
    };
  }).filter((job): job is RawJob => Boolean(job));
  return { provider: "Apify · LinkedIn public jobs", sourceUrl, jobs };
}

function externalRawJob(value: Record<string, unknown>, fallbackSource: string, fallbackUrl: string): RawJob | null {
  const company = String(value.company ?? value.company_name ?? value.employer ?? "").trim();
  const title = String(value.title ?? value.job_title ?? value.position ?? "").trim();
  const url = httpsUrl(value.application_url) || httpsUrl(value.job_url) || httpsUrl(value.url);
  if (!company || !title || !url) return null;
  const locationValue = value.location;
  const location = typeof locationValue === "string" ? locationValue : [value.city, value.state, value.country].filter(Boolean).join(", ");
  return {
    company, title, url, location: location || "Location not supplied",
    description: stripHtml(String(value.description ?? value.job_description ?? "")),
    type: String(value.employment_type ?? value.job_type ?? value.type ?? ""),
    postedAt: epoch(value.date_posted ?? value.posted_at ?? value.date ?? value.created_at),
    source: String(value.source ?? fallbackSource), sourceUrl: fallbackUrl,
  };
}

async function externalProvider(kind: "crawl4ai" | "jobspy", query: string): Promise<ProviderResult> {
  const base = kind === "crawl4ai" ? process.env.CRAWL4AI_API_URL : process.env.JOBSPY_API_URL;
  const label = kind === "crawl4ai" ? "Crawl4AI public-page crawler" : "JobSpy service";
  if (!base) return { provider: label, sourceUrl: "", jobs: [], error: "Not configured" };
  const endpoint = new URL(kind === "crawl4ai" ? "/jobs/search" : "/search", base).href;
  const key = kind === "crawl4ai" ? process.env.CRAWL4AI_API_KEY : process.env.JOBSPY_API_KEY;
  const data = await json(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(kind === "crawl4ai"
      ? { title: query, country: "Canada", max_results: 80 }
      : { search_term: query, location: "Canada", country_indeed: "Canada", results_wanted: 100, site_name: ["indeed", "linkedin", "zip_recruiter", "google"] }),
  }) as Record<string, unknown> | Array<Record<string, unknown>>;
  const rows = Array.isArray(data) ? data : (data.jobs ?? data.results ?? []) as Array<Record<string, unknown>>;
  const jobs = Array.isArray(rows) ? rows.map((row) => externalRawJob(row, label, endpoint)).filter((job): job is RawJob => Boolean(job)) : [];
  return { provider: label, sourceUrl: endpoint, jobs };
}

function calculateFit(job: RawJob, query: string, resume: string) {
  const titleWords = words(job.title);
  const queryWords = words(query);
  const jobWords = words(`${job.title} ${job.description ?? ""}`);
  const resumeWords = words(resume);
  const titleHits = [...queryWords].filter((word) => titleWords.has(word));
  const evidence = [...jobWords].filter((word) => resumeWords.has(word) && !STOP_SKILLS.has(word)).slice(0, 8);
  const important = extractTags(`${job.title} ${job.description ?? ""}`).map((item) => item.toLowerCase());
  const gaps = important.filter((skill) => !resume.toLowerCase().includes(skill)).slice(0, 5);
  const titleScore = titleHits.length / Math.max(queryWords.size, 1);
  const evidenceScore = Math.min(evidence.length / 8, 1);
  return { score: Math.round((titleScore * 0.64 + evidenceScore * 0.36) * 100), evidence, gaps };
}

function postedLabel(value?: number) {
  if (!value) return "Date not supplied";
  const days = Math.max(0, Math.floor((Date.now() - value) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 60) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function normalize(job: RawJob, query: string, resume: string, verifiedAt: string): LiveJob {
  const fit = calculateFit(job, query, resume);
  const tags = extractTags(`${job.title} ${job.description ?? ""}`);
  return {
    id: stableId(job.company, job.title, job.url), company: job.company,
    monogram: job.company.slice(0, 1).toUpperCase(), title: job.title, location: job.location,
    mode: /remote|worldwide|anywhere|global/i.test(job.location) ? "Remote / location eligible" : "On-site / hybrid",
    type: job.type || (/intern/i.test(job.title) ? "Internship" : /co-?op/i.test(job.title) ? "Co-op" : "Not specified"),
    posted: postedLabel(job.postedAt), postedAt: job.postedAt ?? null, score: fit.score, tags,
    evidence: fit.evidence, gaps: fit.gaps, color: fit.score >= 80 ? "#ff6b57" : fit.score >= 60 ? "#2457e6" : "#171717",
    source: job.source, sourceUrl: job.sourceUrl, description: (job.description ?? "").slice(0, 360),
    url: job.url, verifiedAt,
  };
}

export async function searchLiveJobs(query: string, resume: string, filters: JobSearchFilters = {}) {
  const checkedAt = new Date().toISOString();
  const providers = [() => jobBank(query), ...COMPANY_BOARDS.map((board) => () => fetchCompanyBoard(board)), () => remotive(query), remoteOk, jobicy, himalayas,
    () => apifyLinkedIn(query, filters), () => externalProvider("crawl4ai", query), () => externalProvider("jobspy", query)];
  const settled = await Promise.allSettled(providers.map((provider) => provider()));
  const results: ProviderResult[] = settled.map((result, index) => result.status === "fulfilled" ? result.value : {
    provider: index === 0 ? "Job Bank Canada" : index <= COMPANY_BOARDS.length ? `${COMPANY_BOARDS[index - 1].company} ATS` : ["Remotive", "RemoteOK", "Jobicy", "Himalayas", "Apify · LinkedIn", "Crawl4AI", "JobSpy"][index - COMPANY_BOARDS.length - 1],
    sourceUrl: "", jobs: [], error: result.reason instanceof Error ? result.reason.message : "Provider failed",
  });
  const seen = new Set<string>();
  const jobs = results.flatMap((result) => result.jobs)
    .filter((job) => job.source === "Government of Canada Job Bank" || CANADA.test(job.location))
    .filter((job) => titleMatches(job.title, query))
    .filter((job) => !filters.studentOnly || durationMatches(job, "internship"))
    .filter((job) => !filters.maxAgeDays || Boolean(job.postedAt && Date.now() - job.postedAt <= filters.maxAgeDays * 86_400_000))
    .filter((job) => durationMatches(job, filters.duration))
    .filter((job) => { const key = `${job.url}|${job.company}|${job.title}`.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .map((job) => normalize(job, query, resume, checkedAt))
    .sort((a, b) => b.score - a.score || (b.postedAt ?? 0) - (a.postedAt ?? 0))
    .slice(0, 100);
  return {
    jobs,
    meta: {
      query, country: "Canada", checkedAt,
      filters,
      sources: results.map(({ provider, sourceUrl, jobs: providerJobs, error }) => ({ provider, sourceUrl, returned: providerJobs.length, ok: !error, error })),
      careerOps: { version: "1.21.0", commit: "e8ba1a42beec3a638f34a862d238f5e42174dcb1" },
      jobSpyReference: { repository: "speedyapply/JobSpy", configured: Boolean(process.env.JOBSPY_API_URL), used: results.some((result) => result.provider.includes("JobSpy") && !result.error) },
      crawl4ai: { configured: Boolean(process.env.CRAWL4AI_API_URL), used: results.some((result) => result.provider.includes("Crawl4AI") && !result.error) },
      apify: { configured: Boolean(process.env.APIFY_API_TOKEN), used: results.some((result) => result.provider.startsWith("Apify") && !result.error), perSearchLimit: 10 },
    },
  };
}

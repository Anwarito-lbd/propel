export type NormalizedJob = {
  id: string;
  company: string;
  monogram: string;
  title: string;
  location: string;
  mode: string;
  type: string;
  posted: string;
  score: number;
  tags: string[];
  color: string;
  source: string;
  description: string;
  url?: string;
};

const STOPWORDS = new Set(["the", "and", "for", "with", "your", "you", "our", "are", "from", "this", "that", "will", "can", "job", "role", "work"]);
const TECH = ["typescript", "javascript", "react", "python", "java", "sql", "aws", "azure", "api", "backend", "frontend", "full-stack", "machine learning", "ai", "docker", "kubernetes", "git"];

export function words(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

export function roleMatches(title: string, query: string): boolean {
  const titleWords = words(title);
  const queryWords = [...words(query)];
  if (!queryWords.length) return true;
  return queryWords.filter((word) => titleWords.has(word)).length >= Math.max(1, Math.ceil(queryWords.length * 0.45));
}

export function scoreJob(job: { title: string; description?: string; location?: string }, query: string, resume = ""): number {
  const queryWords = words(query);
  const titleWords = words(job.title);
  const descriptionWords = words(job.description ?? "");
  const resumeWords = words(resume);
  const queryHit = [...queryWords].filter((word) => titleWords.has(word)).length / Math.max(queryWords.size, 1);
  const resumeEvidence = resumeWords.size
    ? [...resumeWords].filter((word) => descriptionWords.has(word)).length / Math.max(Math.min(resumeWords.size, 30), 1)
    : 0.28;
  const studentBoost = /intern|co-?op|student|new grad/i.test(job.title) ? 0.08 : 0;
  const canadaBoost = /canada|ontario|quebec|alberta|british columbia|ottawa|toronto|montreal|vancouver|waterloo/i.test(job.location ?? "") ? 0.06 : 0;
  return Math.max(52, Math.min(97, Math.round(58 + queryHit * 24 + resumeEvidence * 18 + studentBoost * 100 + canadaBoost * 100)));
}

export function extractTags(text: string): string[] {
  const lower = text.toLowerCase();
  return TECH.filter((item) => lower.includes(item)).slice(0, 4).map((item) => item.replace(/^./, (letter) => letter.toUpperCase()));
}

export function stripHtml(value = ""): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

export function stableId(...parts: string[]): string {
  let hash = 2166136261;
  for (const char of parts.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `job-${(hash >>> 0).toString(36)}`;
}

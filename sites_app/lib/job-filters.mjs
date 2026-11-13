function wordSet(value) {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9+#.-]+/g, " ").split(/\s+/).filter((word) => word.length > 1));
}

function stem(value) {
  return value.toLowerCase()
    .replace(/engineering|engineers?/g, "engineer")
    .replace(/development|developers?/g, "develop")
    .replace(/analytics?|analysts?|analysis/g, "analy")
    .replace(/internships?/g, "intern")
    .replace(/co[ -]?ops?/g, "coop")
    .replace(/programmers?/g, "program");
}

const MODIFIERS = new Set(["intern", "coop", "junior", "senior", "student", "graduate", "remote", "full", "time", "part"]);
const FAMILIES = [
  new Set(["engineer", "develop", "program", "software"]), new Set(["analy", "intelligence", "insights", "data"]),
  new Set(["product", "program", "project"]), new Set(["design", "designer", "ux", "ui"]),
  new Set(["sales", "account", "business", "development"]), new Set(["market", "marketing", "growth", "content"]),
];

function related(word) { return FAMILIES.find((candidate) => candidate.has(word)) ?? new Set([word]); }

export function titleMatches(title, query) {
  const wanted = [...wordSet(stem(query))]; const core = wanted.filter((word) => !MODIFIERS.has(word)); const actual = wordSet(stem(title));
  if (!wanted.length) return true;
  const studentIntent = /intern|co[ -]?op|student|new grad|entry|junior/i.test(query);
  if (studentIntent && /senior|staff|principal|manager|director|lead\b|head\b/i.test(title)) return false;
  const hits = core.filter((word) => [...related(word)].some((item) => actual.has(item))).length;
  return core.length ? hits >= Math.max(1, Math.ceil(core.length * 0.6)) : wanted.some((word) => actual.has(word));
}

export function durationMatches(job, duration) {
  if (!duration || duration === "any") return true;
  const titleAndType = `${job.title} ${job.type ?? ""}`.toLowerCase(); const haystack = `${titleAndType} ${job.description ?? ""}`.toLowerCase();
  if (duration === "internship") {
    if (/senior|staff|principal|manager|director|lead\b|head\b|sr\.?\b/.test(job.title.toLowerCase())) return false;
    return /\bintern(ship)?\b|\bco[ -]?op\b|\bstudent\b|\bnew grad(uate)?\b/.test(titleAndType);
  }
  if (duration === "full_time") return /full[- ]?time|permanent/.test(haystack);
  if (duration === "part_time") return /part[- ]?time/.test(haystack);
  if (duration === "contract") return /contract|temporary|fixed[- ]term|term position/.test(haystack);
  if (duration === "4_months") return /\b4[- ]?months?\b|\b16[- ]?weeks?\b/.test(haystack);
  if (duration === "8_months") return /\b8[- ]?months?\b|\b32[- ]?weeks?\b/.test(haystack);
  if (duration === "12_plus") return /\b(?:12|16|18|24)[- ]?months?\b|\b[1-9][- ]?years?\b|permanent/.test(haystack);
  return true;
}

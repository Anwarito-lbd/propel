"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeProfileUrl } from "../lib/profile-url";
import InterviewCoach from "./interview-coach";

type Tab = "jobs" | "pipeline" | "documents" | "leads" | "interview";
type Profile = {
  email: string; fullName: string; phone: string; location: string; university: string; program: string;
  degree: string; graduationYear: string; workAuthorization: string; targetTitles: string;
  preferredLocations: string; languages: string; linkedinUrl: string; portfolioUrl: string;
  resumeFileName: string; hasResume: boolean; resumeCharacters: number; onboardingCompleted: boolean;
};
type Job = {
  id: string; company: string; monogram: string; title: string; location: string; mode: string; type: string;
  posted: string; postedAt: number | null; score: number; tags: string[]; evidence: string[]; gaps: string[];
  color: string; source: string; sourceUrl: string; description: string; url: string; verifiedAt: string;
};
type Workspace = {
  opportunities: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  leads: Array<Record<string, unknown>>;
  interviews: Array<Record<string, unknown>>;
};
type SearchMeta = {
  checkedAt: string;
  sources: Array<{ provider: string; sourceUrl: string; returned: number; ok: boolean; error?: string }>;
  careerOps: { version: string; commit: string };
  crawl4ai: { configured: boolean; used: boolean };
};

const EMPTY_WORKSPACE: Workspace = { opportunities: [], artifacts: [], leads: [], interviews: [] };

export default function CareerDashboard({ user }: { user: { name: string; email: string } }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [tab, setTab] = useState<Tab>("jobs");
  const [query, setQuery] = useState("Software Engineer");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [studentOnly, setStudentOnly] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState("30");
  const [duration, setDuration] = useState("any");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [drawer, setDrawer] = useState<"cv" | "cover_letter" | "message" | null>(null);
  const [artifact, setArtifact] = useState("");
  const [artifactMeta, setArtifactMeta] = useState<{ artifactId?: string; gaps?: string[]; evidence?: string[]; lead?: { name: string; role: string; publicUrl: string; source: string; evidence?: string } } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [coachJob, setCoachJob] = useState<Job | null>(null);

  useEffect(() => { void loadProfile(); void refreshWorkspace(); }, []);

  async function loadProfile() {
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const payload = await response.json() as { profile?: Profile | null };
      const next = payload.profile ?? null;
      setProfile(next);
      if (next?.targetTitles) setQuery(next.targetTitles.split(",")[0].trim());
    } finally { setLoadingProfile(false); }
  }

  async function refreshWorkspace() {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.ok) setWorkspace(await response.json() as Workspace);
  }

  async function searchJobs() {
    if (!query.trim()) return;
    setLoading(true); setError(""); setSearched(true);
    try {
      const search = new URLSearchParams({ title: query.trim(), maxAgeDays, duration, studentOnly: String(studentOnly) });
      const response = await fetch(`/api/jobs/search?${search.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { jobs?: Job[]; meta?: SearchMeta; error?: string };
      if (!response.ok) throw new Error(payload.error || "Live sources are unavailable.");
      setJobs(payload.jobs ?? []); setMeta(payload.meta ?? null); await refreshWorkspace();
    } catch (reason) { setJobs([]); setMeta(null); setError(reason instanceof Error ? reason.message : "Live search failed."); }
    finally { setLoading(false); }
  }

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    if (remoteOnly && !job.mode.toLowerCase().includes("remote")) return false;
    if (studentOnly && !/intern|co-?op|student|new grad/i.test(`${job.title} ${job.type}`)) return false;
    return true;
  }), [jobs, remoteOnly, studentOnly]);
  const savedJobIds = useMemo(() => new Set(workspace.opportunities.map((item) => String(item.id))), [workspace.opportunities]);

  function openStudio(kind: "cv" | "cover_letter" | "message", job: Job) {
    setSelectedJob(job); setDrawer(kind); setArtifact(""); setArtifactMeta(null); setError("");
  }

  function openInterview(job: Job) { setCoachJob(job); setTab("interview"); }

  async function generate(kind: "cv" | "cover_letter" | "message") {
    if (!selectedJob) return;
    setGenerating(true); setError("");
    try {
      const response = await fetch("/api/careerops/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, job: selectedJob }) });
      const payload = await response.json() as { content?: string; error?: string; gaps?: string[]; evidence?: string[]; lead?: { name: string; role: string; publicUrl: string; source: string } };
      if (!response.ok) throw new Error(payload.error || "Gemini could not generate this draft.");
      setArtifact(payload.content ?? ""); setArtifactMeta(payload); await refreshWorkspace();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Generation failed."); }
    finally { setGenerating(false); }
  }

  if (loadingProfile) return <div className="launch-screen"><i className="spinner dark" /><p>Opening your private workspace…</p></div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("jobs")}>Propel <span>◆</span></button>
        <nav aria-label="Main navigation">
          {(["jobs", "pipeline", "documents", "leads", "interview"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "active" : ""}>{item === "interview" ? "Interview" : item[0].toUpperCase() + item.slice(1)}</button>)}
        </nav>
        <div className="user-tools"><span className="private-pill">Private</span><button className="avatar" onClick={() => setProfileOpen(true)}>{initials(profile?.fullName || user.name)}</button></div>
      </header>

      <main>
        {tab === "jobs" && <>
          <section className="hero">
            <p className="eyebrow">LIVE CANADA SEARCH · CAREER-OPS PROVIDERS · FACT-SAFE GEMINI</p>
            <h1>Find real work that fits.</h1>
            <p>Every result comes from a live public ATS or job feed. Your resume stays the source of truth; no job, lead, metric or skill is invented.</p>
          </section>
          <section className="search-panel" aria-label="Live job search">
            <label className="search-field"><span>⌕</span><span className="sr-only">Job title</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void searchJobs()} placeholder="e.g. Software Engineer, Data Analyst" /></label>
            <div className="location-field"><span>⌖</span><strong>Canada</strong></div>
            <button className="primary search-button" onClick={() => void searchJobs()} disabled={loading}>{loading ? <><i className="spinner" /> Checking live sources…</> : "Search live jobs"}</button>
          </section>
          <section className="search-filters-row" aria-label="Search period and duration">
            <label>Posted within<select value={maxAgeDays} onChange={(event) => setMaxAgeDays(event.target.value)}><option value="0">Any time</option><option value="1">Last 24 hours</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select></label>
            <label>Job duration / type<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="any">Any duration</option><option value="internship">Internship / co-op</option><option value="4_months">About 4 months</option><option value="8_months">About 8 months</option><option value="12_plus">12+ months / permanent</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract / temporary</option></select></label>
            <p>Filters apply only when the public posting provides the necessary date or duration.</p>
          </section>
          <section className="stats">
            <Stat icon="◎" value={searched ? String(jobs.length) : "0"} label="Verified live matches" />
            <Stat icon="☆" value={String(jobs.filter((job) => job.score >= 70).length)} label="Strong CV matches" />
            <Stat icon="▧" value={String(workspace.artifacts.filter((item) => item.kind === "cv").length)} label="CV drafts" />
            <Stat icon="↗" value={String(workspace.leads.length)} label="Verified channels" />
          </section>
          <section className="journey-strip" aria-label="Your job search workflow">
            <div><span>01</span><strong>Discover</strong><p>{searched ? `${jobs.length} verified matches` : "Run a live search"}</p></div>
            <div><span>02</span><strong>Prepare</strong><p>{workspace.artifacts.length ? `${workspace.artifacts.length} tailored drafts` : "Tailor CV + letter"}</p></div>
            <div><span>03</span><strong>Connect</strong><p>{workspace.leads.length ? `${workspace.leads.length} verified channels` : "Find a real channel"}</p></div>
            <div><span>04</span><strong>Practice</strong><p>{workspace.interviews.length ? `${workspace.interviews.length} interview sessions` : "Rehearse the interview"}</p></div>
            <div><span>05</span><strong>Track</strong><p>{workspace.opportunities.length ? `${workspace.opportunities.length} applications` : "Move every next step"}</p></div>
          </section>
          <div className="workspace">
            <aside className="filters">
              <div className="filter-heading"><strong>Filter real results</strong><button onClick={() => { setRemoteOnly(false); setStudentOnly(false); }}>Clear</button></div>
              <FilterGroup title="Eligibility"><Check label="Remote eligible" checked={remoteOnly} onChange={setRemoteOnly} /><Check label="Intern / co-op / new grad" checked={studentOnly} onChange={setStudentOnly} /></FilterGroup>
              <div className="source-note"><span>✓</span><p><strong>No demo fallback</strong><br />If providers return nothing, you see an empty state—not invented jobs.</p></div>
              {meta && <div className="source-health"><strong>Live verification complete</strong><p>{jobs.length} current postings checked against your resume</p><p>Checked {new Date(meta.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div>}
            </aside>
            <section className="results" aria-live="polite">
              <div className="results-head"><div><strong>{visibleJobs.length} verified matches</strong><span>{meta ? `Career-Ops ${meta.careerOps.version}` : "Search to query live providers"}</span></div></div>
              {error && !drawer && <Empty title="Request paused" text={error} />}
              {!searched && <Empty title="No fake preview cards" text="Enter a job title and search. The app will query public sources in real time." />}
              {searched && !loading && !error && !visibleJobs.length && <Empty title="No verified match found" text="Try a broader title such as “software developer” or “data analyst”. Nothing synthetic has been added." />}
              <div className={`job-grid ${loading ? "loading" : ""}`}>{visibleJobs.map((job, index) => <JobCard key={job.id} job={job} index={index} saved={savedJobIds.has(job.id)} onSaved={refreshWorkspace} onOpen={openStudio} onInterview={openInterview} />)}</div>
            </section>
          </div>
        </>}

        {tab === "pipeline" && <PipelineView items={workspace.opportunities} onRefresh={refreshWorkspace} />}
        {tab === "documents" && <DocumentsView items={workspace.artifacts} profile={profile} />}
        {tab === "leads" && <LeadsView items={workspace.leads} />}
        {tab === "interview" && <InterviewCoach key={coachJob?.id ?? "custom-interview"} initialJob={coachJob ? { company: coachJob.company, title: coachJob.title, description: coachJob.description, url: coachJob.url } : null} jobs={jobs.map((job) => ({ company: job.company, title: job.title, description: job.description, url: job.url }))} onRefresh={refreshWorkspace} />}
      </main>

      {drawer && selectedJob && <StudioDrawer kind={drawer} job={selectedJob} artifact={artifact} meta={artifactMeta} generating={generating} error={error} onGenerate={() => void generate(drawer)} onClose={() => { setDrawer(null); setError(""); }} />}
      {(!profile?.onboardingCompleted || profileOpen) && <Onboarding user={user} existing={profile} required={!profile?.onboardingCompleted} onClose={() => setProfileOpen(false)} onComplete={async () => { await loadProfile(); setProfileOpen(false); }} />}
    </div>
  );
}

function JobCard({ job, index, saved, onSaved, onOpen, onInterview }: { job: Job; index: number; saved: boolean; onSaved: () => Promise<void>; onOpen: (kind: "cv" | "cover_letter" | "message", job: Job) => void; onInterview: (job: Job) => void }) {
  const [saving, setSaving] = useState(false);
  async function save() { if (saved || saving) return; setSaving(true); const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }) }); if (response.ok) await onSaved(); setSaving(false); }
  return <article className="job-card" style={{ animationDelay: `${index * 35}ms` }}>
    {job.score >= 80 && <span className="top-match">Strong evidence match</span>}
    <div className="job-card-top"><div className="company-mark" style={{ background: job.color }}>{job.monogram}</div><div className="job-info"><h2>{job.title}</h2><strong>{job.company}</strong><p>⌖ {job.location} · {job.mode}</p></div><div className="score"><b>{job.score}%</b><span>evidence fit</span></div></div>
    <div className="tags"><span>{job.type}</span>{job.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <p className="job-description">{job.description || "The public feed did not include a description. Open the original posting for full details."}</p>
    <div className="job-meta"><span>{job.posted}</span><a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source}</a></div>
    <div className="job-actions"><a href={job.url} target="_blank" rel="noreferrer">Open original</a><button onClick={() => void save()} disabled={saved || saving}>{saved ? "Saved ✓" : saving ? "Saving…" : "Save"}</button><button onClick={() => onOpen("cv", job)}>Tailor CV</button><button onClick={() => onOpen("cover_letter", job)}>Cover letter</button><button onClick={() => onOpen("message", job)}>Find lead</button><button className="primary" onClick={() => onInterview(job)}>Practice</button></div>
  </article>;
}

function StudioDrawer({ kind, job, artifact, meta, generating, error, onGenerate, onClose }: { kind: "cv" | "cover_letter" | "message"; job: Job; artifact: string; meta: { artifactId?: string; gaps?: string[]; evidence?: string[]; lead?: { name: string; role: string; publicUrl: string; source: string; evidence?: string } } | null; generating: boolean; error: string; onGenerate: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
    <div className="drawer-head"><div><span>{kind === "cv" ? "CAREER-OPS CV MODE" : kind === "cover_letter" ? "FACT-SAFE COVER LETTER" : "VERIFIED OUTREACH"}</span><h2>{kind === "cv" ? "Fact-safe CV" : kind === "cover_letter" ? "Targeted cover letter" : "Real channel, custom note"}</h2></div><button onClick={onClose}>×</button></div>
    <div className="selected-role"><div className="company-mark" style={{ background: job.color }}>{job.monogram}</div><div><strong>{job.title}</strong><p>{job.company} · verified {new Date(job.verifiedAt).toLocaleString()}</p></div></div>
    {kind === "message" && <div className="lead-card"><div className="lead-avatar">✓</div><div><strong>{meta?.lead?.name || `${job.company} recruiting team`}</strong><p>{meta?.lead?.role || "Checking public posting"}</p><span>{meta?.lead?.evidence || `Verified through ${job.source}`}</span>{meta?.lead?.publicUrl && <a href={meta.lead.publicUrl} target={meta.lead.publicUrl.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{meta.lead.publicUrl.startsWith("mailto:") ? "Email this verified lead" : meta.lead.publicUrl.includes("linkedin.com") ? "Open verified LinkedIn" : "Open official channel"}</a>}</div></div>}
    <div className="integrity-banner"><span>✓</span><p><strong>{kind === "cv" ? "Resume facts only" : "No invented recruiter"}</strong><br />{kind === "cv" ? "Gemini may reorder or rephrase supported facts, but cannot add claims." : "A named person is shown only when a public source verifies them. This job currently verifies the official channel."}</p></div>
    {!artifact && <button className="primary full-button" onClick={onGenerate} disabled={generating}>{generating ? "Gemini is checking every claim…" : kind === "cv" ? "Generate tailored CV draft" : kind === "cover_letter" ? "Generate targeted cover letter" : "Verify lead and draft ≤300-character message"}</button>}
    {error && <p className="form-error">{error}</p>}
    {artifact && <div className="artifact-result"><span>{kind === "cv" ? "TAILORED CV · REVIEW REQUIRED" : kind === "cover_letter" ? "COVER LETTER · REVIEW REQUIRED" : "CUSTOM MESSAGE · REVIEW BEFORE SENDING"}</span><pre>{artifact}</pre>{meta?.evidence?.length ? <p className="evidence-line"><strong>Supported evidence:</strong> {meta.evidence.join(", ")}</p> : null}{meta?.gaps?.length ? <p className="gap-line"><strong>Unaddressed gaps:</strong> {meta.gaps.join(", ")}</p> : null}<button className="primary full-button" onClick={async () => { await navigator.clipboard.writeText(artifact); setCopied(true); }}>{copied ? "Copied" : "Copy draft"}</button>{kind !== "message" && meta?.artifactId && <div className="export-row"><a className="secondary" href={`/api/documents/export?id=${encodeURIComponent(meta.artifactId)}&format=pdf`}>Download PDF</a><a className="secondary" href={`/api/documents/export?id=${encodeURIComponent(meta.artifactId)}&format=docx`}>Download DOCX</a></div>}</div>}
    <a className="secondary full-button link-button" href={job.url} target="_blank" rel="noreferrer">Open verified application page</a>
    <p className="approval-note">Propel drafts only. Review every fact and send or apply yourself. No tool can guarantee an interview or job.</p>
  </aside></div>;
}

function Onboarding({ user, existing, required, onClose, onComplete }: { user: { name: string; email: string }; existing: Profile | null; required: boolean; onClose: () => void; onComplete: () => Promise<void> }) {
  const [step, setStep] = useState(1);
  const [fields, setFields] = useState({
    fullName: existing?.fullName || user.name, phone: existing?.phone || "", location: existing?.location || "",
    university: existing?.university || "", program: existing?.program || "", degree: existing?.degree || "",
    graduationYear: existing?.graduationYear || "", workAuthorization: existing?.workAuthorization || "",
    targetTitles: existing?.targetTitles || "", preferredLocations: existing?.preferredLocations || "",
    languages: existing?.languages || "", linkedinUrl: existing?.linkedinUrl || "", portfolioUrl: existing?.portfolioUrl || "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(Boolean(existing?.hasResume));
  const [uploadName, setUploadName] = useState(existing?.resumeFileName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function field(name: keyof typeof fields, label: string, placeholder = "", type = "text") { return <label>{label}<input type={type} value={fields[name]} placeholder={placeholder} onChange={(event) => setFields({ ...fields, [name]: event.target.value })} onBlur={(event) => { if (type !== "url") return; const normalized = normalizeProfileUrl(event.target.value); if (normalized !== null) setFields((current) => ({ ...current, [name]: normalized })); }} /></label>; }
  async function upload() {
    if (!file) return;
    setBusy(true); setError("");
    const data = new FormData(); data.append("resume", file);
    const response = await fetch("/api/resume", { method: "POST", body: data });
    const payload = await response.json() as { error?: string; fileName?: string; suggestions?: Partial<typeof fields> | null };
    if (!response.ok) setError(payload.error || "Upload failed."); else {
      if (payload.suggestions) setFields((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value || String(payload.suggestions?.[key as keyof typeof fields] || "")])) as typeof fields);
      setUploaded(true); setUploadName(payload.fileName || file.name); setStep(3);
    }
    setBusy(false);
  }
  async function finish() {
    setBusy(true); setError("");
    const response = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, onboardingCompleted: true }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) setError(payload.error || "Profile could not be saved."); else await onComplete();
    setBusy(false);
  }
  return <div className="profile-backdrop"><section className="profile-dialog onboarding" role="dialog" aria-modal="true">
    <header><div><span>PRIVATE ONBOARDING · STEP {step} OF 3</span><h2>{step === 1 ? "Start with what you know." : step === 2 ? "Upload your resume." : "Confirm and start."}</h2><p>Leave any field open. After upload, Gemini fills only facts explicitly found in your resume; unknown fields remain blank.</p></div>{!required && <button onClick={onClose}>×</button>}</header>
    <div className="stepper"><i className={step >= 1 ? "done" : ""}>1</i><span /><i className={step >= 2 ? "done" : ""}>2</i><span /><i className={step >= 3 ? "done" : ""}>3</i></div>
    {step === 1 && <><div className="optional-note">Every field below is optional. Blank answers never block you.</div><div className="profile-grid">{field("fullName", "Full name")}{field("phone", "Phone")}{field("location", "City, province, country", "Toronto, ON, Canada")}{field("university", "University")}{field("program", "Program / field of study")}{field("degree", "Degree")}{field("graduationYear", "Graduation year")}{field("workAuthorization", "Canadian work authorization", "Leave blank if not stated")}</div>{field("targetTitles", "Target job titles", "Software Engineer, Developer Co-op")}{field("preferredLocations", "Preferred locations", "Toronto, Ottawa, Remote Canada")}{field("languages", "Languages", "English, French")}{field("linkedinUrl", "LinkedIn URL", "https://linkedin.com/in/…", "url")}{field("portfolioUrl", "Portfolio URL", "https://…", "url")}<button className="primary full-button" onClick={() => setStep(2)}>Continue to resume</button></>}
    {step === 2 && <><div className="upload-zone"><span>PDF</span><h3>{uploaded && !file ? uploadName : "Choose your real resume"}</h3><p>PDF, TXT or Markdown · maximum 8 MB. PDF text is extracted by Gemini without adding facts.</p><input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => { setFile(event.target.files?.[0] || null); setUploaded(false); }} />{file && <strong>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</strong>}</div>{error && <p className="form-error">{error}</p>}<div className="onboarding-actions"><button className="secondary" onClick={() => setStep(1)}>Back</button>{uploaded && !file ? <button className="primary" onClick={() => setStep(3)}>Keep this resume</button> : <button className="primary" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Reading resume…" : "Upload and extract"}</button>}</div></>}
    {step === 3 && <><div className="confirmation-card"><div><span>PROFILE</span><strong>{fields.fullName || "Open"}</strong><p>{[fields.program, fields.university].filter(Boolean).join(" · ") || "Not found in resume"}</p></div><div><span>TARGETS</span><strong>{fields.targetTitles || "Choose during search"}</strong><p>{fields.preferredLocations || fields.location || "Canada"}</p></div><div><span>RESUME</span><strong>{uploadName}</strong><p>Private file · fact source enabled</p></div></div><button className="secondary full-button" onClick={() => setStep(1)}>Review autofilled fields</button><div className="integrity-banner"><span>✓</span><p><strong>No fabricated data</strong><br />Unknown profile fields stay open. Search results come from live sources.</p></div>{error && <p className="form-error">{error}</p>}<div className="onboarding-actions"><button className="secondary" onClick={() => setStep(2)}>Back</button><button className="primary" disabled={!uploaded || busy} onClick={() => void finish()}>{busy ? "Saving…" : "Enter my workspace"}</button></div></>}
  </section></div>;
}

function PipelineView({ items, onRefresh }: { items: Array<Record<string, unknown>>; onRefresh: () => Promise<void> }) {
  const stages = ["Shortlisted", "CV ready", "Lead ready", "Applied", "Interview", "Offer", "Rejected"];
  const [error, setError] = useState("");
  async function move(id: string, status: string) {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error || "Could not update this application."); return; }
    setError(""); await onRefresh();
  }
  async function remove(id: string) {
    const response = await fetch(`/api/workspace?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) await onRefresh();
  }
  return <section className="subpage"><div className="subpage-head"><p className="eyebrow">REAL APPLICATION TRACKER</p><h1>Your actual pipeline.</h1><p>Move every application as it progresses. “Applied” is never set automatically.</p></div>{error && <p className="form-error">{error}</p>}<div className="pipeline-board live">{stages.map((stage) => { const jobs = items.filter((item) => item.status === stage); return <section key={stage}><header><strong>{stage}</strong><span>{jobs.length}</span></header>{jobs.map((job) => <article key={String(job.id)}><b>{String(job.company)}</b><h3>{String(job.title)}</h3><div><span>{String(job.score)}% evidence fit</span><a href={String(job.url)} target="_blank" rel="noreferrer">Open ↗</a></div><label className="stage-control">Move to<select value={String(job.status)} onChange={(event) => void move(String(job.id), event.target.value)}>{stages.map((option) => <option key={option}>{option}</option>)}<option>Archived</option></select></label><button className="text-button" onClick={() => void remove(String(job.id))}>Remove from pipeline</button></article>)}{!jobs.length && <p className="column-empty">Nothing here yet.</p>}</section>; })}</div></section>;
}

function DocumentsView({ items, profile }: { items: Array<Record<string, unknown>>; profile: Profile | null }) {
  return <section className="subpage"><div className="subpage-head"><p className="eyebrow">FACT-SAFE DOCUMENTS</p><h1>Every draft has provenance.</h1><p>Your uploaded resume remains the source of truth. CVs and cover letters export as professional PDF or editable DOCX.</p></div><div className="document-grid"><article className="base-cv"><span>MASTER RESUME</span><h2>{profile?.resumeFileName || "No resume uploaded"}</h2><p>{profile?.resumeCharacters?.toLocaleString() || 0} extracted characters · private R2 file</p><div><b>{profile?.fullName}</b></div></article>{items.map((item) => <article key={String(item.id)}><span>{item.kind === "cv" ? "TAILORED CV" : item.kind === "cover_letter" ? "COVER LETTER" : "OUTREACH MESSAGE"}</span><h2>{String(item.company || "Verified opportunity")}</h2><p>{String(item.title || "")}</p><div><b>{new Date(Number(item.createdAt)).toLocaleDateString()}</b>{item.kind === "message" ? <button onClick={() => download(`${String(item.company || "career")}-message.md`, String(item.content))}>Markdown</button> : <span className="mini-export"><a href={`/api/documents/export?id=${encodeURIComponent(String(item.id))}&format=pdf`}>PDF</a><a href={`/api/documents/export?id=${encodeURIComponent(String(item.id))}&format=docx`}>DOCX</a></span>}</div></article>)}</div>{!items.length && <Empty title="No generated documents" text="Tailor a CV, create a cover letter or draft a message from a live job result." />}</section>;
}

function LeadsView({ items }: { items: Array<Record<string, unknown>> }) {
  return <section className="subpage"><div className="subpage-head"><p className="eyebrow">VERIFIED PUBLIC CHANNELS</p><h1>No imaginary recruiters.</h1><p>Propel shows a public recruiting email or LinkedIn profile when the job page verifies one. Otherwise, it keeps the official application channel.</p></div>{items.length ? <div className="lead-table"><header><span>Lead</span><span>Role</span><span>Company</span><span>Verified</span><span /></header>{items.map((lead) => { const publicUrl = String(lead.publicUrl); const label = publicUrl.startsWith("mailto:") ? "Email lead" : publicUrl.includes("linkedin.com") ? "Open LinkedIn" : "Apply"; return <article key={String(lead.id)}><span className="person"><i>✓</i><b>{String(lead.name)}</b></span><span>{String(lead.role)}</span><span>{String(lead.company)}</span><span><em>{new Date(Number(lead.verifiedAt)).toLocaleDateString()}</em></span><a href={publicUrl} target={publicUrl.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">{label}</a></article>; })}</div> : <Empty title="No verified lead yet" text="Choose “Find lead” on a live job. Propel will look for a public recruiting email or LinkedIn profile without guessing." />}<div className="ethics-card"><span>✓</span><div><strong>Quality-first outreach</strong><p>One draft at a time, never auto-sent. No guessed emails, no private-data scraping, and no guarantee claims.</p></div></div></section>;
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) { return <article><span>{icon}</span><div><strong>{value}</strong><p>{label}</p></div></article>; }
function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset><legend>{title}<span>⌃</span></legend>{children}</fieldset>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U"; }
function download(name: string, content: string) { const blob = new Blob([content], { type: "text/markdown" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-"); anchor.click(); URL.revokeObjectURL(url); }

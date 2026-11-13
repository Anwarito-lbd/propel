from __future__ import annotations
from app.models import Job
from app.services.resume import keywords

SENIOR_TERMS = {'senior','staff','principal','lead','manager','director','architect'}
JUNIOR_TERMS = {'intern','internship','co-op','coop','junior','new grad','graduate','entry'}

def score_job(job: Job, resume_text: str = '', field: str = '', duration: str = '') -> float:
    text = f"{job.title} {job.company} {job.location} {job.description}".lower()
    score = 0.0
    if field and field.lower() in text:
        score += 12
    if any(term in text for term in JUNIOR_TERMS):
        score += 20
    if any(term in job.title.lower() for term in SENIOR_TERMS):
        score -= 35
    if duration and duration.lower() in text:
        score += 8
    for kw in keywords(resume_text, 18):
        if kw in text:
            score += 3
    return max(0.0, min(100.0, score))

def filter_jobs(jobs: list[Job], query: str = '', location: str = '', duration: str = '', resume_text: str = '', field: str = '') -> list[Job]:
    q = query.lower().strip()
    loc = location.lower().strip()
    out: list[Job] = []
    for job in jobs:
        hay = f"{job.title} {job.company} {job.location} {job.description}".lower()
        if q and not all(part in hay for part in q.split() if len(part) > 1):
            continue
        if loc and loc not in job.location.lower() and loc not in hay:
            continue
        job.score = score_job(job, resume_text, field, duration)
        out.append(job)
    return sorted(out, key=lambda j: (j.score, j.posted_at), reverse=True)

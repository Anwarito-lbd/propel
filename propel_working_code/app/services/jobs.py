from __future__ import annotations
import hashlib
from datetime import datetime, timezone
import httpx
from app.models import Job
from app.services.scoring import filter_jobs

TIMEOUT = httpx.Timeout(12.0, connect=5.0)

class JobProviderError(RuntimeError):
    pass

def stable_id(source: str, url: str, title: str) -> str:
    return hashlib.sha1(f"{source}:{url}:{title}".encode()).hexdigest()[:16]

def clean(value: object, default: str = '') -> str:
    return str(value or default).strip()

async def fetch_remotive(query: str = '') -> list[Job]:
    url = 'https://remotive.com/api/remote-jobs'
    params = {'search': query} if query else {}
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={'User-Agent': 'Propel/1.0'}) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
    jobs: list[Job] = []
    for item in data.get('jobs', []):
        job_url = clean(item.get('url'))
        title = clean(item.get('title'), 'Untitled role')
        jobs.append(Job(
            id=stable_id('remotive', job_url, title),
            title=title,
            company=clean(item.get('company_name'), 'Unknown company'),
            location=clean(item.get('candidate_required_location'), 'Remote'),
            source='Remotive public API',
            url=job_url,
            apply_url=job_url,
            posted_at=clean(item.get('publication_date')),
            description=clean(item.get('description')),
            job_type=clean(item.get('job_type'), 'remote')
        ))
    return jobs

async def fetch_arbeitnow() -> list[Job]:
    url = 'https://www.arbeitnow.com/api/job-board-api'
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={'User-Agent': 'Propel/1.0'}) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()
    jobs: list[Job] = []
    for item in data.get('data', []):
        job_url = clean(item.get('url'))
        title = clean(item.get('title'), 'Untitled role')
        locations = item.get('location') or item.get('locations') or 'Remote / Europe'
        if isinstance(locations, list):
            locations = ', '.join(str(x) for x in locations)
        tags = item.get('tags') or []
        description = clean(item.get('description'))
        jobs.append(Job(
            id=stable_id('arbeitnow', job_url, title),
            title=title,
            company=clean(item.get('company_name'), 'Unknown company'),
            location=clean(locations, 'Remote / Europe'),
            source='Arbeitnow public API',
            url=job_url,
            apply_url=job_url,
            posted_at=clean(item.get('created_at')) or datetime.now(timezone.utc).isoformat(),
            description=description,
            job_type=', '.join(str(t) for t in tags) if tags else 'job'
        ))
    return jobs

async def search_real_jobs(query: str, location: str = '', duration: str = '', resume_text: str = '', field: str = '') -> tuple[list[Job], list[str]]:
    """Return only live provider data. Provider errors are returned transparently; fake jobs are never inserted."""
    errors: list[str] = []
    all_jobs: list[Job] = []
    for name, fn in [('Remotive', lambda: fetch_remotive(query)), ('Arbeitnow', fetch_arbeitnow)]:
        try:
            all_jobs.extend(await fn())
        except Exception as exc:  # external dependency can fail; surface it honestly
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
    unique = {job.id: job for job in all_jobs}
    return filter_jobs(list(unique.values()), query=query, location=location, duration=duration, resume_text=resume_text, field=field), errors

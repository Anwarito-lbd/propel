from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
import secrets
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import hashlib
import hmac
from pydantic import BaseModel

from app.database import init_db, execute, fetchone, fetchall
from app.models import Job, UserProfile
from app.services.resume import extract_resume_text
from app.services.jobs import search_real_jobs
from app.services.generator import generate_application_message, interview_questions

BASE = Path(__file__).resolve().parent
ALLOWED_STATUSES = {'saved', 'shortlisted', 'applied', 'interview', 'offer', 'rejected', 'archived'}


def startup() -> None:
    init_db()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    startup()
    yield


app = FastAPI(title='Propel', version='1.0.0', lifespan=lifespan)
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000).hex()
    return f'{salt}${digest}'


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split('$', 1)
        candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 120000).hex()
        return hmac.compare_digest(candidate, digest)
    except Exception:
        return False


SESSIONS: dict[str, str] = {}
JOB_CACHE: dict[str, Job] = {}


class AuthBody(BaseModel):
    email: str
    password: str
    name: str = ''


class SearchBody(BaseModel):
    token: str
    query: str = ''
    location: str = ''
    period_days: int = 30
    duration: str = ''
    field: str = ''


class SaveBody(BaseModel):
    token: str
    job_id: str
    status: str = 'saved'
    note: str = ''


class GenerateBody(BaseModel):
    token: str
    job_id: str


class StatusBody(BaseModel):
    token: str
    application_id: int
    status: str


def email_for_token(token: str) -> str:
    email = SESSIONS.get(token)
    if not email:
        raise HTTPException(status_code=401, detail='Please sign in first.')
    return email


def get_profile(email: str) -> UserProfile:
    row = fetchone('SELECT * FROM users WHERE email=?', [email])
    if not row:
        raise HTTPException(status_code=404, detail='User not found')
    return UserProfile(
        email=row['email'],
        name=row['name'] or '',
        field=row['field'] or '',
        target_location=row['target_location'] or '',
        target_duration=row['target_duration'] or '',
        resume_text=row['resume_text'] or ''
    )


def resolve_job_for_user(email: str, job_id: str) -> Job:
    job = JOB_CACHE.get(job_id)
    if job:
        return job
    row = fetchone('SELECT * FROM applications WHERE email=? AND job_id=?', [email, job_id])
    if not row:
        raise HTTPException(status_code=404, detail='Search or save the job first.')
    return Job(
        id=row['job_id'],
        title=row['title'],
        company=row['company'],
        url=row['url'],
        apply_url=row['url'],
        location='',
        source='Saved verified application',
        posted_at='',
        description='',
    )


@app.get('/', response_class=HTMLResponse)
def index() -> str:
    return (BASE / 'static' / 'index.html').read_text(encoding='utf-8')


@app.post('/api/signup')
def signup(body: AuthBody):
    email = body.email.strip().lower()
    if not email or '@' not in email:
        raise HTTPException(status_code=400, detail='Valid email required')
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail='Password must be at least 6 characters')
    exists = fetchone('SELECT email FROM users WHERE email=?', [email])
    if exists:
        raise HTTPException(status_code=409, detail='Account already exists')
    execute('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)', [email, hash_password(body.password), body.name.strip()])
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = email
    return {'token': token, 'email': email, 'name': body.name.strip()}


@app.post('/api/login')
def login(body: AuthBody):
    email = body.email.strip().lower()
    row = fetchone('SELECT * FROM users WHERE email=?', [email])
    if not row or not verify_password(body.password, row['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = email
    return {'token': token, 'email': email, 'name': row['name'] or ''}


@app.post('/api/profile')
async def update_profile(
    token: str = Form(...),
    name: str = Form(''),
    field: str = Form(''),
    target_location: str = Form(''),
    target_duration: str = Form(''),
    resume: Optional[UploadFile] = File(None)
):
    email = email_for_token(token)
    resume_text = None
    if resume and resume.filename:
        try:
            resume_text = extract_resume_text(resume.filename, await resume.read())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if resume_text is not None:
        execute('UPDATE users SET name=?, field=?, target_location=?, target_duration=?, resume_text=? WHERE email=?', [name, field, target_location, target_duration, resume_text, email])
    else:
        execute('UPDATE users SET name=?, field=?, target_location=?, target_duration=? WHERE email=?', [name, field, target_location, target_duration, email])
    profile = get_profile(email)
    return {'ok': True, 'profile': {**profile.__dict__, 'resume_text': profile.resume_text[:250] + ('...' if len(profile.resume_text) > 250 else '')}}


@app.get('/api/profile')
def profile(token: str):
    email = email_for_token(token)
    p = get_profile(email)
    return {**p.__dict__, 'resume_text': p.resume_text[:500]}


@app.post('/api/jobs/search')
async def jobs_search(body: SearchBody):
    email = email_for_token(body.token)
    profile = get_profile(email)
    field = body.field or profile.field
    location = body.location or profile.target_location
    duration = body.duration or profile.target_duration
    jobs, errors = await search_real_jobs(body.query, location, duration, profile.resume_text, field)
    for j in jobs:
        JOB_CACHE[j.id] = j
    return {'jobs': [j.to_dict() for j in jobs[:40]], 'provider_errors': errors, 'truth_policy': 'No fake jobs are inserted. If providers fail, errors are shown.'}


@app.post('/api/jobs/save')
def save_job(body: SaveBody):
    email = email_for_token(body.token)
    status = body.status.strip().lower()
    if status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail='Invalid application status.')
    job = JOB_CACHE.get(body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found in current live search cache. Search again, then save.')
    execute(
        'INSERT OR IGNORE INTO applications(email,job_id,title,company,url,status,note) VALUES(?,?,?,?,?,?,?)',
        [email, job.id, job.title, job.company, job.url, status, body.note]
    )
    return {'ok': True}


@app.get('/api/applications')
def applications(token: str):
    email = email_for_token(token)
    rows = fetchall('SELECT * FROM applications WHERE email=? ORDER BY id DESC', [email])
    return {'applications': [dict(r) for r in rows]}


@app.post('/api/applications/status')
def update_status(body: StatusBody):
    email = email_for_token(body.token)
    status = body.status.strip().lower()
    if status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail='Invalid application status. Candidate must choose a manual stage.')
    updated = execute('UPDATE applications SET status=? WHERE id=? AND email=?', [status, body.application_id, email])
    if updated == 0:
        raise HTTPException(status_code=404, detail='Application not found.')
    return {'ok': True}


@app.delete('/api/applications/{application_id}')
def delete_application(application_id: int, token: str):
    email = email_for_token(token)
    deleted = execute('DELETE FROM applications WHERE id=? AND email=?', [application_id, email])
    if deleted == 0:
        raise HTTPException(status_code=404, detail='Application not found.')
    return {'ok': True}


@app.post('/api/generate')
def generate(body: GenerateBody):
    email = email_for_token(body.token)
    job = resolve_job_for_user(email, body.job_id)
    profile = get_profile(email)
    return generate_application_message(profile, job)


@app.post('/api/interview')
def interview(body: GenerateBody):
    email = email_for_token(body.token)
    job = resolve_job_for_user(email, body.job_id)
    return {'questions': interview_questions(get_profile(email), job), 'voice_enabled': False, 'note': 'Voice is disabled unless an ElevenLabs API key is configured. This demo does not fake voice output.'}


@app.exception_handler(Exception)
def handle_error(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail})
    return JSONResponse(status_code=500, content={'detail': f'{type(exc).__name__}: {exc}'})

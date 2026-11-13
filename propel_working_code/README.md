# Propel - working code package

Propel is a local-first job-search demo app built to avoid fake data. It searches public job APIs live, uploads a resume, scores job matches, saves applications, and creates interview questions.

## What is real vs optional

- Real job data: Remotive and Arbeitnow public APIs are used live. If they fail, the app returns an error/empty state rather than fake jobs.
- Resume data: the uploaded resume is the source of truth for matching and generated text.
- AI text: optional. If `OPENAI_API_KEY` is not set, the app uses deterministic templates and never claims it used AI.
- Voice interview: optional. If `ELEVENLABS_API_KEY` is not set, voice is disabled instead of faked.

## Quick start

```bash
cd propel_working_code
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Open: http://127.0.0.1:8000

## Run tests

```bash
pytest -q
```

## Live demo script

1. Create account or log in.
2. Upload a real resume as TXT, PDF, or DOCX.
3. Search: `Software Engineering Intern`, location `Canada`, period `30`, duration `4 months`.
4. Open one result and click the source URL.
5. Save the job.
6. Generate a truthful short application message.
7. Start interview practice and answer one question.

## Environment variables

Copy `.env.example` to `.env` if you add optional APIs. The project runs without keys.


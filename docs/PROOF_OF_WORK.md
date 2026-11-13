# Propel — Proof of Work & Verification Log

All checks below were executed cleanly **after the final code edits** across both `sites_app/` (Next.js 16 + React 19 + Vinext + Drizzle + Cloudflare Workers) and `propel_working_code/` (FastAPI + SQLite).

---

## 1. Summary Matrix

| Component | Check / Command | Exact Result |
| :--- | :--- | :--- |
| **`sites_app` Lint** | `npm run lint` (`eslint . --ignore-pattern dist --ignore-pattern .next`) | **Exit 0** — 0 errors, 0 warnings |
| **`sites_app` Typecheck** | `npx tsc --noEmit` | **Exit 0** — 0 type errors |
| **`sites_app` Production Build** | `npm run build:local` (`vinext build`, Vite `8.0.13`) | **Exit 0** — 5-phase build (`314` client refs, `50` server refs, `366` RSC, `58` client, `56` SSR modules; 10 routes) |
| **`sites_app` Test Suite** | `npm run test:local` (`node --test tests/*.test.mjs`) | **10 passed, 0 failed, 0 skipped** (`1139.88ms`) |
| **`propel_working_code` Pytest** | `.\.venv_test\Scripts\python.exe -m pytest -v` | **7 passed, 0 failed** (`2.70s`; 1 third-party Starlette `anyio.abc.BlockingPortal` warning) |
| **`propel_working_code` Live API Smoke** | `uvicorn app.main:app --host 127.0.0.1 --port 8010` (temp SQLite DB) | **Exit 0** — HTTP `200` end-to-end across signup, resume upload, live search (`10` live matches), save, status transition, draft generation, interview (`7` questions), and delete |
| **Visual Proof (`docs/images/`)** | Playwright + Matplotlib + FFmpeg | Desktop (`1440×900`), Mobile (`390×844`), FastAPI UI, architecture diagram, `.mp4` (`1.2 MB`) & `.gif` (`6.3 MB`) walkthroughs |

---

## 2. Exact `sites_app` Verification Output

Executed in `sites_app/` after final edit:

```text
> propel@0.1.0 lint
> eslint . --ignore-pattern dist --ignore-pattern .next

> propel@0.1.0 test:local
> npm run build:local && node --test tests/*.test.mjs

> propel@0.1.0 build:local
> vinext build

  vinext build  (Vite 8.0.13)

[1/5] analyze client references...
transforming...✓ 314 modules transformed.
rendering chunks...
✓ built in 2.56s
[2/5] analyze server references...
transforming...✓ 50 modules transformed.
rendering chunks...
✓ built in 127ms
[3/5] build rsc environment...
transforming...✓ 366 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 1.84s
[4/5] build client environment...
transforming...✓ 58 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 257ms
[5/5] build ssr environment...
transforming...✓ 56 modules transformed.
rendering chunks...
computing gzip size...
✓ built in 261ms

  Route (app)
  ┌ ƒ /
  ├ λ /api/careerops/generate
  ├ λ /api/documents/export
  ├ λ /api/interview
  ├ λ /api/interview/speak
  ├ λ /api/jobs/search
  ├ λ /api/profile
  ├ λ /api/resume
  ├ λ /api/system/status
  └ λ /api/workspace

  λ API  ƒ Dynamic

  Build complete. Run `vinext start` to start the production server.

✔ private API rejects anonymous access (11.1654ms)
✔ profile links automatically receive a secure scheme (0.4378ms)
✔ SSRF guard rejects non-HTTPS, localhost, and private IP URLs (0.2741ms)
✔ lead outreach has a safe response when AI JSON is incomplete (0.2586ms)
✔ capability status reports the complete production workflow (3.5605ms)
✔ invalid pipeline transitions are rejected (8.1288ms)
✔ API validation rejects insecure job URLs, invalid profile links, and bad export params (8.655ms)
✔ student filters reject senior roles and accept explicit co-op roles (0.9345ms)
✔ document engines generate valid PDF and DOCX bytes and sanitize non-WinAnsi characters (95.867ms)
✔ renders finished product metadata (252.7493ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1139.8754
```

Key implementation hardening covered by these checks:
- **Document Export Engine (`sites_app/lib/documents.ts`):** Extracted `plain()`, `createPdf()`, and `createDocx()` into a dedicated module and added smart-quote / bullet / arrow / non-WinAnsi sanitization so `pdf-lib` Helvetica encoding never throws on copied job descriptions or AI outputs.
- **SSRF & Input Validation (`sites_app/lib/leads.ts`, `sites_app/app/api/**`):** Verified rejection of non-HTTPS URLs, `localhost`, and private/link-local IP ranges before outbound fetches, plus HTTP `400` validation on malformed profile links, job URLs, pipeline transitions, and export formats.
- **Cross-Platform Tooling (`sites_app/package.json`, `sites_app/eslint.config.mjs`, `.gitattributes`):** Fixed CRLF bash script issues via `.gitattributes` (`*.sh text eol=lf`), excluded generated `.vinext/`, `.wrangler/`, `.sites-runtime/`, and `outputs/` artifacts from ESLint, and made `npm run lint` portable across Windows/Linux.

---

## 3. Exact `propel_working_code` Pytest Output

Executed in `propel_working_code/` after final edit:

```text
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.3.4, pluggy-1.7.0 -- C:\Users\issao\Downloads\portfolio\agy-work\propel\propel_working_code\.venv_test\Scripts\python.exe
cachedir: .pytest_cache
rootdir: C:\Users\issao\Downloads\portfolio\agy-work\propel\propel_working_code
configfile: pytest.ini
testpaths: tests
plugins: anyio-4.16.0
collecting ... collected 7 items

tests/test_api_smoke.py::test_signup_login_profile_and_full_pipeline_works PASSED [ 14%]
tests/test_core.py::test_txt_resume_extraction PASSED                    [ 28%]
tests/test_core.py::test_keywords_are_deterministic PASSED               [ 42%]
tests/test_core.py::test_senior_roles_are_penalized PASSED             [ 57%]
tests/test_core.py::test_filter_jobs_returns_ranked_results PASSED       [ 71%]
tests/test_core.py::test_generated_message_contains_source_evidence PASSED [ 85%]
tests/test_core.py::test_interview_questions_are_job_specific PASSED     [100%]

============================== warnings summary ===============================
.venv_test\Lib\site-packages\starlette\testclient.py:40
  C:\Users\issao\Downloads\portfolio\agy-work\propel\propel_working_code\.venv_test\Lib\site-packages\starlette\testclient.py:40: DeprecationWarning: The anyio.abc.BlockingPortal alias is deprecated, use anyio.from_thread.BlockingPortal instead.
    _PortalFactoryType = typing.Callable[[], typing.ContextManager[anyio.abc.BlockingPortal]]

======================== 7 passed, 1 warning in 2.70s =========================
```

---

## 4. Exact Live FastAPI Smoke Flow (`uvicorn` on `127.0.0.1:8010`)

Executed against a live `uvicorn app.main:app` server backed by an isolated temporary SQLite database (`PROPEL_DB` pointing outside the repo and deleted after completion):

```text
GET /: 200 2380 bytes
POST /api/signup: 200 smoke@propel.local
POST /api/profile: 200 ok: True field: Software Engineering
POST /api/jobs/search: 200 jobs: 10 provider_errors: 0
  top_job: Software Engineer, AI Coding Tasks @ Askable score: 21.0
POST /api/jobs/save: 200 {'ok': True}
GET /api/applications: 200 count: 1 app_id: 1
POST /api/applications/status: 200 {'ok': True}
POST /api/generate: 200 keys: ['cover_letter', 'evidence', 'short_message'] resume_summary_len: 0
POST /api/interview: 200 questions: 7 voice_enabled: False
DELETE /api/applications/1: 200 {'ok': True}
```

Verified fixes in `propel_working_code/`:
- Migrated FastAPI startup initialization to modern `lifespan` context manager (`app/main.py`).
- Resolved `PROPEL_DB` dynamically inside `app/database.py` and returned `rowcount` for deterministic `404` handling on missing records.
- Enforced `ALLOWED_STATUSES` validation (rejecting automated `'Auto-applied'` states with HTTP `400`) and added `DELETE /api/applications/{application_id}`.
- Replaced browser `alert()` calls with inline status UI, escaped provider errors, validated external URLs, and added stage `<select>`, `Select`, and `Remove` controls in `app/static/script.js`.

---

## 5. Visual Proof Inventory (`docs/images/`)

| Artifact | Purpose & Resolution | File Path |
| :--- | :--- | :--- |
| **System Architecture** | End-to-end Next.js/Cloudflare + FastAPI data/provider/AI pipeline diagram | [docs/images/propel-architecture.png](images/propel-architecture.png) |
| **Desktop Live UI** | `sites_app` (`1440×900`) showing 86 live verified job matches | [docs/images/propel-sites-ui.png](images/propel-sites-ui.png) |
| **Mobile Live UI** | `sites_app` (`390×844`) responsive mobile layout | [docs/images/propel-sites-mobile.png](images/propel-sites-mobile.png) |
| **FastAPI Reference UI** | Live `propel_working_code` interface with saved application, CV/cover letter, & interview prep | [docs/images/propel-fastapi-ui.png](images/propel-fastapi-ui.png) |
| **Walkthrough Video (MP4)** | Screen-recorded Playwright walkthrough (`1.2 MB`) | [docs/images/propel-walkthrough.mp4](images/propel-walkthrough.mp4) |
| **Walkthrough Preview (GIF)** | Lightweight inline README GIF preview (`6.3 MB`) | [docs/images/propel-walkthrough.gif](images/propel-walkthrough.gif) |

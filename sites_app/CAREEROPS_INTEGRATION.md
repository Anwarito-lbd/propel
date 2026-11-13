# Career-Ops integration

Current hosted integration is based on Career-Ops 1.21.0 at commit
`e8ba1a42beec3a638f34a862d238f5e42174dcb1`. The upstream repository was
cloned into `/workspace/career-ops-reference` for inspection and validation.

The production Worker ports the HTTP provider architecture for Greenhouse,
Lever, Ashby, Remotive, RemoteOK, Jobicy, and Himalayas. When
`APIFY_API_TOKEN` is configured, it also adds up to 10 recent public LinkedIn
job results per search through a pay-per-result Apify Actor. It intentionally does
not claim that the upstream CLI or its Playwright runtime runs inside the
Cloudflare Worker.

The Canada-wide search also parses the public Government of Canada Job Bank
results. Period and duration filters follow the `hours_old` and `job_type`
search concepts from https://github.com/speedyapply/JobSpy. See
`vendor/jobspy/NOTICE.md` for the exact integration boundary.

The company-board set includes Canadian or Canada-eligible boards for Faire,
TouchBistro, StackAdapt, Hootsuite, Geotab, League, Ritual, Cohere,
Wealthsimple, 1Password, KOHO, Hiive, Clearco, and PointClickCare. Title-family
matching also recognizes adjacent public titles such as software engineer,
developer, and programmer without weakening the selected date or duration.

There is no demo fallback: failed providers are reported in source-health
metadata and return zero records. Resume facts are stored in D1/R2 and Gemini
drafts require human review.

Propel uses the workflow and safety model from [`santifer/career-ops`](https://github.com/santifer/career-ops) (MIT):

- public Greenhouse, Lever and Ashby provider patterns;
- title and location filtering;
- match-first ranking and pipeline states;
- CV source-of-truth boundary: reformulate verified facts, never fabricate;
- tailored CV, contact/outreach and document workflow;
- human review before every application or message.

The hosted Worker implements the fast ATS providers and the optional Apify
provider. The included Python sidecar adds Crawl4AI for JavaScript-heavy public
pages. Applications and messages remain draft-only by design.

The mock-interview workflow uses Gemini to generate and assess five questions
from the stored resume and selected job. Sessions and coaching scores are stored
in D1. ElevenLabs provides optional server-side question narration; the API key
never reaches the browser. Browser speech recognition is used only when the
candidate explicitly starts microphone dictation.

The extended production workflow also includes:

- strict student-role filtering that requires internship, co-op, student or new-grad evidence in the title/type and excludes senior leadership titles;
- real Crawl4AI and JobSpy HTTP adapters that activate only when their server URLs are configured (failures never create fallback jobs);
- public-page lead verification that can surface an exact recruiting address only when it is present on the posting;
- a user-controlled application pipeline—nothing marks itself Applied;
- fact-safe cover letters and server-generated PDF/DOCX exports;
- an optional hands-free interview loop that speaks, records, coaches, and advances with explicit microphone permission.

# JobSpy reference

The expanded search UX and filter vocabulary were informed by the public
JobSpy project:

- Repository: https://github.com/speedyapply/JobSpy
- Python package: `python-jobspy`
- Relevant capabilities: Canadian searches, concurrent job-board aggregation,
  `hours_old`, `job_type`, remote, and result-count filters.

Propel CareerOps does not run JobSpy's Python scrapers inside the Cloudflare
Worker. The hosted app uses the Government of Canada Job Bank public search as
its broad Canada-wide provider, plus Career-Ops ATS/feed providers. A future
external JobSpy service can be connected through `JOBSPY_API_URL` without
changing the UI contract.

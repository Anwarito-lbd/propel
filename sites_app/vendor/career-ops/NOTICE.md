# Career-Ops integration

Propel CareerOps uses the provider architecture, job-normalization approach,
human-in-the-loop workflow, fact-safe CV rules, and outreach constraints from:

- Repository: https://github.com/santifer/career-ops
- Version inspected: 1.21.0
- Commit inspected: `e8ba1a42beec3a638f34a862d238f5e42174dcb1`
- License: MIT (see `LICENSE`)

The original repository was cloned and tested as the reference implementation.
The hosted application ports its HTTP-only provider logic to a Cloudflare
Worker. Playwright and local CLI orchestration are intentionally not embedded
in the Worker runtime.

Adapted concepts and source modules include `scan.mjs`, `providers/_http.mjs`,
`providers/greenhouse.mjs`, `providers/lever.mjs`, `providers/ashby.mjs`,
`providers/remotive.mjs`, `providers/remoteok.mjs`, `providers/jobicy.mjs`,
`providers/himalayas.mjs`, `modes/pdf.md`, and `modes/contacto.md`.

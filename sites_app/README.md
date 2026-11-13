# Propel

Propel is an AI-assisted career workspace for finding verified Canadian jobs,
tailoring CVs and cover letters, drafting outreach to verified public contacts,
tracking applications, and practising interviews.

## What works

- live Canadian job discovery from Job Bank, public ATS boards, remote feeds,
  and an optional pay-per-result Apify LinkedIn provider;
- resume upload and profile extraction;
- fact-safe CV, cover-letter, and outreach generation with Gemini;
- professional PDF and editable DOCX exports;
- verified public email or LinkedIn lead discovery when a posting exposes one;
- application pipeline management;
- text and optional ElevenLabs voice interview coaching;
- D1 persistence and private R2 resume storage when hosted with Sites.

Propel never inserts demo jobs when a live provider fails. Applications and
messages remain drafts for the user to review and send.

## Run locally

Prerequisites: Node.js 22.13 or newer and npm.

1. Open a terminal in this folder.
2. Install the locked dependencies:

   ```powershell
   npm ci
   ```

3. Create the local environment file.

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   macOS/Linux:

   ```bash
   cp .env.example .env.local
   ```

4. Add the keys you want to use to `.env.local`:

   ```dotenv
   GEMINI_API_KEY=your_gemini_key
   ELEVENLABS_API_KEY=your_elevenlabs_key
   APIFY_API_TOKEN=your_apify_token
   ```

   Gemini powers generated documents and interview coaching. ElevenLabs is
   optional for voice playback. Apify is optional; without it, the other live
   job providers continue to work.

5. Start Propel:

   ```powershell
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173).

Local development uses the simulated D1 and R2 bindings configured in
`vite.config.ts`. Data stays inside the local project state.

## Verify the app

The portable Windows/macOS verification command is:

```powershell
npm run test:local
```

The Sites CI environment uses:

```bash
npm test
```

Both commands build the app and run the complete Node test suite. The local
build alone is available as `npm run build:local`.

## Suggested demo flow

1. Upload a resume and confirm the extracted profile.
2. Search a role such as `software developer` and show live source health.
3. Open a verified job and save it to the pipeline.
4. Generate and download a tailored CV PDF.
5. Draft outreach and show the verified public contact or official channel.
6. Select that live job in Interview Coach and answer one question.
7. Move the opportunity through the editable pipeline.

## Security and cost notes

- `.env.local` is ignored by Git and must never be included in a submission ZIP.
- Rotate any API token that has been pasted into chat or shared publicly.
- Propel caps Apify at 10 detailed results per search. Provider failure is
  isolated, so the remaining sources still return jobs.
- Only HTTPS public job and profile links are accepted.

## Main project structure

- `app/` — UI and API routes
- `lib/` — job providers, validation, lead discovery, and domain logic
- `drizzle/` — D1 schema migrations
- `tests/` — regression and rendered-output tests
- `.openai/hosting.json` — Sites deployment configuration
- `CAREEROPS_INTEGRATION.md` — provider provenance and integration notes

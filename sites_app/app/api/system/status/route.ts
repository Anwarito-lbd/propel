import { authenticatedEmail, unauthorized } from "../../../../lib/auth";

export async function GET(request: Request) {
  if (!authenticatedEmail(request)) return unauthorized();
  return Response.json({
    liveJobs: true,
    demoData: false,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    elevenLabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    interviewCoach: true,
    handsFreeInterview: true,
    crawl4aiConfigured: Boolean(process.env.CRAWL4AI_API_URL),
    jobSpyConfigured: Boolean(process.env.JOBSPY_API_URL),
    apifyConfigured: Boolean(process.env.APIFY_API_TOKEN),
    editablePipeline: true,
    documentExports: ["pdf", "docx"],
    coverLetters: true,
    publicLeadVerification: true,
    careerOps: { version: "1.21.0", commit: "e8ba1a42beec3a638f34a862d238f5e42174dcb1" },
    resumeStorage: "R2",
    profileStorage: "D1",
  });
}

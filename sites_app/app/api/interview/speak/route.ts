import { authenticatedEmail, unauthorized } from "../../../../lib/auth";

export async function POST(request: Request) {
  const email = authenticatedEmail(request);
  if (!email) return unauthorized();
  void email;
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return Response.json({ error: "Voice coaching is not configured." }, { status: 503 });
  const body = await request.json() as { text?: string };
  const text = String(body.text ?? "").trim().slice(0, 1_200);
  if (!text) return Response.json({ error: "There is no interview question to read." }, { status: 400 });
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": key, accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.55, similarity_boost: 0.72, style: 0.08, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { detail?: { message?: string } } | null;
      throw new Error(detail?.detail?.message || `ElevenLabs returned HTTP ${response.status}.`);
    }
    return new Response(response.body, {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Voice generation failed." }, { status: 502 });
  }
}

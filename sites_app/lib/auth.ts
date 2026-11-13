export function authenticatedEmail(request: Request): string | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  const hostname = new URL(request.url).hostname.toLowerCase();
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "terminal.local";
  return process.env.NODE_ENV === "development" || localHost ? "preview@local" : null;
}

export function authenticatedName(request: Request): string {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encoded && encoding === "percent-encoded-utf-8") {
    try { return decodeURIComponent(encoded); } catch { /* use fallback */ }
  }
  return "Candidate";
}

export function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to continue." }, { status: 401 });
}

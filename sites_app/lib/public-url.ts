export function allowedPublicHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const isIpv6 = hostname.includes(":");
    if (
      url.protocol !== "https:" ||
      Boolean(url.username || url.password) ||
      Boolean(url.port && url.port !== "443") ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      isIpv6 ||
      isIpv4
    ) return null;
    return url;
  } catch {
    return null;
  }
}

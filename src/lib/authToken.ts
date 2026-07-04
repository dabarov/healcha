/**
 * Derives the session-cookie value from DASHBOARD_SECRET using Web Crypto,
 * so the same code runs in Edge middleware and Node route handlers.
 */
export async function dashboardToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`healcha:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const AUTH_COOKIE = "dash_auth";

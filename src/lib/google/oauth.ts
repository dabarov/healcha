import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireGoogleClient } from "@/lib/config";
import { nowIso } from "@/lib/dates";

/**
 * Google OAuth 2.0 for the Google Health API (the replacement for the legacy
 * Fitbit Web API — do NOT use fitbit.com auth endpoints).
 *
 * All Health API scopes are Restricted; for personal use the OAuth consent
 * screen stays in "Testing" with your account as a test user. Testing-mode
 * refresh tokens can expire, so refresh failures throw ReauthRequiredError,
 * which the dashboard surfaces as a "Reconnect Google" banner.
 */

export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.irn.readonly",
];

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class ReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

export function buildAuthUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: requireGoogleClient().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: HEALTH_SCOPES.join(" "),
    access_type: "offline",
    // Force the consent screen so Google always returns a refresh token.
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<void> {
  const client = requireGoogleClient();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth code exchange failed: ${data.error} ${data.error_description ?? ""}`);
  }
  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove the app's access at " +
        "https://myaccount.google.com/permissions and run the auth flow again.",
    );
  }
  await saveTokens(data);
}

async function saveTokens(data: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  const row = {
    id: 1,
    accessToken: data.access_token,
    accessTokenExpiresAt: expiresAt,
    scope: data.scope ?? null,
    updatedAt: nowIso(),
    ...(data.refresh_token ? { refreshTokenEnc: encrypt(data.refresh_token) } : {}),
  };
  await db()
    .insert(schema.oauthTokens)
    .values(row)
    .onConflictDoUpdate({ target: schema.oauthTokens.id, set: row });
}

// CSRF states for in-flight OAuth redirects. In-memory is fine: the server is
// local and single-user, and a restart mid-flow just means clicking again.
const pendingStates = new Map<string, number>();

export function createOauthState(): string {
  const state = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  for (const [s, at] of pendingStates) if (now - at > 10 * 60 * 1000) pendingStates.delete(s);
  pendingStates.set(state, now);
  return state;
}

export function consumeOauthState(state: string | null): boolean {
  if (!state || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

/** True once a Google account has been connected (refresh token stored). */
export async function isGoogleConnected(): Promise<boolean> {
  const rows = await db()
    .select({ id: schema.oauthTokens.id })
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.id, 1));
  return rows.length > 0;
}

/**
 * Returns a valid access token, refreshing when it expires within 5 minutes.
 * Throws ReauthRequiredError when there is no token or the refresh fails.
 */
export async function getAccessToken(): Promise<string> {
  const rows = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.id, 1));
  const t = rows[0];
  if (!t?.refreshTokenEnc) {
    throw new ReauthRequiredError("No Google account is connected yet.");
  }
  const stillValid =
    t.accessToken &&
    t.accessTokenExpiresAt &&
    new Date(t.accessTokenExpiresAt).getTime() > Date.now() + 5 * 60 * 1000;
  if (stillValid) return t.accessToken!;

  const client = requireGoogleClient();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      grant_type: "refresh_token",
      refresh_token: decrypt(t.refreshTokenEnc),
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const reason = `Token refresh failed: ${data.error ?? res.status} ${data.error_description ?? ""}`;
    throw new ReauthRequiredError(reason);
  }
  await saveTokens(data);
  return data.access_token;
}

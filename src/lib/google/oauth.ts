import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { env, APP_URL } from "@/lib/env";
import { nowIso } from "@/lib/dates";
import { sendTelegramMessage } from "@/lib/telegram/send";

/**
 * Google OAuth 2.0 for the Google Health API (the replacement for the legacy
 * Fitbit Web API — do NOT use fitbit.com auth endpoints).
 *
 * All Health API scopes are Restricted; for personal use the OAuth consent
 * screen stays in "Testing" with your account as a test user. Testing-mode
 * refresh tokens can expire, so refresh failures alert Telegram with a
 * re-auth link instead of failing silently.
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
    client_id: env("GOOGLE_CLIENT_ID"),
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
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
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

export function reauthUrl(): string {
  return `${APP_URL()}/api/auth/google/start`;
}

async function alertReauth(reason: string): Promise<void> {
  try {
    await sendTelegramMessage(
      `⚠️ <b>Google Health auth broken</b>\n${reason}\n\n` +
        `Re-authorize here:\n${reauthUrl()}\n\n` +
        `(Sync is paused until this is fixed.)`,
    );
  } catch {
    // Telegram itself failing shouldn't mask the original error.
  }
}

/**
 * Returns a valid access token, refreshing when it expires within 5 minutes.
 * On refresh failure: alerts Telegram with a re-auth link and throws
 * ReauthRequiredError.
 */
export async function getAccessToken(): Promise<string> {
  const rows = await db()
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.id, 1));
  const t = rows[0];
  if (!t?.refreshTokenEnc) {
    await alertReauth("No Google account is connected yet.");
    throw new ReauthRequiredError("No stored refresh token — run `npm run auth:google` first.");
  }
  const stillValid =
    t.accessToken &&
    t.accessTokenExpiresAt &&
    new Date(t.accessTokenExpiresAt).getTime() > Date.now() + 5 * 60 * 1000;
  if (stillValid) return t.accessToken!;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: decrypt(t.refreshTokenEnc),
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const reason = `Token refresh failed: ${data.error ?? res.status} ${data.error_description ?? ""}`;
    await alertReauth(reason);
    throw new ReauthRequiredError(reason);
  }
  await saveTokens(data);
  return data.access_token;
}

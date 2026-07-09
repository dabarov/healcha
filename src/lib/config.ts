import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

/**
 * Local app data: one directory holding the SQLite database and config.json
 * (Google OAuth client, auto-generated token-encryption key, optional env
 * defaults). Defaults to ./local/data in the repo checkout; the desktop shell
 * points it at the OS app-data dir via HEALCHA_DATA_DIR.
 *
 * Environment variables always win over config.json, so a plain .env keeps
 * working for headless use.
 */

export function dataDir(): string {
  const dir = process.env.HEALCHA_DATA_DIR || join(process.cwd(), "local", "data");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function databaseUrl(): string {
  return process.env.TURSO_DATABASE_URL || `file:${join(dataDir(), "healcha.db")}`;
}

interface AppConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  tokenEncryptionKey?: string;
  /** Extra env defaults (e.g. GEMINI_API_KEY) applied at boot when unset. */
  env?: Record<string, string>;
}

function configPath(): string {
  return join(dataDir(), "config.json");
}

function readConfig(): AppConfig {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as AppConfig;
  } catch {
    return {};
  }
}

function writeConfig(patch: Partial<AppConfig>): void {
  const next = { ...readConfig(), ...patch };
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export function googleClient(): { id: string; secret: string } | null {
  const cfg = readConfig();
  const id = process.env.GOOGLE_CLIENT_ID || cfg.googleClientId;
  const secret = process.env.GOOGLE_CLIENT_SECRET || cfg.googleClientSecret;
  return id && secret ? { id, secret } : null;
}

export function requireGoogleClient(): { id: string; secret: string } {
  const client = googleClient();
  if (!client) {
    throw new Error(
      "No Google OAuth client configured — finish the setup step in the app first.",
    );
  }
  return client;
}

export function setGoogleClient(id: string, secret: string): void {
  writeConfig({ googleClientId: id.trim(), googleClientSecret: secret.trim() });
}

/** 32-byte hex key for refresh-token encryption; generated once per data dir. */
export function tokenEncryptionKey(): string {
  const fromEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (fromEnv) return fromEnv;
  const cfg = readConfig();
  if (cfg.tokenEncryptionKey) return cfg.tokenEncryptionKey;
  const key = randomBytes(32).toString("hex");
  writeConfig({ tokenEncryptionKey: key });
  return key;
}

/** Apply config.json's `env` block as defaults for unset variables. */
export function applyConfigEnv(): void {
  const extra = readConfig().env;
  if (!extra) return;
  for (const [k, v] of Object.entries(extra)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

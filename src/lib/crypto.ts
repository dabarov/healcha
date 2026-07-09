import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { tokenEncryptionKey } from "./config";

/** AES-256-GCM encryption for the OAuth refresh token at rest. */

function key(): Buffer {
  const hex = tokenEncryptionKey();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars (openssl rand -hex 32)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  // ciphertext may be empty (empty plaintext); IV and auth tag may not
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new Error("Malformed encrypted payload");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

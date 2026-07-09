import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

const TEST_KEY = "a".repeat(64);
let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = savedKey;
});

describe("crypto", () => {
  it("round-trips a plaintext", () => {
    const payload = encrypt("refresh-token-value");
    expect(payload).not.toContain("refresh-token-value");
    expect(decrypt(payload)).toBe("refresh-token-value");
  });

  it("round-trips unicode and empty strings", () => {
    expect(decrypt(encrypt(""))).toBe("");
    expect(decrypt(encrypt("héälth✓ 数据"))).toBe("héälth✓ 数据");
  });

  it("uses a fresh IV per call (same plaintext, different ciphertext)", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const [iv, tag, ct] = encrypt("secret").split(".");
    const bytes = Buffer.from(ct, "base64");
    bytes[0] ^= 0xff;
    const tampered = `${iv}.${tag}.${bytes.toString("base64")}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const [iv, tag, ct] = encrypt("secret").split(".");
    const tagBytes = Buffer.from(tag, "base64");
    tagBytes[0] ^= 0xff;
    expect(() => decrypt(`${iv}.${tagBytes.toString("base64")}.${ct}`)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decrypt("not-a-payload")).toThrow(/malformed/i);
    expect(() => decrypt("a.b")).toThrow(/malformed/i);
  });

  it("rejects a key that is not 64 hex chars", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encrypt("x")).toThrow(/64 hex chars/);
  });

  it("cannot decrypt with a different key", () => {
    const payload = encrypt("secret");
    process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
    expect(() => decrypt(payload)).toThrow();
  });
});

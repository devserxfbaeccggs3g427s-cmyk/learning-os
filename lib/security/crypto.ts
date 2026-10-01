/**
 * AES-256-GCM helpers for encrypting sensitive values (AI provider API keys)
 * at rest. The key is derived from APP_ENCRYPTION_KEY.
 *
 * This is intentionally simple — no KMS, no rotation. Users in production
 * should rotate APP_ENCRYPTION_KEY through a separate migration.
 *
 * Server-only; do not import from client components. We avoid the
 * `server-only` package here so the file can be loaded by tsx scripts.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function deriveKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "";
  if (raw.length < 16) {
    throw new Error("APP_ENCRYPTION_KEY must be at least 16 characters");
  }
  // Derive a 32-byte key deterministically from APP_ENCRYPTION_KEY.
  return createHash("sha256").update(`learning-os:${raw}`).digest();
}

export interface EncryptedValue {
  /** Base64 IV. */
  iv: string;
  /** Base64 ciphertext (no auth tag included). */
  ciphertext: string;
  /** Base64 GCM auth tag. */
  authTag: string;
}

export function encrypt(plaintext: string): EncryptedValue {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(value: EncryptedValue): string {
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(0, value.length - visible))}${value.slice(-visible)}`;
}
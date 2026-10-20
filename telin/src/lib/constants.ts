/**
 * Shared constants (client + server).
 * Every limit here is enforced on BOTH sides: the client for UX, the server for security.
 */

export const LIFETIMES = {
  once: { label: "UNA LETTURA", short: "ONE OPENING", mode: "once", ttlMs: 7 * 24 * 60 * 60 * 1000 },
  "5m": { label: "5 MINUTI", short: "5 MINUTES", mode: "timed", ttlMs: 5 * 60 * 1000 },
  "1h": { label: "1 ORA", short: "1 HOUR", mode: "timed", ttlMs: 60 * 60 * 1000 },
  "24h": { label: "24 ORE", short: "24 HOURS", mode: "timed", ttlMs: 24 * 60 * 60 * 1000 },
} as const;

export type LifetimeKey = keyof typeof LIFETIMES;
export type DropMode = "once" | "timed";

export const LIFETIME_KEYS = Object.keys(LIFETIMES) as LifetimeKey[];

/** Max characters the user may type. */
export const MAX_MESSAGE_CHARS = 5000;

/** Plaintext is padded to a multiple of this many bytes before encryption (hides exact length). */
export const PAD_BLOCK = 256;

/** AES-GCM authentication tag length in bytes. */
export const GCM_TAG_BYTES = 16;

/** Worst case: 5000 UTF-16 units * 3 bytes (UTF-8) + 4-byte length header, padded, + tag. */
export const MAX_CIPHERTEXT_BYTES =
  Math.ceil((MAX_MESSAGE_CHARS * 3 + 4) / PAD_BLOCK) * PAD_BLOCK + GCM_TAG_BYTES;

/** Wrong secret-code attempts before the drop is destroyed. */
export const MAX_FAILED_ATTEMPTS = 5;

export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 64;

/** PBKDF2-SHA-256 iterations for the optional secret code (OWASP 2023+ recommendation). */
export const PBKDF2_ITERATIONS = 600_000;

/** Byte lengths of the cryptographic material. */
export const SECRET_BYTES = 32; // URL-fragment key material (256 bit)
export const SALT_BYTES = 16;
export const IV_BYTES = 12; // 96-bit GCM nonce
export const TOKEN_BYTES = 32; // auth token / verifier
export const ID_BYTES = 16; // 128-bit drop id

/** base64url lengths (no padding) */
export const b64uLen = (bytes: number) => Math.ceil((bytes * 4) / 3);

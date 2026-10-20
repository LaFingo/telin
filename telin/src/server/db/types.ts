import type { DropMode } from "@/lib/constants";

/**
 * A drop as stored on the server. Note what is NOT here:
 * no plaintext, no key, no code, no IP, no user agent, no account.
 *
 * "status" is implicit: a row exists => the drop is active.
 * Consumed / expired / locked drops are physically DELETED, not flagged.
 */
export interface NewDrop {
  id: string;
  ciphertext: Buffer;
  iv: Buffer;
  salt: Buffer;
  verifier: Buffer; // SHA-256(authToken)
  hasCode: boolean;
  mode: DropMode;
  createdAt: number;
  expiresAt: number;
}

export interface DropMeta {
  hasCode: boolean;
  salt: Buffer;
  mode: DropMode;
  expiresAt: number;
}

export type OpenResult =
  | { kind: "ok"; ciphertext: Buffer; iv: Buffer; mode: DropMode; expiresAt: number; hasCode: boolean }
  | { kind: "invalid"; remaining: number }
  | { kind: "locked" } // too many wrong attempts -> destroyed
  | { kind: "gone" }; // never existed, expired or already consumed (indistinguishable on purpose)

export interface DropStore {
  create(drop: NewDrop): Promise<void>;
  getMeta(id: string, now: number): Promise<DropMeta | null>;
  /** Atomically: verify token hash, release ciphertext, destroy if single-use. */
  open(id: string, tokenHash: Buffer, now: number): Promise<OpenResult>;
  /** Delete everything expired. Returns number of rows removed. */
  sweep(now: number): Promise<number>;
}

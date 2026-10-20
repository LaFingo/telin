/**
 * TELIN client-side cryptography.
 * ------------------------------------------------------------------
 * Only standard primitives from the Web Crypto API are used:
 *   - AES-256-GCM      authenticated encryption of the message
 *   - HKDF-SHA-256     key separation (encryption key vs. access token)
 *   - PBKDF2-SHA-256   stretching of the optional secret code
 *   - SHA-256          server-side verifier of the access token
 *
 * KEY MANAGEMENT
 * ------------------------------------------------------------------
 *   S      32 random bytes generated in the sender's browser.
 *          Travels ONLY inside the URL fragment (`/d/<id>#<S>`).
 *          Browsers never send the fragment in HTTP requests, so the
 *          server never sees S.
 *   code   Optional secret code chosen by the sender, shared out-of-band.
 *          Never leaves the browser in any form the server could reverse.
 *   salt   16 random bytes, stored on the server (public parameter).
 *
 *   IKM        = S                                   (standard mode)
 *              = S || PBKDF2(code, salt, 600k, 256)  (code mode)
 *   K_enc      = HKDF(IKM, salt, "telin/v1/enc")   -> AES-256-GCM key
 *   authToken  = HKDF(IKM, salt, "telin/v1/auth")  -> 32 bytes
 *   verifier   = SHA-256(authToken)                -> stored on server
 *
 * The server stores { ciphertext, iv, salt, verifier }. To get the
 * ciphertext back, a client must present `authToken`, which can only be
 * derived by someone holding S (and the code, if any). The server checks
 * SHA-256(authToken) == verifier and enforces attempt limits.
 *
 * Because the verifier depends on S (256-bit), a database leak does NOT
 * allow brute-forcing the short code offline, and does not reveal K_enc.
 *
 * HONEST LIMITS: someone who obtains BOTH the link (S) and a stolen copy of
 * the ciphertext/salt from the database could brute-force a 6-digit code
 * offline (10^6 PBKDF2 evaluations: slow but feasible). Without a database
 * leak, the code is protected by the server's 5-attempt limit.
 */

import {
  GCM_TAG_BYTES,
  IV_BYTES,
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  PAD_BLOCK,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  SECRET_BYTES,
} from "./constants";
import { type Bytes, concat, randomBytes, utf8 } from "./encoding";

const subtle = () => globalThis.crypto.subtle;

/** Normalise a code so that "739 281" and "739281" (or full-width digits) are equal. Case-insensitive. */
export function normalizeCode(code: string): string {
  return code.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function isValidCode(code: string): boolean {
  const n = normalizeCode(code);
  return n.length >= MIN_CODE_LENGTH && n.length <= MAX_CODE_LENGTH;
}

/** Uniformly random 6-digit code (rejection sampling, no modulo bias). */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1_000_000).padStart(6, "0");
  }
}

/** Additional authenticated data: binds the ciphertext to the format version and mode. */
function aad(hasCode: boolean): Bytes {
  return utf8(`telin/v1|code=${hasCode ? 1 : 0}`);
}

export interface DerivedKeys {
  encKey: CryptoKey;
  authToken: Bytes;
}

export async function deriveKeys(secret: Bytes, salt: Bytes, code?: string): Promise<DerivedKeys> {
  if (secret.length !== SECRET_BYTES) throw new Error("invalid secret");
  if (salt.length !== SALT_BYTES) throw new Error("invalid salt");

  let ikm: Bytes = secret;
  if (code !== undefined) {
    const pw = await subtle().importKey("raw", utf8(normalizeCode(code)), "PBKDF2", false, ["deriveBits"]);
    const stretched = new Uint8Array(
      await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, pw, 256),
    );
    ikm = concat(secret, stretched);
  }

  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveKey", "deriveBits"]);
  const encKey = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8("telin/v1/enc") },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  const authToken = new Uint8Array(
    await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8("telin/v1/auth") }, base, 256),
  );
  return { encKey, authToken };
}

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle().digest("SHA-256", data));
}

/** [4-byte big-endian length][utf8 bytes][zero padding] -> multiple of PAD_BLOCK. */
export function pad(text: string): Bytes {
  const body = utf8(text);
  const total = Math.ceil((body.length + 4) / PAD_BLOCK) * PAD_BLOCK;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

export function unpad(data: Uint8Array): string {
  if (data.length < 4) throw new Error("invalid payload");
  const len = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
  if (len > data.length - 4) throw new Error("invalid payload");
  return new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(4, 4 + len));
}

export interface SealedDrop {
  secret: Bytes; // goes in the URL fragment, NEVER to the server
  salt: Bytes;
  iv: Bytes;
  ciphertext: Bytes;
  verifier: Bytes;
  hasCode: boolean;
}

/** Encrypt a message entirely in the browser. */
export async function sealDrop(message: string, code?: string): Promise<SealedDrop> {
  const hasCode = code !== undefined;
  if (hasCode && !isValidCode(code)) throw new Error("invalid code");

  const secret = randomBytes(SECRET_BYTES);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);

  const { encKey, authToken } = await deriveKeys(secret, salt, code);
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: aad(hasCode), tagLength: GCM_TAG_BYTES * 8 },
      encKey,
      pad(message),
    ),
  );
  const verifier = await sha256(authToken);
  return { secret, salt, iv, ciphertext, verifier, hasCode };
}

/** Decrypt a ciphertext returned by the server. Throws if the key is wrong or data was tampered with. */
export async function openSealed(
  encKey: CryptoKey,
  iv: Bytes,
  ciphertext: Bytes,
  hasCode: boolean,
): Promise<string> {
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv, additionalData: aad(hasCode), tagLength: GCM_TAG_BYTES * 8 },
    encKey,
    ciphertext,
  );
  return unpad(new Uint8Array(plain));
}

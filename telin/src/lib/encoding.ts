/** base64url (RFC 4648 §5, no padding) helpers that work in browsers and Node. */

export type Bytes = Uint8Array<ArrayBuffer>;

export function toB64u(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const B64U_RE = /^[A-Za-z0-9_-]*$/;

export function fromB64u(str: string): Bytes {
  if (!B64U_RE.test(str) || str.length % 4 === 1) throw new Error("invalid base64url");
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8(text: string): Bytes {
  const enc = new TextEncoder().encode(text);
  const out = new Uint8Array(enc.length);
  out.set(enc);
  return out;
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function randomBytes(n: number): Bytes {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

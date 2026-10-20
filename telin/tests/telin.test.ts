/**
 * TELIN test suite. Run against a running server:
 *   npm run dev          (in another terminal)
 *   npm test             (BASE_URL defaults to http://localhost:3000)
 *
 * Uses the REAL client crypto module, exactly like the browser does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKeys, generateCode, openSealed, pad, sealDrop, unpad } from "../src/lib/crypto";
import { fromB64u, randomBytes, toB64u } from "../src/lib/encoding";
import { MAX_FAILED_ATTEMPTS, PAD_BLOCK } from "../src/lib/constants";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const H = { "Content-Type": "application/json", Origin: BASE };

async function create(message: string, opts: { code?: string; lifetime?: string } = {}) {
  const s = await sealDrop(message, opts.code);
  const res = await fetch(`${BASE}/api/drops`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      ciphertext: toB64u(s.ciphertext),
      iv: toB64u(s.iv),
      salt: toB64u(s.salt),
      verifier: toB64u(s.verifier),
      hasCode: s.hasCode,
      lifetime: opts.lifetime ?? "once",
    }),
  });
  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: string };
  return { id, secret: s.secret };
}

async function openWith(id: string, secret: Uint8Array<ArrayBuffer>, code?: string) {
  const meta = await fetch(`${BASE}/api/drops/${id}`);
  if (meta.status !== 200) return { status: meta.status } as const;
  const m = (await meta.json()) as { salt: string; hasCode: boolean };
  const { encKey, authToken } = await deriveKeys(secret, fromB64u(m.salt), m.hasCode ? (code ?? "") : undefined);
  const res = await fetch(`${BASE}/api/drops/${id}/open`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ authToken: toB64u(authToken) }),
  });
  const body = await res.json();
  if (res.status !== 200) return { status: res.status, body } as const;
  const text = await openSealed(encKey, fromB64u(body.iv), fromB64u(body.ciphertext), body.hasCode);
  return { status: 200, text } as const;
}

// ───────────── crypto (offline) ─────────────

test("padding hides length and round-trips unicode", () => {
  for (const msg of ["", "ciao", "é😀漢字", "x".repeat(1000)]) {
    const p = pad(msg);
    assert.equal(p.length % PAD_BLOCK, 0);
    assert.equal(unpad(p), msg);
  }
  assert.equal(pad("a").length, pad("a".repeat(200)).length);
});

test("generated codes are 6 digits", () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{6}$/);
});

test("wrong key fails authentication (GCM integrity)", async () => {
  const s = await sealDrop("segreto");
  const wrong = await deriveKeys(randomBytes(32), s.salt);
  await assert.rejects(openSealed(wrong.encKey, s.iv, s.ciphertext, false));
  const right = await deriveKeys(s.secret, s.salt);
  assert.equal(await openSealed(right.encKey, s.iv, s.ciphertext, false), "segreto");
  // AAD binding: flipping the code flag breaks decryption
  await assert.rejects(openSealed(right.encKey, s.iv, s.ciphertext, true));
});

// ───────────── API (online) ─────────────

test("single-use drop: opens once, then DROP EMPTY", async () => {
  const { id, secret } = await create("Ci vediamo alle 20:00 davanti al cinema.");
  const first = await openWith(id, secret);
  assert.equal(first.status, 200);
  assert.equal(first.status === 200 && first.text, "Ci vediamo alle 20:00 davanti al cinema.");
  const second = await openWith(id, secret);
  assert.equal(second.status, 404);
});

test("concurrent opens of a single-use drop: exactly one succeeds", async () => {
  const { id, secret } = await create("race");
  const results = await Promise.all(Array.from({ length: 6 }, () => openWith(id, secret)));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test("timed drop can be opened multiple times", async () => {
  const { id, secret } = await create("timed", { lifetime: "5m" });
  assert.equal((await openWith(id, secret)).status, 200);
  assert.equal((await openWith(id, secret)).status, 200);
});

test("knowing only the ID is not enough (cannot read or burn)", async () => {
  const { id, secret } = await create("id only");
  const fake = await openWith(id, randomBytes(32));
  assert.equal(fake.status, 403);
  const real = await openWith(id, secret);
  assert.equal(real.status, 200);
});

test("secret code: wrong code is rejected, right code opens", async () => {
  const { id, secret } = await create("with code", { code: "739281" });
  const bad = await openWith(id, secret, "000000");
  assert.equal(bad.status, 403);
  assert.equal(bad.status === 403 && bad.body.remaining, MAX_FAILED_ATTEMPTS - 1);
  const good = await openWith(id, secret, "739 281"); // normalisation
  assert.equal(good.status, 200);
});

test(`secret code: ${MAX_FAILED_ATTEMPTS} wrong attempts destroy the drop`, async () => {
  const { id, secret } = await create("brute", { code: "123456" });
  let last;
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) last = await openWith(id, secret, `99999${i}`);
  assert.equal(last?.status, 410);
  assert.equal((await openWith(id, secret, "123456")).status, 404);
});

test("server rejects malformed / unpadded / cross-origin input", async () => {
  const post = (body: unknown, headers = H) =>
    fetch(`${BASE}/api/drops`, { method: "POST", headers, body: JSON.stringify(body) }).then((r) => r.status);
  const s = await sealDrop("x");
  const ok = {
    ciphertext: toB64u(s.ciphertext),
    iv: toB64u(s.iv),
    salt: toB64u(s.salt),
    verifier: toB64u(s.verifier),
    hasCode: false,
    lifetime: "once",
  };
  assert.equal(await post({ ...ok, lifetime: "forever" }), 400);
  assert.equal(await post({ ...ok, iv: "abc" }), 400);
  assert.equal(await post({ ...ok, ciphertext: toB64u(randomBytes(100)) }), 400); // not padded
  assert.equal(await post({ ...ok, message: "plaintext" , ciphertext: undefined }), 400);
  assert.equal(await post(ok, { ...H, Origin: "https://evil.example" }), 403);
});

test("unknown and malformed IDs get the same generic answer", async () => {
  const a = await fetch(`${BASE}/api/drops/${toB64u(randomBytes(16))}`);
  const b = await fetch(`${BASE}/api/drops/..%2F..%2Fetc`);
  assert.equal(a.status, 404);
  assert.equal(b.status, 404);
  assert.deepEqual(await a.json(), await b.json());
});

test("API responses carry security headers", async () => {
  const res = await fetch(`${BASE}/api/drops/${toB64u(randomBytes(16))}`);
  assert.equal(res.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.ok(res.headers.get("content-security-policy")?.includes("default-src 'none'"));
  const page = await fetch(`${BASE}/`);
  assert.ok(page.headers.get("content-security-policy")?.includes("nonce-"));
  assert.equal(page.headers.get("x-frame-options"), "DENY");
});

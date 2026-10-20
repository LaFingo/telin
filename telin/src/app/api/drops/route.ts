import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  GCM_TAG_BYTES,
  ID_BYTES,
  IV_BYTES,
  LIFETIME_KEYS,
  LIFETIMES,
  MAX_CIPHERTEXT_BYTES,
  PAD_BLOCK,
  SALT_BYTES,
  TOKEN_BYTES,
  type LifetimeKey,
} from "@/lib/constants";
import { getStore } from "@/server/db";
import { b64uField, isSameOrigin, json, limit, readJson } from "@/server/http";

/**
 * POST /api/drops — store an already-encrypted drop.
 * Body: { ciphertext, iv, salt, verifier, hasCode, lifetime }
 * The server never receives the plaintext, the key (URL fragment) or the code.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return json({ error: "forbidden" }, 403);
    const limited = await limit(req, "create");
    if (limited) return limited;

    const body = await readJson(req, Math.ceil(MAX_CIPHERTEXT_BYTES * 1.4) + 1024);
    if (!body) return json({ error: "bad_request" }, 400);

    const ciphertext = b64uField(body.ciphertext, { min: PAD_BLOCK + GCM_TAG_BYTES, max: MAX_CIPHERTEXT_BYTES });
    const iv = b64uField(body.iv, { exact: IV_BYTES });
    const salt = b64uField(body.salt, { exact: SALT_BYTES });
    const verifier = b64uField(body.verifier, { exact: TOKEN_BYTES });
    const hasCode = body.hasCode;
    const lifetime = body.lifetime as LifetimeKey;

    if (
      !ciphertext ||
      !iv ||
      !salt ||
      !verifier ||
      typeof hasCode !== "boolean" ||
      !LIFETIME_KEYS.includes(lifetime) ||
      // enforce padding: length must be N*PAD_BLOCK + tag
      (ciphertext.length - GCM_TAG_BYTES) % PAD_BLOCK !== 0
    ) {
      return json({ error: "bad_request" }, 400);
    }

    const now = Date.now();
    const cfg = LIFETIMES[lifetime];
    const id = randomBytes(ID_BYTES).toString("base64url"); // 128-bit, unguessable
    const expiresAt = now + cfg.ttlMs;

    const store = await getStore();
    await store.create({ id, ciphertext, iv, salt, verifier, hasCode, mode: cfg.mode, createdAt: now, expiresAt });

    return json({ id, expiresAt }, 201);
  } catch (err) {
    console.error("[POST /api/drops] Error:", err);
    return json({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
}

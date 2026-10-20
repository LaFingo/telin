import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { TOKEN_BYTES } from "@/lib/constants";
import { getStore } from "@/server/db";
import { b64uField, ID_RE, isSameOrigin, json, limit, readJson, unavailable } from "@/server/http";

/**
 * POST /api/drops/:id/open — Body: { authToken }
 * The server hashes the token and compares it (constant time) with the stored
 * verifier. On success it returns the ciphertext and, for single-use drops,
 * deletes the row in the same transaction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return json({ error: "forbidden" }, 403);
  const limited = await limit(req, "open");
  if (limited) return limited;

  const { id } = await params;
  if (!ID_RE.test(id)) return unavailable();

  const body = await readJson(req, 256);
  const token = body && b64uField(body.authToken, { exact: TOKEN_BYTES });
  if (!token) return json({ error: "bad_request" }, 400);

  const tokenHash = createHash("sha256").update(token).digest();
  const result = await (await getStore()).open(id, tokenHash, Date.now());

  switch (result.kind) {
    case "ok":
      return json({
        ciphertext: result.ciphertext.toString("base64url"),
        iv: result.iv.toString("base64url"),
        mode: result.mode,
        expiresAt: result.expiresAt,
        hasCode: result.hasCode,
      });
    case "invalid":
      return json({ error: "invalid", remaining: result.remaining }, 403);
    case "locked":
      return json({ error: "locked" }, 410);
    default:
      return unavailable();
  }
}

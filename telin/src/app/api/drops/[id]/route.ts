import type { NextRequest } from "next/server";
import { getStore } from "@/server/db";
import { ID_RE, json, limit, unavailable } from "@/server/http";

/**
 * GET /api/drops/:id — public metadata needed to open the drop.
 * Does NOT return the ciphertext and does NOT consume anything, so link
 * previews (WhatsApp, Telegram, ...) can never burn a drop.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await limit(req, "meta");
  if (limited) return limited;

  const { id } = await params;
  if (!ID_RE.test(id)) return unavailable();

  const meta = await (await getStore()).getMeta(id, Date.now());
  if (!meta) return unavailable();

  return json({
    hasCode: meta.hasCode,
    salt: meta.salt.toString("base64url"),
    mode: meta.mode,
    expiresAt: meta.expiresAt,
  });
}

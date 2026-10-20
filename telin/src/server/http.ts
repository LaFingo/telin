import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { anonymize, rateLimit, type RuleName } from "./ratelimit";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

/** One generic answer for "doesn't exist / expired / consumed" -> no enumeration oracle. */
export const unavailable = () => json({ error: "unavailable" }, 404);

/**
 * CSRF defence-in-depth. There are no cookies or sessions, so there is no ambient
 * authority to abuse; still, state-changing requests must be same-origin JSON.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous, non-reversible client key for rate limiting.
 * Behind a reverse proxy, make sure it OVERWRITES X-Forwarded-For.
 */
function clientKey(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return anonymize(ip);
}

export async function limit(req: NextRequest, rule: RuleName) {
  const r = await rateLimit(rule, clientKey(req));
  if (r.ok) return null;
  return json({ error: "rate_limited" }, 429, { "Retry-After": String(r.retryAfterSec) });
}

/** Strict base64url decoding with exact/maximum length checks. */
export function b64uField(v: unknown, opts: { exact?: number; max?: number; min?: number }): Buffer | null {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]+$/.test(v)) return null;
  const buf = Buffer.from(v, "base64url");
  if (buf.toString("base64url") !== v) return null; // non-canonical
  if (opts.exact !== undefined && buf.length !== opts.exact) return null;
  if (opts.max !== undefined && buf.length > opts.max) return null;
  if (opts.min !== undefined && buf.length < opts.min) return null;
  return buf;
}

export const ID_RE = /^[A-Za-z0-9_-]{22}$/;

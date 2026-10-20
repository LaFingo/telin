import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Rate limiting with privacy:
 * - The client IP is never stored. It is HMAC'd with a random in-memory pepper
 *   that rotates every 24h, so keys cannot be reversed or linked across days.
 * - Memory backend by default (single instance). Set REDIS_URL for multi-instance.
 */

export const RULES = {
  create: { limit: 15, windowMs: 10 * 60_000 },
  meta: { limit: 60, windowMs: 60_000 },
  open: { limit: 20, windowMs: 10 * 60_000 },
} as const;
export type RuleName = keyof typeof RULES;

export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

interface Limiter {
  hit(key: string, windowMs: number, limit: number): Promise<LimitResult>;
}

const g = globalThis as unknown as {
  __telinPepper?: { value: Buffer; rotatesAt: number };
  __telinLimiter?: Promise<Limiter>;
};

function pepper(): Buffer {
  const now = Date.now();
  if (!g.__telinPepper || g.__telinPepper.rotatesAt <= now) {
    g.__telinPepper = { value: randomBytes(32), rotatesAt: now + 24 * 60 * 60_000 };
  }
  return g.__telinPepper.value;
}

export function anonymize(ip: string): string {
  return createHmac("sha256", pepper()).update(ip).digest("base64url").slice(0, 22);
}

function memoryLimiter(): Limiter {
  const buckets = new Map<string, { count: number; reset: number }>();
  return {
    async hit(key, windowMs, limit) {
      const now = Date.now();
      if (buckets.size > 50_000) {
        for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
      }
      let b = buckets.get(key);
      if (!b || b.reset <= now) {
        b = { count: 0, reset: now + windowMs };
        buckets.set(key, b);
      }
      b.count++;
      return { ok: b.count <= limit, retryAfterSec: Math.ceil((b.reset - now) / 1000) };
    },
  };
}

async function redisLimiter(url: string): Promise<Limiter> {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return {
    async hit(key, windowMs, limit) {
      const k = `telin:rl:${key}`;
      const res = await redis.multi().incr(k).pexpire(k, windowMs, "NX").pttl(k).exec();
      const count = Number(res?.[0]?.[1] ?? 0);
      const ttl = Number(res?.[2]?.[1] ?? windowMs);
      return { ok: count <= limit, retryAfterSec: Math.ceil(Math.max(ttl, 0) / 1000) };
    },
  };
}

function getLimiter(): Promise<Limiter> {
  g.__telinLimiter ??= process.env.REDIS_URL ? redisLimiter(process.env.REDIS_URL) : Promise.resolve(memoryLimiter());
  return g.__telinLimiter;
}

export async function rateLimit(rule: RuleName, clientKey: string): Promise<LimitResult> {
  const { limit, windowMs } = RULES[rule];
  try {
    return await (await getLimiter()).hit(`${rule}:${clientKey}`, windowMs, limit);
  } catch {
    // Fail closed if the limiter backend is unavailable.
    return { ok: false, retryAfterSec: 30 };
  }
}

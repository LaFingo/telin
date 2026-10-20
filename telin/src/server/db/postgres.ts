import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { MAX_FAILED_ATTEMPTS, type DropMode } from "@/lib/constants";
import type { DropMeta, DropStore, NewDrop, OpenResult } from "./types";

/**
 * PostgreSQL store, enabled by setting DATABASE_URL.
 * Note: Postgres keeps deleted tuples on disk until VACUUM; keep autovacuum
 * enabled (default). Physical erasure cannot be guaranteed by the application.
 */
export function createPostgresStore(url: string): DropStore {
  const pool = new Pool({ connectionString: url, max: 10 });

  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS drops (
      id              TEXT PRIMARY KEY,
      ciphertext      BYTEA   NOT NULL,
      iv              BYTEA   NOT NULL,
      salt            BYTEA   NOT NULL,
      verifier        BYTEA   NOT NULL,
      has_code        BOOLEAN NOT NULL,
      mode            TEXT    NOT NULL CHECK (mode IN ('once','timed')),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      created_at      BIGINT  NOT NULL,
      expires_at      BIGINT  NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drops_expires_at ON drops (expires_at);
  `);

  return {
    async create(d: NewDrop) {
      await ready;
      await pool.query(
        `INSERT INTO drops (id, ciphertext, iv, salt, verifier, has_code, mode, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [d.id, d.ciphertext, d.iv, d.salt, d.verifier, d.hasCode, d.mode, d.createdAt, d.expiresAt],
      );
    },

    async getMeta(id, now): Promise<DropMeta | null> {
      await ready;
      const { rows } = await pool.query(
        `SELECT has_code, salt, mode, expires_at FROM drops WHERE id = $1 AND expires_at > $2`,
        [id, now],
      );
      const r = rows[0];
      if (!r) return null;
      return { hasCode: r.has_code, salt: r.salt, mode: r.mode as DropMode, expiresAt: Number(r.expires_at) };
    },

    async open(id, tokenHash, now): Promise<OpenResult> {
      await ready;
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        // Row lock: concurrent opens are serialized; only one can consume a single-use drop.
        const { rows } = await c.query(`SELECT * FROM drops WHERE id = $1 FOR UPDATE`, [id]);
        const r = rows[0];
        let result: OpenResult;
        if (!r) {
          result = { kind: "gone" };
        } else if (Number(r.expires_at) <= now) {
          await c.query(`DELETE FROM drops WHERE id = $1`, [id]);
          result = { kind: "gone" };
        } else {
          const stored: Buffer = r.verifier;
          const ok = stored.length === tokenHash.length && timingSafeEqual(stored, tokenHash);
          if (!ok) {
            const failed = r.failed_attempts + 1;
            if (failed >= MAX_FAILED_ATTEMPTS) {
              await c.query(`DELETE FROM drops WHERE id = $1`, [id]);
              result = { kind: "locked" };
            } else {
              await c.query(`UPDATE drops SET failed_attempts = $1 WHERE id = $2`, [failed, id]);
              result = { kind: "invalid", remaining: MAX_FAILED_ATTEMPTS - failed };
            }
          } else {
            result = {
              kind: "ok",
              ciphertext: r.ciphertext,
              iv: r.iv,
              mode: r.mode,
              expiresAt: Number(r.expires_at),
              hasCode: r.has_code,
            };
            if (r.mode === "once") await c.query(`DELETE FROM drops WHERE id = $1`, [id]);
          }
        }
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },

    async sweep(now) {
      await ready;
      const res = await pool.query(`DELETE FROM drops WHERE expires_at <= $1`, [now]);
      return res.rowCount ?? 0;
    },
  };
}

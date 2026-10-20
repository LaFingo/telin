import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { timingSafeEqual } from "node:crypto";
import { MAX_FAILED_ATTEMPTS, type DropMode } from "@/lib/constants";
import type { DropMeta, DropStore, NewDrop, OpenResult } from "./types";

interface Row {
  id: string;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  verifier: Uint8Array;
  has_code: number;
  mode: DropMode;
  failed_attempts: number;
  expires_at: number;
}

/**
 * Zero-setup SQLite store (Node's built-in `node:sqlite`).
 * - secure_delete=ON overwrites deleted rows with zeros inside the DB file.
 * - The WAL is truncated after every sweep so deleted pages do not linger there.
 * Physical erasure on SSDs/filesystems cannot be guaranteed by any application.
 */
export function createSqliteStore(
  file = process.env.SQLITE_PATH ??
    (process.env.VERCEL ? path.join("/tmp", "telin.db") : path.join(process.cwd(), "data", "telin.db")),
): DropStore {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA secure_delete = ON;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS drops (
      id              TEXT PRIMARY KEY,
      ciphertext      BLOB    NOT NULL,
      iv              BLOB    NOT NULL,
      salt            BLOB    NOT NULL,
      verifier        BLOB    NOT NULL,
      has_code        INTEGER NOT NULL,
      mode            TEXT    NOT NULL CHECK (mode IN ('once','timed')),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS drops_expires_at ON drops (expires_at);
  `);

  const insert = db.prepare(
    `INSERT INTO drops (id, ciphertext, iv, salt, verifier, has_code, mode, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectMeta = db.prepare(`SELECT has_code, salt, mode, expires_at FROM drops WHERE id = ? AND expires_at > ?`);
  const selectFull = db.prepare(`SELECT * FROM drops WHERE id = ?`);
  const del = db.prepare(`DELETE FROM drops WHERE id = ?`);
  const bump = db.prepare(`UPDATE drops SET failed_attempts = ? WHERE id = ?`);
  const sweepStmt = db.prepare(`DELETE FROM drops WHERE expires_at <= ?`);

  return {
    async create(d: NewDrop) {
      insert.run(d.id, d.ciphertext, d.iv, d.salt, d.verifier, d.hasCode ? 1 : 0, d.mode, d.createdAt, d.expiresAt);
    },

    async getMeta(id, now): Promise<DropMeta | null> {
      const r = selectMeta.get(id, now) as Pick<Row, "has_code" | "salt" | "mode" | "expires_at"> | undefined;
      if (!r) return null;
      return { hasCode: r.has_code === 1, salt: Buffer.from(r.salt), mode: r.mode, expiresAt: r.expires_at };
    },

    async open(id, tokenHash, now): Promise<OpenResult> {
      // BEGIN IMMEDIATE takes the write lock up-front: two concurrent opens
      // of a single-use drop can never both succeed.
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = selectFull.get(id) as Row | undefined;
        let result: OpenResult;
        if (!r) {
          result = { kind: "gone" };
        } else if (r.expires_at <= now) {
          del.run(id);
          result = { kind: "gone" };
        } else {
          const stored = Buffer.from(r.verifier);
          const ok = stored.length === tokenHash.length && timingSafeEqual(stored, tokenHash);
          if (!ok) {
            const failed = r.failed_attempts + 1;
            if (failed >= MAX_FAILED_ATTEMPTS) {
              del.run(id);
              result = { kind: "locked" };
            } else {
              bump.run(failed, id);
              result = { kind: "invalid", remaining: MAX_FAILED_ATTEMPTS - failed };
            }
          } else {
            result = {
              kind: "ok",
              ciphertext: Buffer.from(r.ciphertext),
              iv: Buffer.from(r.iv),
              mode: r.mode,
              expiresAt: r.expires_at,
              hasCode: r.has_code === 1,
            };
            if (r.mode === "once") del.run(id); // burn after reading
          }
        }
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },

    async sweep(now) {
      const res = sweepStmt.run(now);
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return Number(res.changes);
    },
  };
}

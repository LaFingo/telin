import "server-only";
import type { DropStore } from "./types";

const SWEEP_INTERVAL_MS = 60_000;

const g = globalThis as unknown as { __telinStore?: Promise<DropStore>; __telinSweeper?: NodeJS.Timeout };

function getPostgresUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASES_POSTGRES_URL ||
    process.env.DATABASES_DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED
  );
}

async function init(): Promise<DropStore> {
  let store: DropStore;
  const dbUrl = getPostgresUrl();
  if (dbUrl) {
    const { createPostgresStore } = await import("./postgres");
    store = createPostgresStore(dbUrl);
  } else {
    const { createSqliteStore } = await import("./sqlite");
    store = createSqliteStore();
  }

  // Automatic cleanup of expired drops. Expired rows are also rejected/deleted
  // lazily on access, so correctness never depends on this timer.
  if (!g.__telinSweeper) {
    const run = () => store.sweep(Date.now()).catch(() => {});
    run();
    g.__telinSweeper = setInterval(run, SWEEP_INTERVAL_MS);
    g.__telinSweeper.unref?.();
  }
  return store;
}

/** Process-wide singleton (survives dev hot reloads). */
export function getStore(): Promise<DropStore> {
  g.__telinStore ??= init();
  return g.__telinStore;
}

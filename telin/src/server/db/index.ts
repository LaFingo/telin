import "server-only";
import type { DropStore } from "./types";

const SWEEP_INTERVAL_MS = 60_000;

const g = globalThis as unknown as { __telinStore?: Promise<DropStore>; __telinSweeper?: NodeJS.Timeout };

async function init(): Promise<DropStore> {
  let store: DropStore;
  if (process.env.DATABASE_URL) {
    const { createPostgresStore } = await import("./postgres");
    store = createPostgresStore(process.env.DATABASE_URL);
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

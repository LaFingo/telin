"use client";

import { useCallback, useRef, useState } from "react";

export type Tone = "plain" | "dim" | "ok" | "warn" | "err";
export interface TermLine {
  id: number;
  text: string;
  tone: Tone;
  bar?: number; // 0..100
}

const BAR_CELLS = 16;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Tiny imperative engine for terminal-style sequences.
 * `bar(minMs, work)` never reaches 100% before `work` resolves, so the animation
 * reflects real cryptographic / network work instead of faking it.
 */
export function useTerminal() {
  const [lines, setLines] = useState<TermLine[]>([]);
  const nextId = useRef(0);

  const sleep = useCallback(
    (ms: number) => new Promise<void>((r) => setTimeout(r, prefersReducedMotion() ? Math.min(ms, 50) : ms)),
    [],
  );

  const print = useCallback(
    async (text: string, tone: Tone = "plain", hold = 280) => {
      const id = ++nextId.current;
      setLines((l) => [...l, { id, text, tone }]);
      await sleep(hold);
    },
    [sleep],
  );

  const bar = useCallback(
    async (minMs = 700, work?: Promise<unknown>) => {
      const id = ++nextId.current;
      setLines((l) => [...l, { id, text: "", tone: "ok", bar: 0 }]);
      let done = !work;
      work?.then(
        () => (done = true),
        () => (done = true),
      );
      const duration = prefersReducedMotion() ? 50 : minMs;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - start) / duration);
          const eased = 1 - Math.pow(1 - t, 2);
          const pct = Math.round((done ? eased : Math.min(eased, 0.9)) * 100);
          setLines((l) => l.map((x) => (x.id === id ? { ...x, bar: pct } : x)));
          if (pct >= 100) resolve();
          else setTimeout(tick, 32);
        };
        tick();
      });
      await sleep(140);
    },
    [sleep],
  );

  const reset = useCallback(() => setLines([]), []);
  return { lines, print, bar, sleep, reset };
}

const toneClass: Record<Tone, string> = {
  plain: "text-fg/90",
  dim: "text-mute",
  ok: "glow-text",
  warn: "text-amber",
  err: "text-danger",
};

export function Terminal({ lines, title = "telin://secure-channel" }: { lines: TermLine[]; title?: string }) {
  return (
    <div className="panel corners w-full overflow-hidden" role="status" aria-live="polite">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2 rounded-full bg-faint" />
          <span className="size-2 rounded-full bg-faint" />
          <span className="size-2 rounded-full bg-neon/70" />
        </div>
        <span className="font-mono text-[10px] tracking-[0.2em] text-faint">{title}</span>
      </div>
      <div className="min-h-[260px] space-y-2 p-5 font-mono text-[12.5px] leading-relaxed sm:p-6 sm:text-[13px]">
        {lines.map((l, i) => {
          const last = i === lines.length - 1;
          if (l.bar !== undefined) {
            const filled = Math.round((l.bar / 100) * BAR_CELLS);
            return (
              <div key={l.id} className="flex items-center gap-3 text-neon">
                <span className="tracking-[-0.05em]">
                  {"█".repeat(filled)}
                  <span className="text-faint">{"░".repeat(BAR_CELLS - filled)}</span>
                </span>
                <span className="w-10 text-right tabular-nums text-neon-dim">{l.bar}%</span>
              </div>
            );
          }
          return (
            <div key={l.id} className={`animate-rise ${toneClass[l.tone]} ${last ? "caret" : ""}`}>
              {l.text && <span className="mr-2 text-faint">{">"}</span>}
              {l.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

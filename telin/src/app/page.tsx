import Link from "next/link";
import { LockIcon } from "@/components/icons";

const STATUS = [
  ["encryption", "ACTIVE · AES-256-GCM"],
  ["keys", "CLIENT-SIDE ONLY"],
  ["storage", "ENCRYPTED"],
  ["tracking", "MINIMAL"],
  ["message lifetime", "TEMPORARY"],
] as const;

const FLOW = ["SCRIVI", "PROTEGGI", "CONDIVIDI", "LEGGI", "SCOMPARE"];

export default function Home() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:py-16">
      {/* Icona lucchetto perfettamente proporzionata */}
      <div className="animate-rise relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-strong bg-neon/[0.06] text-neon shadow-[0_0_32px_-6px_rgba(61,255,154,0.45)]">
        <LockIcon width={26} height={26} />
      </div>

      <p className="label animate-rise delay-1 mb-3 !text-neon">PRIVATE DROP</p>

      <h1 className="animate-rise delay-2 text-balance text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
        Messaggi che <span className="glow-text">non restano.</span>
      </h1>

      <p className="animate-rise delay-3 mt-5 max-w-md text-[15px] leading-relaxed text-mute sm:text-base">
        Scrivi qualcosa. Proteggilo. Condividilo.
        <br />
        <span className="font-medium text-fg">Lascialo scomparire.</span>
      </p>

      <div className="animate-rise delay-4 mt-8 flex w-full justify-center">
        <Link href="/new" id="cta-create" className="btn btn-primary w-full max-w-xs sm:w-auto">
          <span className="text-base leading-none font-bold">+</span> Crea messaggio privato
        </Link>
      </div>

      <div className="animate-rise delay-5 mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 font-mono text-[11px] tracking-[0.2em] text-mute">
        <span>NO ACCOUNT</span>
        <span className="text-faint">/</span>
        <span>NO CRONOLOGIA</span>
        <span className="text-faint">/</span>
        <span>ZERO MESSAGGI IN CHIARO</span>
      </div>

      {/* Terminal status box */}
      <div className="animate-rise delay-6 mt-10 w-full max-w-md rounded-xl border border-line bg-black/50 p-4 text-left font-mono text-[12px] leading-relaxed shadow-xl backdrop-blur-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-faint" />
            <span className="size-2 rounded-full bg-faint" />
            <span className="size-2 rounded-full bg-neon/80" />
          </div>
          <span className="text-[10px] tracking-[0.2em] text-faint">SYSTEM: READY</span>
        </div>
        <div className="space-y-1.5">
          {STATUS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <span className="text-mute">
                <span className="mr-2 text-faint">{">"}</span>
                {k}:
              </span>
              <span className="font-medium text-neon">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <ol className="animate-rise delay-6 mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 font-mono text-[10px] tracking-[0.22em] text-faint">
        {FLOW.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5">
            <span className={i === FLOW.length - 1 ? "font-semibold text-neon" : ""}>{s}</span>
            {i < FLOW.length - 1 && <span aria-hidden>→</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

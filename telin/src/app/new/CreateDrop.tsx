"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, ChatIcon, CopyIcon, DiceIcon, LockIcon, MailIcon, SendIcon, ShareIcon } from "@/components/icons";
import { Terminal, useTerminal } from "@/components/Terminal";
import { LIFETIME_KEYS, LIFETIMES, MAX_MESSAGE_CHARS, MIN_CODE_LENGTH, type LifetimeKey } from "@/lib/constants";
import { generateCode, isValidCode, sealDrop } from "@/lib/crypto";
import { toB64u } from "@/lib/encoding";

type Phase = "compose" | "working" | "done";
interface Result {
  url: string;
  code?: string;
  lifetime: LifetimeKey;
  expiresAt: number;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CreateDrop() {
  const [phase, setPhase] = useState<Phase>("compose");
  const [message, setMessage] = useState("");
  const [lifetime, setLifetime] = useState<LifetimeKey>("once");
  const [security, setSecurity] = useState<"standard" | "code">("standard");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const term = useTerminal();

  const useCode = security === "code";
  const codeOk = !useCode || isValidCode(code);
  const canSubmit = message.trim().length > 0 && message.length <= MAX_MESSAGE_CHARS && codeOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPhase("working");
    term.reset();

    const chosenCode = useCode ? code : undefined;
    // Real work runs in parallel with the animation; bars wait for it.
    const sealing = sealDrop(message, chosenCode);
    const uploading = sealing.then(async (s) => {
      const res = await fetch("/api/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify({
          ciphertext: toB64u(s.ciphertext),
          iv: toB64u(s.iv),
          salt: toB64u(s.salt),
          verifier: toB64u(s.verifier),
          hasCode: s.hasCode,
          lifetime,
        }),
      });
      if (res.status === 429) throw new Error("Troppe richieste. Riprova tra qualche minuto.");
      if (!res.ok) throw new Error("Impossibile creare il drop. Riprova.");
      const { id, expiresAt } = (await res.json()) as { id: string; expiresAt: number };
      // The secret goes ONLY in the fragment (#...), which browsers never send to servers.
      return { url: `${window.location.origin}/d/${id}#${toB64u(s.secret)}`, expiresAt };
    });
    uploading.catch(() => {}); // handled below

    try {
      await term.print("INITIALIZING...", "dim", 380);
      await term.print("GENERATING KEY...", "plain", 120);
      await term.bar(650, sealing.then(() => undefined));
      await term.print("ENCRYPTING MESSAGE...", "plain", 120);
      await term.bar(750, uploading);
      const up = await uploading;
      await term.print("SECURE DROP CREATED.", "ok", 750);
      setResult({ url: up.url, expiresAt: up.expiresAt, lifetime, code: chosenCode });
      setMessage(""); // drop the plaintext from memory as soon as possible
      setCode("");
      setPhase("done");
    } catch (err) {
      await term.print(err instanceof Error ? err.message : "ERRORE", "err", 900);
      setError(err instanceof Error ? err.message : "Errore imprevisto.");
      setPhase("compose");
    }
  }

  if (phase === "working") {
    return (
      <div className="mx-auto w-full max-w-xl">
        <Terminal lines={term.lines} title="telin://encrypt" />
      </div>
    );
  }

  if (phase === "done" && result) return <DropCreated result={result} onReset={() => { setResult(null); setPhase("compose"); }} />;

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-xl" noValidate>
      <header className="animate-rise mb-8 text-center">
        <p className="label mb-3 !text-neon-dim">STEP 01 · COMPOSE</p>
        <h1 className="font-mono text-2xl font-semibold tracking-[0.18em] text-fg sm:text-3xl">NEW PRIVATE DROP</h1>
      </header>

      <div className="panel corners animate-rise delay-1 space-y-8 p-5 sm:p-7">
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <label htmlFor="message" className="label">Scrivi il tuo messaggio...</label>
            <span
              className={`font-mono text-[10px] tabular-nums ${message.length > MAX_MESSAGE_CHARS ? "text-danger" : "text-faint"}`}
            >
              {message.length}/{MAX_MESSAGE_CHARS}
            </span>
          </div>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            maxLength={MAX_MESSAGE_CHARS}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Ci vediamo alle 20:00 davanti al cinema."
            className="field min-h-[180px] resize-y p-4 text-[15px] leading-7"
          />
        </div>

        <fieldset>
          <legend className="label mb-3">Lifetime</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {LIFETIME_KEYS.map((k) => (
              <label key={k} className="option" id={`lifetime-${k}`}>
                <input type="radio" name="lifetime" value={k} checked={lifetime === k} onChange={() => setLifetime(k)} />
                <span className="dot" />
                {LIFETIMES[k].label}
              </label>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] leading-5 text-mute">
            {lifetime === "once"
              ? "Distrutto alla prima apertura. Se nessuno lo apre, scade dopo 7 giorni."
              : `Leggibile più volte per ${LIFETIMES[lifetime].label.toLowerCase()}, poi distrutto.`}
          </p>
        </fieldset>

        <fieldset>
          <legend className="label mb-3">Extra security</legend>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="option" id="security-standard">
              <input type="radio" name="security" checked={!useCode} onChange={() => setSecurity("standard")} />
              <span className="dot" />
              STANDARD
            </label>
            <label className="option" id="security-code">
              <input
                type="radio"
                name="security"
                checked={useCode}
                onChange={() => {
                  setSecurity("code");
                  if (!code) setCode(generateCode());
                }}
              />
              <span className="dot" />
              CODICE SEGRETO
            </label>
          </div>

          {useCode && (
            <div className="animate-rise mt-5 rounded-lg border border-line bg-black/30 p-4">
              <label htmlFor="code" className="label mb-3 block">Codice segreto</label>
              <div className="flex gap-2">
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  maxLength={64}
                  className="field h-12 px-4 text-center font-mono text-lg tracking-[0.4em]"
                />
                <button
                  type="button"
                  id="code-generate"
                  onClick={() => setCode(generateCode())}
                  className="btn btn-quiet !min-h-12 !px-3.5"
                  aria-label="Genera un nuovo codice"
                  title="Genera codice casuale"
                >
                  <DiceIcon className="size-5" />
                </button>
              </div>
              {!codeOk && (
                <p className="mt-2 font-mono text-[11px] text-amber">Minimo {MIN_CODE_LENGTH} caratteri.</p>
              )}
              <p className="mt-3 text-[12.5px] leading-5 text-mute">
                Il destinatario avrà bisogno del link <span className="text-fg">e</span> del codice per aprire il
                messaggio. Dopo 5 tentativi errati il drop si autodistrugge.
              </p>
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 font-mono text-[12px] text-danger">
            {error}
          </p>
        )}

        <button type="submit" id="create-drop" disabled={!canSubmit} className="btn btn-primary w-full">
          <LockIcon className="size-4" /> Crea drop
        </button>
      </div>

      <p className="animate-rise delay-2 mx-auto mt-6 max-w-md text-center text-[11.5px] leading-5 text-faint">
        Il messaggio viene cifrato in questo browser prima dell&apos;invio. Una volta aperto, il destinatario potrà
        comunque copiarlo o fotografarlo: nessun sistema può impedirlo.
      </p>
    </form>
  );
}

function CopyField({ id, value, label, big }: { id: string; value: string; label: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.getElementById(`${id}-value`) as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div>
      <p className="label mb-2.5">{label}</p>
      <div className={`flex flex-col gap-2.5 sm:flex-row ${copied ? "animate-flash rounded-lg" : ""}`}>
        <input
          id={`${id}-value`}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`field h-[52px] min-w-0 flex-1 px-4 font-mono text-neon ${big ? "text-center text-xl tracking-[0.45em]" : "text-[13px]"}`}
        />
        <button type="button" id={`${id}-copy`} onClick={copy} className="btn btn-ghost sm:w-40">
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
    </div>
  );
}

function DropCreated({ result, onReset }: { result: Result; onReset: () => void }) {
  const cfg = LIFETIMES[result.lifetime];
  const text = "Ti ho inviato un messaggio privato. Si autodistrugge dopo la lettura:";
  const enc = encodeURIComponent;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shares = [
    { id: "share-whatsapp", label: "WhatsApp", icon: ChatIcon, href: `https://wa.me/?text=${enc(`${text} ${result.url}`)}` },
    { id: "share-telegram", label: "Telegram", icon: SendIcon, href: `https://t.me/share/url?url=${enc(result.url)}&text=${enc(text)}` },
    { id: "share-email", label: "Email", icon: MailIcon, href: `mailto:?subject=${enc("Messaggio privato")}&body=${enc(`${text}\n\n${result.url}`)}` },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="animate-rise mb-8 text-center">
        <p className="label mb-3 !text-neon">DROP CREATED</p>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-strong bg-neon/10 text-neon shadow-[0_0_32px_-6px_rgba(61,255,154,0.5)]">
          <LockIcon width={24} height={24} />
        </div>
        <h1 className="font-mono text-xl font-semibold tracking-[0.16em] text-fg sm:text-2xl">YOUR MESSAGE IS READY</h1>
      </header>

      <div className="panel corners animate-rise delay-1 space-y-6 p-5 sm:p-7">
        <CopyField id="link" label="Link" value={result.url} />

        {result.code && (
          <div className="space-y-3">
            <CopyField id="code" label="Codice segreto" value={result.code} big />
            <p className="rounded-md border border-amber/25 bg-amber/5 px-4 py-3 text-[12.5px] leading-5 text-amber/90">
              Invia il codice su un <strong>canale diverso</strong> dal link (es. link su WhatsApp, codice a voce o via
              SMS). Non verrà mostrato di nuovo.
            </p>
          </div>
        )}

        <div className="rule" />

        <div className="grid grid-cols-2 gap-4 font-mono text-[12px]">
          <div>
            <p className="label mb-1.5">Expiration</p>
            <p className="text-fg">{cfg.short}</p>
          </div>
          <div>
            <p className="label mb-1.5">{result.lifetime === "once" ? "Max validity" : "Destroyed at"}</p>
            <p className="text-fg">{fmtTime(result.expiresAt)}</p>
          </div>
        </div>

        <div className="rule" />

        <div>
          <p className="label mb-3">Condividi</p>
          {canShare && (
            <button
              type="button"
              id="share-native"
              onClick={() => navigator.share({ title: "Private drop", text, url: result.url }).catch(() => {})}
              className="btn btn-primary mb-2.5 w-full"
            >
              <ShareIcon className="size-4" /> Condividi
            </button>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            {shares.map(({ id, label, icon: Icon, href }) => (
              <a key={id} id={id} href={href} target="_blank" rel="noopener noreferrer" className="btn btn-quiet !min-h-[48px] !gap-2 !px-2 !text-[11px] !tracking-[0.1em]">
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </a>
            ))}
          </div>
          {!result.code && (
            <p className="mt-4 text-[12px] leading-5 text-mute">
              Chiunque possieda questo link può aprire il messaggio. Condividilo solo con il destinatario.
            </p>
          )}
        </div>
      </div>

      <div className="animate-rise delay-2 mt-6 flex justify-center gap-3">
        <button type="button" id="create-another" onClick={onReset} className="btn btn-quiet">
          + Nuovo drop
        </button>
        <Link href="/" className="btn btn-quiet">Home</Link>
      </div>
    </div>
  );
}

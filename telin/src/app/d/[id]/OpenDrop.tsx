"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertIcon, FlameIcon, LockIcon } from "@/components/icons";
import { Terminal, useTerminal } from "@/components/Terminal";
import { SECRET_BYTES, type DropMode } from "@/lib/constants";
import { deriveKeys, isValidCode, openSealed } from "@/lib/crypto";
import { type Bytes, fromB64u, toB64u } from "@/lib/encoding";

type Phase =
  | "boot"
  | "nolink"
  | "ready"
  | "working"
  | "revealed"
  | "destroying"
  | "consumed"
  | "closed"
  | "empty"
  | "locked"
  | "error";

interface Meta {
  hasCode: boolean;
  salt: string;
  mode: DropMode;
  expiresAt: number;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OpenDrop({ id }: { id: string }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [leaving, setLeaving] = useState(false);
  const secretRef = useRef<Bytes | null>(null);
  const term = useTerminal();

  // 1. Read the key from the URL fragment, then remove it from the address bar
  //    and from the history entry. The fragment never reaches the server.
  useEffect(() => {
    if (!secretRef.current) {
      const frag = window.location.hash.slice(1);
      try {
        const s = fromB64u(frag);
        if (s.length === SECRET_BYTES) secretRef.current = s;
      } catch {
        /* invalid */
      }
      if (frag) history.replaceState(null, "", window.location.pathname);
    }
    if (!secretRef.current) {
      setPhase("nolink");
      return;
    }

    // 2. Fetch public metadata only (does not consume the drop).
    let cancelled = false;
    fetch(`/api/drops/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "omit" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setMeta((await res.json()) as Meta);
          setPhase("ready");
        } else if (res.status === 429) {
          setErrorText("Troppe richieste. Riprova tra qualche minuto.");
          setPhase("error");
        } else setPhase("empty");
      })
      .catch(() => {
        if (!cancelled) {
          setErrorText("Connessione non disponibile.");
          setPhase("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function open(e?: React.FormEvent) {
    e?.preventDefault();
    const secret = secretRef.current;
    if (!secret || !meta) return;
    if (meta.hasCode && !isValidCode(code)) {
      setCodeError("Codice non valido.");
      setShake((n) => n + 1);
      return;
    }
    setCodeError(null);
    setPhase("working");
    term.reset();

    type Auth =
      | { kind: "ok"; plaintext: Promise<string>; mode: DropMode; expiresAt: number }
      | { kind: "invalid"; remaining: number }
      | { kind: "locked" | "gone" | "rate" | "error" };

    const authenticating: Promise<Auth> = (async (): Promise<Auth> => {
      const salt = fromB64u(meta.salt);
      const { encKey, authToken } = await deriveKeys(secret, salt, meta.hasCode ? code : undefined);
      const res = await fetch(`/api/drops/${encodeURIComponent(id)}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify({ authToken: toB64u(authToken) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ciphertext: string; iv: string; mode: DropMode; expiresAt: number; hasCode: boolean };
        const plaintext = openSealed(encKey, fromB64u(data.iv), fromB64u(data.ciphertext), data.hasCode);
        plaintext.catch(() => {});
        return { kind: "ok", plaintext, mode: data.mode, expiresAt: data.expiresAt };
      }
      if (res.status === 403) {
        const d = (await res.json().catch(() => ({}))) as { remaining?: number };
        return { kind: "invalid", remaining: d.remaining ?? 0 };
      }
      if (res.status === 410) return { kind: "locked" };
      if (res.status === 404) return { kind: "gone" };
      if (res.status === 429) return { kind: "rate" };
      return { kind: "error" };
    })().catch((): Auth => ({ kind: "error" }));

    await term.print("ESTABLISHING SECURE CHANNEL...", "dim", 320);
    await term.print("AUTHENTICATING...", "plain", 120);
    await term.bar(meta.hasCode ? 900 : 600, authenticating);
    const auth = await authenticating;

    if (auth.kind !== "ok") {
      if (auth.kind === "invalid") {
        await term.print("ACCESS DENIED", "err", 700);
        setCodeError(`Codice errato. Tentativi rimasti: ${auth.remaining}.`);
        setShake((n) => n + 1);
        setPhase("ready");
      } else if (auth.kind === "locked") {
        await term.print("TOO MANY ATTEMPTS — DROP DESTROYED", "err", 900);
        setPhase("locked");
      } else if (auth.kind === "gone") {
        await term.print("DROP NOT FOUND", "err", 700);
        setPhase("empty");
      } else {
        await term.print("CHANNEL ERROR", "err", 700);
        setErrorText(auth.kind === "rate" ? "Troppe richieste. Riprova tra qualche minuto." : "Errore di rete. Riprova.");
        setPhase(auth.kind === "rate" ? "error" : "ready");
      }
      return;
    }

    await term.print("VERIFYING KEY...", "plain", 220);
    await term.print("DECRYPTING...", "plain", 120);
    await term.bar(600, auth.plaintext);
    try {
      const text = await auth.plaintext;
      await term.print("ACCESS GRANTED", "ok", 800);
      setMeta((m) => (m ? { ...m, mode: auth.mode, expiresAt: auth.expiresAt } : m));
      setMessage(text);
      setPhase("revealed");
    } catch {
      await term.print("INTEGRITY CHECK FAILED", "err", 800);
      setErrorText("Impossibile decifrare il messaggio: il link è corrotto o i dati sono stati alterati.");
      setPhase("error");
    }
  }

  async function close() {
    if (meta?.mode !== "once") {
      setMessage("");
      setPhase("closed");
      return;
    }
    setMessage(""); // wipe plaintext from the page
    setPhase("destroying");
    term.reset();
    await term.print("MESSAGE OPENED", "dim", 380);
    for (const step of ["DECRYPTED", "READ", "CONSUMED", "DESTROYED"]) {
      await term.print(step, step === "DESTROYED" ? "warn" : "plain", 160);
      if (step !== "DESTROYED") await term.print("   ↓", "dim", 120);
    }
    await term.bar(700);
    await term.print("DROP CLOSED", "ok", 650);
    setLeaving(true);
    await term.sleep(650);
    setLeaving(false);
    setPhase("consumed");
  }

  // ──────────────────────────── render ────────────────────────────

  if (phase === "boot") {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-3 py-16 font-mono text-[12px] tracking-[0.2em] text-mute">
          <span className="caret">LOCATING DROP</span>
        </div>
      </Shell>
    );
  }

  if (phase === "working" || phase === "destroying") {
    return (
      <div className={`mx-auto w-full max-w-xl ${leaving ? "animate-glitch" : ""}`}>
        <Terminal lines={term.lines} title={phase === "working" ? "telin://decrypt" : "telin://destroy"} />
      </div>
    );
  }

  if (phase === "ready" && meta) {
    return (
      <Shell>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-line-strong bg-neon/10 text-neon shadow-[0_0_32px_-6px_rgba(61,255,154,0.5)]">
          <LockIcon width={24} height={24} />
        </div>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">ENCRYPTED MESSAGE</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">
          Questo messaggio è privato.
          <br />
          {meta.mode === "once" ? (
            <span className="text-fg">È disponibile per una sola apertura.</span>
          ) : (
            <span className="text-fg">È disponibile fino a {fmtTime(meta.expiresAt)}.</span>
          )}
        </p>

        {meta.hasCode ? (
          <form onSubmit={open} className="mt-8 rounded-lg border border-line bg-black/30 p-4 sm:p-5">
            <p className="label mb-2 !text-neon-dim">Additional security</p>
            <label htmlFor="unlock-code" className="mb-4 block text-[13.5px] text-mute">
              Inserisci il codice ricevuto dal mittente.
            </label>
            <input
              key={shake}
              id="unlock-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              placeholder="_ _ _ _ _ _"
              className={`field h-14 px-4 text-center font-mono text-2xl tracking-[0.5em] ${shake ? "animate-shake" : ""}`}
            />
            {codeError && (
              <p role="alert" className="mt-3 font-mono text-[12px] text-danger">
                {codeError}
              </p>
            )}
            <button type="submit" id="verify-code" className="btn btn-primary mt-4 w-full">
              Verifica
            </button>
          </form>
        ) : (
          <div className="mt-8">
            {errorText && <p className="mb-3 text-center font-mono text-[12px] text-danger">{errorText}</p>}
            <button type="button" id="open-message" onClick={() => open()} className="btn btn-primary w-full">
              Apri messaggio
            </button>
          </div>
        )}

        {meta.mode === "once" && (
          <p className="mt-5 text-center text-[12px] leading-5 text-faint">
            All&apos;apertura il messaggio verrà eliminato dal server. Assicurati di poterlo leggere ora.
          </p>
        )}
      </Shell>
    );
  }

  if (phase === "revealed" && meta) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <div className="panel corners animate-rise p-5 sm:p-7">
          <p className="label mb-5 flex items-center gap-2 !text-neon-dim">
            <LockIcon className="size-3.5" /> Private message
          </p>
          <div
            id="message-content"
            className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-black/50 p-5 text-[16px] leading-7 text-fg"
          >
            {/* Rendered as plain text by React: no HTML injection possible. */}
            {message}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <p className="label mb-1.5">Message status</p>
              <p className="flex items-center gap-2 font-mono text-[12px] text-neon">
                <span className="status-dot" /> OPENED
              </p>
            </div>
            <p className="max-w-[60%] text-right text-[12px] leading-5 text-mute">
              {meta.mode === "once"
                ? "La copia sul server è già stata distrutta. This message will now be destroyed."
                : `Disponibile fino a ${fmtTime(meta.expiresAt)}, poi verrà distrutto.`}
            </p>
          </div>

          <button type="button" id="close-message" onClick={close} className="btn btn-ghost mt-6 w-full">
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  if (phase === "consumed") {
    return (
      <Shell>
        <StateIcon tone="warn">
          <FlameIcon className="size-6" />
        </StateIcon>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">MESSAGE CONSUMED</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">This private drop is no longer available.</p>
        <HomeButton />
      </Shell>
    );
  }

  if (phase === "closed") {
    return (
      <Shell>
        <StateIcon tone="ok">
          <LockIcon className="size-6" />
        </StateIcon>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">DROP CLOSED</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">
          Il messaggio è stato rimosso da questa pagina.
          {meta && <> Verrà distrutto dal server il {fmtTime(meta.expiresAt)}.</>}
        </p>
        <HomeButton />
      </Shell>
    );
  }

  if (phase === "locked") {
    return (
      <Shell>
        <StateIcon tone="err">
          <AlertIcon className="size-6" />
        </StateIcon>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">DROP DESTROYED</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">
          Troppi tentativi con codice errato.
          <br />
          Il messaggio è stato distrutto per sicurezza.
        </p>
        <HomeButton />
      </Shell>
    );
  }

  if (phase === "nolink") {
    return (
      <Shell>
        <StateIcon tone="warn">
          <AlertIcon className="size-6" />
        </StateIcon>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">LINK INCOMPLETO</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">
          Il link non contiene la chiave di decifratura.
          <br />
          Assicurati di averlo copiato per intero.
        </p>
        <HomeButton />
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell>
        <StateIcon tone="err">
          <AlertIcon className="size-6" />
        </StateIcon>
        <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">ERRORE</h2>
        <p className="mt-4 text-center text-[15px] leading-7 text-mute">{errorText}</p>
        <HomeButton />
      </Shell>
    );
  }

  // empty
  return (
    <Shell>
      <StateIcon tone="warn">
        <AlertIcon className="size-6" />
      </StateIcon>
      <h2 className="text-center font-mono text-lg font-semibold tracking-[0.18em] text-fg">DROP EMPTY</h2>
      <p className="mt-4 text-center text-[15px] leading-7 text-mute">
        Questo messaggio è già stato
        <br />
        aperto o è scaduto.
        <br />
        <span className="text-fg">Non è più disponibile.</span>
      </p>
      <HomeButton />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <header className="animate-rise mb-6 text-center">
        <h1 className="label !text-neon-dim">PRIVATE DROP</h1>
      </header>
      <div className="panel corners animate-rise delay-1 p-6 sm:p-8">{children}</div>
    </div>
  );
}

function StateIcon({ tone, children }: { tone: "ok" | "warn" | "err"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-line-strong bg-neon/10 text-neon shadow-[0_0_24px_-6px_rgba(61,255,154,0.4)]"
      : tone === "warn"
        ? "border-amber/35 bg-amber/10 text-amber shadow-[0_0_24px_-6px_rgba(255,200,97,0.3)]"
        : "border-danger/35 bg-danger/10 text-danger shadow-[0_0_24px_-6px_rgba(255,92,119,0.3)]";
  return <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border ${cls}`}>{children}</div>;
}

function HomeButton() {
  return (
    <Link href="/" id="back-home" className="btn btn-ghost mt-8 w-full">
      Torna alla home
    </Link>
  );
}

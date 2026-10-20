import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security model — TELIN",
  description: "Come TELIN cifra i messaggi, cosa sa il server e cosa il sistema non può garantire.",
};

const PROTECTS = [
  ["Cifratura nel browser", "AES-256-GCM via Web Crypto API. Il server riceve solo ciphertext."],
  ["Chiave fuori dal server", "La chiave è nel frammento dell'URL (#…), che i browser non inviano mai al server."],
  ["Lettura singola atomica", "Il ciphertext viene consegnato e cancellato nella stessa transazione: due aperture sono impossibili."],
  ["Codice segreto", "Derivato con PBKDF2 (600k iterazioni) e mai memorizzato. 5 tentativi errati distruggono il drop."],
  ["Database leak", "Il DB contiene solo dati cifrati e hash non invertibili senza il link."],
  ["Link preview", "Le anteprime di WhatsApp/Telegram non possono consumare il drop."],
  ["Niente tracking", "Nessun cookie, nessun analytics, IP mai salvati (solo hash temporanei per il rate limit)."],
  ["Lunghezza nascosta", "Il messaggio viene riempito a blocchi da 256 byte prima della cifratura."],
] as const;

const LIMITS = [
  ["Screenshot e copie", "Una volta mostrato, il destinatario può sempre copiare o fotografare il messaggio."],
  ["Furto del link", "Chi intercetta il link (senza codice) può leggere il messaggio prima del destinatario. Usa il codice segreto su un canale separato."],
  ["Server compromesso", "Chi controlla il server può servire JavaScript modificato per rubare le chiavi. È un limite di ogni app di cifratura web."],
  ["Dispositivo compromesso", "Malware o estensioni malevole possono leggere ciò che appare sullo schermo."],
  ["Codice debole + DB rubato", "Con link e database rubati insieme, un codice a 6 cifre può essere forzato offline (lentamente)."],
  ["Errore di rete all'apertura", "Un drop monouso già consegnato dal server non è recuperabile."],
  ["Cancellazione fisica", "I dati vengono cancellati e sovrascritti nel DB, ma su SSD/filesystem l'erasure fisica non è garantibile."],
  ["Metadati", "Il server vede che un drop esiste, la sua dimensione approssimativa e quando scade."],
] as const;

export default function SecurityPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
      <p className="label animate-rise mb-3 !text-neon-dim">SECURITY MODEL</p>
      <h1 className="animate-rise delay-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        The server stores data, <span className="glow-text">not knowledge.</span>
      </h1>
      <p className="animate-rise delay-2 mt-5 max-w-2xl text-[15px] leading-7 text-mute">
        TELIN usa solo primitive crittografiche standard. Nessun algoritmo proprietario. Qui sotto trovi cosa il sistema
        protegge davvero — e cosa nessun sistema di questo tipo può garantire.
      </p>

      <pre className="panel animate-rise delay-3 mt-10 overflow-x-auto p-5 font-mono text-[11.5px] leading-6 text-neon-dim sm:text-[12.5px]">
{`S      = random(32 byte)            → solo nel link: /d/<id>#S
IKM    = S  [ || PBKDF2(codice, salt, 600k) ]
K_enc  = HKDF(IKM, "telin/v1/enc")   → AES-256-GCM
token  = HKDF(IKM, "telin/v1/auth")  → prova di possesso
server ← { ciphertext, iv, salt, SHA-256(token) }`}
      </pre>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="label mb-5 !text-neon">✓ Cosa protegge</h2>
          <ul className="space-y-4">
            {PROTECTS.map(([t, d]) => (
              <li key={t} className="border-l border-line-strong pl-4">
                <p className="font-mono text-[12px] tracking-[0.08em] text-fg">{t}</p>
                <p className="mt-1 text-[13.5px] leading-6 text-mute">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="label mb-5 !text-amber">⚠ Cosa non può garantire</h2>
          <ul className="space-y-4">
            {LIMITS.map(([t, d]) => (
              <li key={t} className="border-l border-amber/30 pl-4">
                <p className="font-mono text-[12px] tracking-[0.08em] text-fg">{t}</p>
                <p className="mt-1 text-[13.5px] leading-6 text-mute">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14 flex justify-center">
        <Link href="/new" className="btn btn-primary">+ Crea messaggio privato</Link>
      </div>
    </section>
  );
}

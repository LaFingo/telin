import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import "./globals.css";

// Fonts are downloaded at build time and self-hosted: no runtime request to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "TELIN — Private Drop · Messaggi che non restano",
  description:
    "Scrivi un messaggio, cifralo nel tuo browser e condividi un link che si autodistrugge dopo la lettura. Nessun account, nessuna cronologia, zero messaggi in chiaro sul server.",
  referrer: "no-referrer",
  robots: { index: true, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#020403",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading headers forces dynamic rendering, required for per-request CSP nonces.
  await headers();

  return (
    <html lang="it" className={`${inter.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" id="nav-home" className="group flex items-center gap-2.5 font-mono text-xs tracking-[0.25em] text-fg transition hover:text-neon">
            <span className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-line-strong bg-neon/10 text-[11px] text-neon transition group-hover:shadow-[0_0_12px_0_rgba(61,255,154,0.6)]">
              ▣
            </span>
            <span className="font-semibold tracking-[0.2em]">TELIN</span>
          </Link>
          <nav className="flex items-center gap-5 font-mono text-[11px] tracking-[0.18em] text-mute">
            <span className="hidden items-center gap-2 text-mute/80 sm:flex">
              <span className="status-dot" /> E2E SECURE
            </span>
            <Link href="/security" id="nav-security" className="transition hover:text-neon hover:underline underline-offset-4">
              SECURITY
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>

        <footer className="mx-auto w-full max-w-5xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:px-8">
          <div className="rule mb-5" />
          <div className="flex flex-col items-center justify-between gap-2 font-mono text-[10px] tracking-[0.22em] text-faint sm:flex-row">
            <span>THE SERVER STORES DATA, NOT KNOWLEDGE.</span>
            <span>NO ACCOUNT · NO ANALYTICS · NO COOKIES</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

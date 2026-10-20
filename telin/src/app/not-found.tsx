import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
      <p className="label mb-4 !text-neon-dim">ERROR 404</p>
      <h1 className="font-mono text-2xl tracking-[0.2em] text-fg">SIGNAL LOST</h1>
      <p className="mt-4 text-mute">Questa pagina non esiste.</p>
      <Link href="/" className="btn btn-ghost mt-8">Torna alla home</Link>
    </section>
  );
}

import type { Metadata } from "next";
import OpenDrop from "./OpenDrop";

// Generic, content-free metadata: link previews in chat apps reveal nothing.
export const metadata: Metadata = {
  title: "Private Drop — TELIN",
  description: "Hai ricevuto un messaggio privato cifrato.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section className="flex flex-1 flex-col justify-center px-5 py-10 sm:py-16">
      <OpenDrop id={id} />
    </section>
  );
}

import type { Metadata } from "next";
import CreateDrop from "./CreateDrop";

export const metadata: Metadata = {
  title: "New Private Drop — TELIN",
  description: "Scrivi un messaggio privato, cifralo nel browser e genera un link che si autodistrugge.",
};

export default function NewPage() {
  return (
    <section className="flex flex-1 flex-col justify-center px-5 py-10 sm:py-16">
      <CreateDrop />
    </section>
  );
}

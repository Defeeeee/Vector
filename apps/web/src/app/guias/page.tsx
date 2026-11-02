import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import JsonLd from "@/components/publico/JsonLd";
import NavPublica from "@/components/publico/NavPublica";
import PiePublico from "@/components/publico/PiePublico";
import { GUIAS, OG_BASE, fechaLarga, urlAbsoluta } from "@/lib/sitio";

export const metadata: Metadata = {
  title: "Guías para pilotos: libro de vuelo, CAD, PCA y experiencia reciente | Vector",
  description:
    "Guías para pilotos en Argentina, escritas contra la RAAC 61 vigente y las resoluciones de ANAC: libro de vuelo, horas centesimales, registro en el CAD, requisitos de la PCA y experiencia reciente.",
  alternates: { canonical: "/guias" },
  openGraph: {
    ...OG_BASE,
    title: "Guías para pilotos | Vector",
    description: "Lo que pide la norma, explicado con las fuentes.",
    url: "/guias",
    type: "website",
  },
};

export default function IndiceGuias() {
  const datos = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: GUIAS.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: urlAbsoluta(`/guias/${g.slug}`),
      name: g.titulo,
    })),
  };
  return (
    <div className="w-full min-h-screen bg-white dark:bg-black">
      <JsonLd datos={datos} />
      <NavPublica />
      <section className="container-wide pt-32 md:pt-40 pb-20">
        <div className="max-w-2xl">
          <span className="eyebrow">Guías</span>
          <h1 className="mt-3 text-4xl md:text-5xl font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
            Lo que pide la norma, explicado con las fuentes.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Escritas contra la RAAC 61 vigente (VI edición, enero de 2026) y las resoluciones de ANAC,
            con cada fuente citada al pie. Para orientarte: no reemplazan el texto oficial ni lo que te
            indique tu escuela.
          </p>
        </div>
        <div className="mt-12 grid md:grid-cols-2 gap-5">
          {GUIAS.map((g) => (
            <Link
              key={g.slug}
              href={`/guias/${g.slug}`}
              className="group rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-7 hover:border-zinc-300 dark:hover:border-white/20 transition-colors flex flex-col"
            >
              <BookOpen className="w-5 h-5 text-aviation-blue dark:text-aviation-cyan" />
              <h2 className="mt-4 text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight group-hover:underline underline-offset-2">
                {g.titulo}
              </h2>
              <p className="mt-2 text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">{g.descripcion}</p>
              <p className="mt-5 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
                <span>Verificada el {fechaLarga(g.actualizada)}</span>
                <ArrowRight className="w-4 h-4 text-zinc-900 dark:text-white" />
              </p>
            </Link>
          ))}
        </div>
      </section>
      <PiePublico />
    </div>
  );
}

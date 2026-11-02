import Link from "next/link";
import { ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import JsonLd from "./JsonLd";
import NavPublica from "./NavPublica";
import PiePublico from "./PiePublico";
import { GUIAS, SITIO_URL, fechaLarga, urlAbsoluta, type Guia } from "@/lib/sitio";

export interface Fuente {
  texto: string;
  url?: string;
}

/**
 * Lo que comparten las guías: la barra, las migas, el título con la fecha en que se
 * verificó, el texto, las **fuentes** —cada guía cita de dónde sale cada número
 * (invariante 6)—, la invitación a Vector y las demás guías.
 *
 * El estilo del texto va en arbitrary variants, como en `LegalShell`: el contenido de
 * cada guía es JSX simple (h2, p, ul, table) y se ve bien sin clases propias.
 */
export default function GuiaShell({
  guia,
  fuentes,
  children,
}: {
  guia: Guia;
  fuentes: Fuente[];
  children: React.ReactNode;
}) {
  const url = urlAbsoluta(`/guias/${guia.slug}`);
  const datos = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guia.titulo,
      description: guia.descripcion,
      datePublished: guia.actualizada,
      dateModified: guia.actualizada,
      inLanguage: "es-AR",
      mainEntityOfPage: url,
      image: `${url}/opengraph-image`,
      author: { "@type": "Organization", name: "Vector", url: SITIO_URL },
      publisher: { "@type": "Organization", name: "Vector", url: SITIO_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: urlAbsoluta("/") },
        { "@type": "ListItem", position: 2, name: "Guías", item: urlAbsoluta("/guias") },
        { "@type": "ListItem", position: 3, name: guia.corto, item: url },
      ],
    },
  ];
  const otras = GUIAS.filter((g) => g.slug !== guia.slug);

  return (
    <div className="w-full min-h-screen bg-white dark:bg-black">
      <JsonLd datos={datos} />
      <NavPublica />

      <article className="container-wide pt-32 md:pt-40 pb-16">
        <div className="max-w-[72ch]">
          <nav aria-label="Migas" className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">Inicio</Link>
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            <Link href="/guias" className="hover:text-zinc-900 dark:hover:text-white">Guías</Link>
          </nav>

          <h1 className="mt-6 text-4xl md:text-5xl font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.1]">
            {guia.titulo}
          </h1>
          <p className="mt-5 text-lg md:text-xl text-zinc-500 dark:text-zinc-400 leading-relaxed">{guia.descripcion}</p>
          <p className="mt-4 eyebrow">Verificada contra las fuentes el {fechaLarga(guia.actualizada)}</p>

          <div
            className={[
              "mt-10 text-[16px] leading-relaxed text-zinc-700 dark:text-zinc-300",
              "[&>*+*]:mt-5 [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-display [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-zinc-900 [&_h2]:dark:text-white [&_h2]:scroll-mt-28",
              "[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-display [&_h3]:font-bold [&_h3]:text-zinc-900 [&_h3]:dark:text-white",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2",
              "[&_strong]:text-zinc-900 [&_strong]:dark:text-white [&_a]:text-aviation-blue [&_a]:dark:text-aviation-cyan [&_a]:underline [&_a]:underline-offset-2",
              "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[15px] [&_th]:text-left [&_th]:font-semibold [&_th]:text-zinc-900 [&_th]:dark:text-white [&_th]:border-b-2 [&_th]:border-zinc-200 [&_th]:dark:border-white/15 [&_th]:py-2 [&_th]:pr-4 [&_td]:border-b [&_td]:border-zinc-100 [&_td]:dark:border-white/10 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top",
            ].join(" ")}
          >
            {children}
          </div>

          <aside className="mt-14 rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.03] p-7 md:p-8">
            <p className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">
              Llevá tu libro de vuelo en Vector
            </p>
            <p className="mt-2 text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Cargá cada vuelo en segundos: Vector hace el desglose de la hoja, te dice si podés volar
              hoy y cuánto te falta para la PCA, y te arma el libro en PDF para que te lo firmen.
            </p>
            <Link
              href="/register"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
            >
              Crear mi bitácora
              <ArrowRight className="w-4 h-4" />
            </Link>
          </aside>

          <section className="mt-14">
            <h2 className="text-lg font-display font-bold text-zinc-900 dark:text-white">Fuentes</h2>
            <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
              {fuentes.map((f) => (
                <li key={f.texto}>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white">
                      {f.texto}
                    </a>
                  ) : (
                    f.texto
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
              Esta guía resume normas públicas para orientarte; no reemplaza el texto oficial ni lo que
              te indique tu escuela, tu instructor o ANAC.
            </p>
          </section>

          <section className="mt-14">
            <h2 className="text-lg font-display font-bold text-zinc-900 dark:text-white">Otras guías</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {otras.map((g) => (
                <Link
                  key={g.slug}
                  href={`/guias/${g.slug}`}
                  className="group flex items-start gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 p-4 hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
                >
                  <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-aviation-blue dark:text-aviation-cyan" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:underline underline-offset-2">{g.titulo}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </article>

      <PiePublico />
    </div>
  );
}

/** Una nota destacada dentro de una guía: lo que Vector hace solo, o un aviso. */
export function Nota({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.05] dark:bg-aviation-cyan/[0.05] px-5 py-4">
      <p className="text-sm font-bold text-zinc-900 dark:text-white">{titulo}</p>
      <div className="mt-1 text-[15px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{children}</div>
    </div>
  );
}

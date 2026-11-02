import PageHeader from "@/components/dashboard/PageHeader";
import NovedadCard from "@/components/dashboard/NovedadCard";
import { CHANGELOG } from "@/lib/changelog";

/**
 * El histórico de novedades.
 *
 * Existe para que la tarjeta del dashboard no tenga que elegir entre contar todo y no
 * molestar: ahí van las cuatro principales de la última versión, acá está el resto.
 *
 * Es un server component sin datos propios — el changelog es un módulo estático, así
 * que no hay fetch, no hay sesión que verificar más allá del proxy, y la página se
 * arma sola.
 */
export const metadata = { title: "Novedades · Vector" };

export default function NovedadesPage() {
  return (
    <div className="space-y-8 md:space-y-10">
      <PageHeader eyebrow="Vector" title="Novedades">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
          Todo lo que fue cambiando, de lo más nuevo a lo más viejo. Sólo lo que se ve:
          lo de adentro está en la bitácora del repositorio.
        </p>
      </PageHeader>

      <div className="space-y-10">
        {CHANGELOG.map((version) => (
          <section key={version.version} className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-200 dark:border-white/10 pb-3">
              <h2 className="text-lg font-display font-bold tracking-tight text-zinc-900 dark:text-white">
                {version.titulo}
              </h2>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-aviation-blue">
                v{version.version}
              </span>
              <time
                dateTime={version.fecha}
                className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500"
              >
                {new Date(`${version.fecha}T12:00:00Z`).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {version.novedades.map((novedad) => (
                <NovedadCard key={novedad.titulo} novedad={novedad} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

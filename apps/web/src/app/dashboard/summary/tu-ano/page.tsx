import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import TuAnoExperiencia from "@/components/dashboard/tu-ano/TuAnoExperiencia";
import { anioDeLaUrl, cargarTuAno } from "@/lib/tu-ano-servidor";

export const metadata = { title: "Tu año en vuelo | Vector" };

/**
 * "Tu año en vuelo" (3.39.0): las historias a pantalla completa con las estadísticas del año.
 * El año en curso es **el de la hora argentina, resuelto acá** (invariante 1); `?anio=` elige
 * otro. Lo de abajo de las historias —lo que se ve si se las cierra sin salir— sólo ofrece
 * volver a verlas y elegir otro año.
 */
export default async function TuAnoPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const { anio } = await searchParams;
  const r = await cargarTuAno(anioDeLaUrl(anio));
  if (r.estado === "sin-sesion") redirect("/api/auth/logout?redirect=/login?expirada=1");

  if (r.estado === "error") {
    return (
      <div className="space-y-6 pb-20">
        <PageHeader eyebrow="El año, en historias" title="Tu año en vuelo" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No pudimos leer tus vuelos ahora. Probá de nuevo en un rato.</p>
      </div>
    );
  }

  const { datos, anios } = r;
  // El selector ofrece los años con vuelos, y el que se está mirando aunque no tenga (el en curso).
  const opciones = anios.includes(datos.anio) ? anios : [datos.anio, ...anios].sort((a, b) => b - a);

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="space-y-4">
        <Link href="/dashboard/summary" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Resumen
        </Link>
        <PageHeader eyebrow="El año, en historias" title={`Tu ${datos.anio} en vuelo`} />
      </div>

      {opciones.length > 1 && (
        <nav aria-label="Año" className="flex flex-wrap gap-2">
          {opciones.map((a) => (
            <Link
              key={a}
              href={`/dashboard/summary/tu-ano?anio=${a}`}
              aria-current={a === datos.anio ? "page" : undefined}
              className={`inline-flex items-center min-h-11 px-4 rounded-full font-mono text-[13px] font-semibold border ${
                a === datos.anio ? "bg-aviation-cyan text-noche border-aviation-cyan" : "border-white/15 text-zinc-400"
              }`}
            >
              {a}
            </Link>
          ))}
        </nav>
      )}

      <TuAnoExperiencia key={datos.anio} datos={datos} anios={anios} />
    </div>
  );
}

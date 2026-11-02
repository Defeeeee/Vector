import Link from "next/link";
import { ArrowRight, Camera, Users } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import { leerResumenSocial } from "@/lib/resumen-social";
import { leerPublicaciones } from "@/lib/publicaciones-servidor";
import type { Publicacion } from "@/types";

/**
 * "Tu red", al final del Inicio: lo último de los pilotos que seguís, o la invitación a
 * sumarte.
 *
 * Es la excepción a "el inicio contesta tres preguntas", decidida por Federico: una
 * tarjeta chica, **al final**, que no empuja nada de lo de arriba. Entra por `Suspense`
 * desde la página, así que el feed —un viaje más al backend, con fotos firmadas— nunca
 * demora el "¿puedo volar hoy?".
 *
 * Si no se pudo preguntar, no dibuja nada: el Inicio no es lugar para un error de la red.
 */
export default async function TuRedInicio() {
  const resumen = await leerResumenSocial();
  if (!resumen.disponible) return null;

  if (!resumen.handle) {
    return (
      <Link
        href="/dashboard/pilotos"
        className="group flex items-center gap-4 rounded-[2rem] border border-dashed border-zinc-300 dark:border-white/15 bg-white dark:bg-white/[0.02] p-5 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
      >
        <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Sumate a la red de pilotos</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Elegí tu @, seguí a otros pilotos y compartí tus vuelos.
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
      </Link>
    );
  }

  const lectura = await leerPublicaciones({ tipo: "red" });
  const deOtros = lectura.publicaciones.filter((p) => !p.es_mia).slice(0, 2);
  const novedades = resumen.solicitudes_pendientes + resumen.actividad_nueva;

  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">Tu red</h3>
        <Link
          href="/dashboard/pilotos"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Ver la Red <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {deOtros.length > 0 ? (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/10">
          {deOtros.map((p) => (
            <li key={p.id}>
              <Link href="/dashboard/pilotos" className="flex items-start gap-3 py-3 group">
                <AvatarPiloto nombre={p.autor.nombre_visible} avatarUrl={p.autor.avatar_url} tamano="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold text-zinc-900 dark:text-white truncate group-hover:underline underline-offset-2">
                      {p.autor.nombre_visible}
                    </span>
                    <span className="shrink-0 text-[12px] text-zinc-400" title={p.fecha_titulo}>
                      {p.fecha_texto}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400 line-clamp-1 break-words">
                    {resumenDe(p)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Todavía no hay publicaciones de pilotos que sigas.{" "}
          <Link
            href="/dashboard/pilotos/buscar"
            className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2"
          >
            Buscá a quién seguir
          </Link>
          .
        </p>
      )}

      {novedades > 0 && (
        <Link
          href="/dashboard/pilotos/actividad"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-50 dark:bg-red-500/10 px-3 py-1.5 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/15 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
          {novedades} {novedades === 1 ? "novedad" : "novedades"} en tu actividad
        </Link>
      )}
    </section>
  );
}

/** Una línea que diga de qué se trata: el vuelo, el texto, o las fotos. */
function resumenDe(p: Publicacion): React.ReactNode {
  const vuelo = p.vuelo
    ? [p.vuelo.ruta, p.vuelo.duracion != null ? `${p.vuelo.duracion.toFixed(1)} h` : null].filter(Boolean).join(" · ")
    : "";
  const texto = p.texto?.trim();
  if (vuelo && texto) return `${vuelo} — ${texto}`;
  if (vuelo) return `Voló ${vuelo}`;
  if (texto) return texto;
  if (p.fotos.length > 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <Camera className="w-3.5 h-3.5" aria-hidden="true" />
        {p.fotos.length === 1 ? "Una foto" : `${p.fotos.length} fotos`}
      </span>
    );
  }
  return "Publicó algo";
}

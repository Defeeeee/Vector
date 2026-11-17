import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import MapaCarreraMapa from "@/components/dashboard/mapa-carrera/MapaCarreraMapa";
import CompartirMapa from "@/components/dashboard/mapa-carrera/CompartirMapa";
import { cargarMapaCarrera, urlDelMapa } from "@/lib/mapa-carrera-servidor";
import { formatearNumero } from "@/lib/tu-ano";

export const metadata = { title: "Tu mapa | Vector" };

const ROTULO = "font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";

/**
 * "Tu mapa" (3.47.0): todos los aeródromos y las rutas de tu bitácora en un mapa, filtrable por
 * año y por avión (en la URL, como los filtros de Aeropuertos) y compartible como imagen. Sólo
 * vuelos: un simulador no tiene ruta (invariante 4). Las fechas bajan escritas del server
 * (invariante 1), y lo que no se pudo ubicar se dice (invariante 2).
 */
export default async function TuMapaPage({ searchParams }: { searchParams: Promise<{ anio?: string; avion?: string }> }) {
  const { anio, avion } = await searchParams;
  const r = await cargarMapaCarrera(anio, avion);
  if (r.estado === "sin-sesion") redirect("/api/auth/logout?redirect=/login?expirada=1");

  const cabecera = (
    <div className="space-y-4">
      <Link href="/dashboard/summary" className="inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
        <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Resumen
      </Link>
      <PageHeader eyebrow="Toda tu carrera, en un mapa" title="Tu mapa" />
    </div>
  );

  if (r.estado === "error") {
    return (
      <div className="space-y-6 pb-20">
        {cabecera}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No pudimos leer tus vuelos ahora. Probá de nuevo en un rato.</p>
      </div>
    );
  }

  const { datos, opciones } = r;
  const { filtros, aerodromos, piernas, cifras, sinDibujar } = datos;
  const chip = (activo: boolean) =>
    `inline-flex items-center min-h-11 px-4 rounded-full font-mono text-[13px] font-semibold border ${activo ? "bg-aviation-cyan text-noche border-aviation-cyan" : "border-white/15 text-zinc-400"}`;

  const cifrasVisibles = [
    { etiqueta: "Vuelos", valor: formatearNumero(cifras.vuelos) },
    { etiqueta: "Aeródromos", valor: formatearNumero(cifras.aerodromos) },
    { etiqueta: "Millas náuticas", valor: formatearNumero(cifras.distanciaNm) },
    { etiqueta: "Provincias", valor: formatearNumero(cifras.provincias.length) },
    { etiqueta: "Horas", valor: formatearNumero(cifras.horas, 1) },
  ];
  const avisos: string[] = [];
  if (sinDibujar.vuelos > 0)
    avisos.push(
      `${sinDibujar.vuelos} ${sinDibujar.vuelos === 1 ? "vuelo sin dibujar" : "vuelos sin dibujar"}: no reconocimos el aeródromo${sinDibujar.codigos.length ? ` (${sinDibujar.codigos.slice(0, 6).join(", ")}${sinDibujar.codigos.length > 6 ? "…" : ""})` : ""}.`
    );
  else if (sinDibujar.codigos.length > 0)
    avisos.push(`No reconocimos ${sinDibujar.codigos.length === 1 ? "este aeródromo y no se dibuja" : "estos aeródromos y no se dibujan"}: ${sinDibujar.codigos.slice(0, 6).join(", ")}${sinDibujar.codigos.length > 6 ? "…" : ""}.`);
  if (sinDibujar.sinRuta > 0) avisos.push(`${sinDibujar.sinRuta} ${sinDibujar.sinRuta === 1 ? "vuelo no tiene" : "vuelos no tienen"} ruta escrita.`);

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {cabecera}

      {opciones.anios.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Todavía no hay vuelos en tu bitácora para dibujar. Cuando registres el primero, va a aparecer acá.</p>
      ) : (
        <>
          <div className="space-y-4">
            <nav aria-label="Año" className="flex flex-wrap gap-2">
              <Link href={urlDelMapa({ ...filtros, anio: null })} aria-current={filtros.anio === null ? "page" : undefined} className={chip(filtros.anio === null)}>
                Todos los años
              </Link>
              {opciones.anios.map((a) => (
                <Link key={a} href={urlDelMapa({ ...filtros, anio: a })} aria-current={filtros.anio === a ? "page" : undefined} className={chip(filtros.anio === a)}>
                  {a}
                </Link>
              ))}
            </nav>
            {opciones.aviones.length > 0 && (
              <nav aria-label="Avión" className="flex flex-wrap gap-2">
                <Link href={urlDelMapa({ ...filtros, avionId: null })} aria-current={filtros.avionId === null ? "page" : undefined} className={chip(filtros.avionId === null)}>
                  Todos los aviones
                </Link>
                {opciones.aviones.map((a) => (
                  <Link key={a.id} href={urlDelMapa({ ...filtros, avionId: a.id })} aria-current={filtros.avionId === a.id ? "page" : undefined} className={chip(filtros.avionId === a.id)} title={a.tipo}>
                    {a.matricula || a.tipo}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-5 lg:border-t lg:border-white/10 lg:pt-6">
            {cifrasVisibles.map((c) => (
              <div key={c.etiqueta}>
                <dt className={ROTULO}>{c.etiqueta}</dt>
                <dd className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums">{c.valor}</dd>
              </div>
            ))}
          </dl>
          {cifras.provincias.length > 0 && <p className="text-sm text-zinc-400 -mt-4">{cifras.provincias.join(" · ")}</p>}
          {avisos.length > 0 && (
            <div role="note" className="text-sm text-amber-200/90 space-y-1">
              {avisos.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </div>
          )}

          {aerodromos.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay vuelos con ese filtro, o ninguno tiene un aeródromo que podamos ubicar en el mapa.</p>
          ) : (
            <>
              <MapaCarreraMapa aerodromos={aerodromos} piernas={piernas} />
              <p className="text-xs text-zinc-500">Tocá un aeródromo para ver cuántas veces estuviste. Cuanto más grande el punto o más gruesa la línea, más veces.</p>

              <section aria-labelledby="mas-visitados" className="lg:border-t lg:border-white/10 lg:pt-9 space-y-4">
                <h2 id="mas-visitados" className={ROTULO}>Tus aeródromos más visitados</h2>
                <ol className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
                  {aerodromos.slice(0, 10).map((a) => (
                    <li key={a.codigo} className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2">
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-[13px] font-semibold text-aviation-cyan">{a.codigo}</span>{" "}
                        <span className="text-sm text-zinc-300">{a.nombre}</span>
                      </span>
                      <span className="font-mono text-[13px] text-zinc-400 shrink-0">{a.visitas} {a.visitas === 1 ? "vez" : "veces"}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="compartir-mapa" className="lg:border-t lg:border-white/10 lg:pt-9 space-y-6">
                <h2 id="compartir-mapa" className={ROTULO}>Compartir como imagen</h2>
                <CompartirMapa anio={filtros.anio} avionId={filtros.avionId} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

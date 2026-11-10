import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import type { PilotStatus } from "@/lib/pilot-status";
import type { Requisito } from "@/lib/pca-progress";

/**
 * El inicio en el escritorio (3.11.0, Federico, 2026-11-05): sin bento, como la landing. Un hero
 * con la carta de noche que contesta "¿puedo volar hoy?" con las horas totales al lado, y debajo
 * dos filas de dos columnas que terminan a la misma altura: el camino a la licencia y "¿cuánto te
 * queda?" (pack o saldo, según el piloto), y los últimos vuelos como fajas al lado de la lista
 * de chequeo.
 *
 * **Desde la 3.14.0 es también el inicio del teléfono** (Federico: "aplicá el nuevo diseño al
 * mobile, completamente"): el mismo contenido en una columna. El hero va de borde a borde de la
 * pantalla, las horas totales debajo del título, los requisitos de a tres, y las fajas de vuelo sin
 * la matrícula ni el modelo. En la app instalada el saludo ya está arriba (`TituloTelefono`), así
 * que el título dice sólo "Podés volar hoy."
 *
 * Todo llega calculado y escrito desde la página: acá no se formatea ninguna fecha (invariante 1).
 */

export interface FajaVuelo {
  id: string;
  /** "TRV", "LOC" o "SIM". */
  tipo: "TRV" | "LOC" | "SIM";
  fecha: string;
  ruta: string;
  matricula: string;
  modelo: string;
  horas: string;
}

export interface ItemChequeo {
  etiqueta: string;
  valor: string;
  tono: "ok" | "aviso" | "mal" | "neutro";
}

export type Queda =
  | { modo: "pack"; restan: number; total: number; detalle: string; alcanza: string | null; ritmo: number; poco: boolean }
  | { modo: "saldo"; saldo: number; saldoTexto: string; mes: string | null; porHora: string | null; alcanzaHoras: string | null };

interface Props {
  nombre: string;
  estado: PilotStatus | null;
  carrera: { total: number; vuelos: number; aterrizajes: number; noche: number } | null;
  licencia: { meta: "PPA" | "PCA"; seccion: string; requisitos: Requisito[]; faltan: number } | null;
  queda: Queda | null;
  fajas: FajaVuelo[];
  chequeo: ItemChequeo[];
  hrefPreparar: string;
}

/** Los nombres de los requisitos, cortos para que entren en una fila (el completo va en `title`). */
const CORTO: Record<string, string> = {
  total: "Total",
  pic: "Al mando",
  picTravesia: "Travesía",
  instrumentos: "Instrumentos",
  nocturno: "Noche",
  aterrizajesNocturnos: "Aterr. noche",
  dobleMando: "Doble mando",
  soloDiurno: "Solo diurno",
  soloTravesia: "Solo travesía",
  travesiaLarga: "150 NM",
  nocturnoInstruccion: "Noche",
};

const coma = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const TONO: Record<ItemChequeo["tono"], string> = { ok: "text-emerald-300", aviso: "text-amber-300", mal: "text-red-400", neutro: "text-zinc-400" };

export default function InicioEscritorio({ nombre, estado, carrera, licencia, queda, fajas, chequeo, hrefPreparar }: Props) {
  const vigente = estado?.estado === "vigente";
  const grave = estado?.estado === "inactividad_prolongada" || estado?.estado === "documento_vencido";
  const desconocido = !estado || estado.estado === "datos_no_disponibles" || estado.estado === "documento_faltante";
  const chip = vigente
    ? { texto: "Habilitado · RAAC 61", clase: "bg-emerald-400/10 border-emerald-400/35 text-emerald-300", punto: "bg-emerald-400" }
    : grave
      ? { texto: "No habilitado · RAAC 61", clase: "bg-red-500/10 border-red-500/35 text-red-300", punto: "bg-red-400" }
      : desconocido
        ? { texto: "Faltan datos", clase: "bg-white/5 border-white/15 text-zinc-300", punto: "bg-zinc-400" }
        : { texto: "Con limitaciones · RAAC 61", clase: "bg-amber-400/10 border-amber-400/35 text-amber-300", punto: "bg-amber-400" };

  return (
    <div className="flex flex-col">
      {/* Hero: la carta VFR de Baires de noche, de borde a borde de la columna. */}
      <section className="relative isolate -mt-4 -mx-4 px-4 pt-6 pb-8 lg:-mt-12 lg:mx-[calc((100%-(100vw-5rem))/2)] lg:px-[calc((100vw-5rem-100%)/2)] lg:pt-14 lg:pb-14 overflow-hidden">
        <img src="/landing/carta-noche.webp" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[62%_40%] opacity-40" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--color-noche)_0%,color-mix(in_oklab,var(--color-noche)_86%,transparent)_45%,color-mix(in_oklab,var(--color-noche)_55%,transparent)_100%)]" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-32 -z-10 bg-gradient-to-t from-noche to-transparent" />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 lg:gap-10 lg:flex-wrap">
          <div className="flex flex-col gap-4 lg:gap-5 max-w-2xl">
            <span className={`self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-[11px] uppercase tracking-[0.12em] ${chip.clase}`}>
              <span className={`w-[7px] h-[7px] rounded-full ${chip.punto}`} />
              {chip.texto}
            </span>
            {vigente ? (
              <h1 className="font-display font-bold lg:font-extrabold tracking-[-0.04em] lg:tracking-[-0.05em] leading-[0.95] lg:leading-[0.92] text-[34px] lg:text-[clamp(52px,6vw,84px)] text-balance">
                <span className="app:hidden">{nombre}, </span>
                <span className="text-aviation-cyan">
                  <span className="app:hidden">podés</span>
                  <span className="hidden app:inline">Podés</span> volar hoy.
                </span>
              </h1>
            ) : (
              <>
                <h1 className="app:hidden font-display font-bold lg:font-extrabold tracking-[-0.04em] lg:tracking-[-0.05em] leading-[0.95] lg:leading-[0.92] text-[34px] lg:text-[clamp(52px,6vw,84px)]">Hola, {nombre}.</h1>
                {estado && (
                  <p className={`font-display text-[22px] lg:text-3xl font-bold lg:font-extrabold tracking-[-0.03em] leading-tight text-balance ${grave ? "text-red-300" : desconocido ? "text-zinc-200" : "text-amber-300"}`}>
                    {estado.puede}
                  </p>
                )}
              </>
            )}
            <p className="text-[14px] lg:text-lg leading-relaxed text-zinc-400 text-pretty">
              {[estado?.detalle, estado && !vigente ? estado.paraVolver : null].filter(Boolean).join(" ")}
              {estado && <span className="font-mono text-sm text-zinc-500"> · RAAC {estado.seccion}</span>}
            </p>
            <div className="flex gap-3 flex-wrap pt-1 max-lg:[&>a]:flex-1 max-lg:[&>a]:justify-center">
              <Link href="/dashboard/log-flight" className="inline-flex items-center gap-2 px-5 lg:px-6 py-2.5 lg:py-3.5 rounded-full bg-aviation-cyan text-noche font-bold text-[13px] lg:text-sm hover:bg-sky-300 transition-colors">
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Registrar vuelo
              </Link>
              <Link href={hrefPreparar} className="inline-flex items-center gap-2 px-5 lg:px-6 py-2.5 lg:py-3.5 rounded-full border border-white/20 text-white font-semibold text-[13px] lg:text-sm hover:border-white/40 hover:bg-white/[0.04] transition-colors">
                Preparar un vuelo
              </Link>
            </div>
          </div>

          {carrera && carrera.total > 0 && (
            <Link href="/dashboard/summary" className="group flex flex-col items-start lg:items-end gap-2 lg:text-right max-lg:border-t max-lg:border-white/10 max-lg:pt-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 group-hover:text-zinc-300 transition-colors">Horas de vuelo · total</p>
              <p className="font-display font-bold lg:font-extrabold tracking-[-0.05em] lg:tracking-[-0.055em] leading-[0.85] text-[60px] lg:text-[112px] tabular-nums">
                {Math.floor(carrera.total)}
                <span className="text-aviation-cyan">,{coma(carrera.total).split(",")[1]}</span>
                <span className="text-xl lg:text-3xl text-zinc-500 tracking-normal ml-1.5 lg:ml-2">h</span>
              </p>
              <p className="flex gap-4 lg:gap-5 pt-2 font-mono text-[12px] lg:text-[13px] text-zinc-400 flex-wrap">
                <span><b className="text-white font-semibold">{carrera.vuelos}</b> vuelos</span>
                <span><b className="text-white font-semibold">{carrera.aterrizajes}</b> aterrizajes</span>
                <span><b className="text-white font-semibold">{coma(carrera.noche)}</b> h de noche</span>
              </p>
            </Link>
          )}
        </div>
      </section>

      {/* El camino a la licencia y "¿cuánto te queda?", en dos columnas parejas. */}
      {(licencia || queda) && (
        <div className={`grid gap-x-16 grid-cols-1 ${licencia && queda ? "lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]" : ""}`}>
          {licencia && (
            <section aria-label={`Camino a la ${licencia.meta}`} className="border-t border-white/10 py-6 lg:py-9 flex flex-col justify-between gap-4 lg:gap-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-[20px] lg:text-[30px] font-bold lg:font-extrabold tracking-[-0.02em] lg:tracking-[-0.03em]">Camino a la {licencia.meta}</h2>
                <span className="font-mono text-xs text-zinc-500">RAAC {licencia.seccion}</span>
              </div>
              <p className="text-[14px] lg:text-[15px] text-zinc-400">
                {licencia.faltan > 0 ? (
                  <>Te faltan <b className="text-white">{coma(licencia.faltan)} h</b> para cumplir los mínimos de horas.</>
                ) : (
                  <>Cumplís los mínimos de horas de la {licencia.meta}.</>
                )}
              </p>
              <div
                className="grid grid-cols-3 gap-x-5 gap-y-5 lg:gap-6 lg:[grid-template-columns:var(--columnas)]"
                style={{ "--columnas": `repeat(${Math.min(licencia.requisitos.length, 7)}, minmax(0, 1fr))` } as React.CSSProperties}
              >
                {licencia.requisitos.slice(0, 7).map((r) => {
                  const pct = r.objetivo > 0 ? Math.min(100, (r.actual / r.objetivo) * 100) : 0;
                  const listo = r.actual >= r.objetivo;
                  return (
                    <div key={r.clave} className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[12px] lg:text-[13px] text-zinc-400 truncate" title={r.label}>{CORTO[r.clave] ?? r.label}</span>
                      <span className="font-mono text-[13px] lg:text-[15px]">
                        {r.esHoras ? coma(r.actual) : r.actual}
                        <span className="text-zinc-600">/{r.objetivo}</span>
                      </span>
                      <div className="h-1 rounded-full bg-zinc-800 mt-0.5">
                        <div className={`h-1 rounded-full ${listo ? "bg-emerald-400" : "bg-aviation-cyan"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {queda && (
            <section aria-label="Cuánto te queda" className="border-t border-white/10 py-6 lg:py-9 flex flex-col justify-between gap-4 lg:gap-6">
              {queda.modo === "pack" ? (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-[20px] lg:text-[30px] font-bold lg:font-extrabold tracking-[-0.02em] lg:tracking-[-0.03em]">Tu pack</h2>
                    <span className="font-mono text-xs text-zinc-500 uppercase truncate">{queda.detalle}</span>
                  </div>
                  <p className="font-display text-[34px] lg:text-[52px] leading-[0.9] font-bold lg:font-extrabold tracking-[-0.04em] lg:tracking-[-0.045em]">
                    {coma(queda.restan)}
                    <span className="text-[15px] lg:text-lg text-zinc-500 tracking-normal ml-2">h te quedan de {coma(queda.total, 0)}</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="h-1 rounded-full bg-zinc-800">
                      <div className={`h-1 rounded-full ${queda.poco ? "bg-amber-400" : "bg-white"}`} style={{ width: `${queda.total > 0 ? Math.min(100, (queda.restan / queda.total) * 100) : 0}%` }} />
                    </div>
                    <p className="flex justify-between gap-3 font-mono text-xs text-zinc-400 uppercase">
                      <span className={queda.poco ? "text-amber-300" : undefined}>{queda.poco ? "Queda menos de 1 h" : `Ritmo ${coma(queda.ritmo)} h/mes`}</span>
                      <span>{queda.alcanza ? `Alcanza ~${queda.alcanza}` : "Sin vuelos este mes"}</span>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-[20px] lg:text-[30px] font-bold lg:font-extrabold tracking-[-0.02em] lg:tracking-[-0.03em]">Tu saldo</h2>
                    <span className="font-mono text-xs text-zinc-500 uppercase">{queda.saldo < 0 ? "En contra" : "Disponible"}</span>
                  </div>
                  <p className={`font-display text-[34px] lg:text-[52px] leading-[0.9] font-bold lg:font-extrabold tracking-[-0.04em] lg:tracking-[-0.045em] ${queda.saldo < 0 ? "text-red-400" : ""}`}>{queda.saldoTexto}</p>
                  <div className="flex flex-col gap-2 font-mono text-xs text-zinc-400 uppercase">
                    {queda.mes && <span>Este mes · {queda.mes}</span>}
                    {queda.porHora && (
                      <span>
                        A {queda.porHora} la hora
                        {queda.alcanzaHoras && <> · <span className="text-white">te alcanza para ~{queda.alcanzaHoras} h</span></>}
                      </span>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {/* Los últimos vuelos como fajas, al lado de la lista de chequeo: terminan a la misma altura. */}
      {(fajas.length > 0 || chequeo.length > 0) && (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-[18px] border-t border-white/10 pt-6 lg:pt-9">
          <div className="flex items-baseline justify-between gap-4 max-lg:order-1">
            <h2 className="font-display text-[20px] lg:text-[30px] font-bold lg:font-extrabold tracking-[-0.02em] lg:tracking-[-0.03em]">Últimos vuelos</h2>
            <Link href="/dashboard/history" className="inline-flex items-center gap-1.5 text-[13px] lg:text-sm font-semibold text-aviation-cyan hover:underline underline-offset-4">
              <span className="lg:hidden">Ver todo</span>
              <span className="max-lg:hidden">Ver la bitácora</span> <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <h2 className="font-display text-[20px] lg:text-[30px] font-bold lg:font-extrabold tracking-[-0.02em] lg:tracking-[-0.03em] max-lg:order-3 max-lg:mt-4">Lista de chequeo</h2>

          <div className="flex flex-col gap-2.5 max-lg:order-2">
            {fajas.map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/history?ver=${f.id}`}
                className="flex-1 min-h-11 lg:min-h-12 grid grid-cols-[40px_62px_minmax(0,1fr)_46px] lg:grid-cols-[56px_84px_minmax(0,1fr)_100px_minmax(0,90px)_64px] items-stretch rounded-[10px] bg-carbon border border-white/10 font-mono text-sm overflow-hidden hover:border-white/25 transition-colors"
              >
                <span className={`flex items-center justify-center text-[11px] font-bold tracking-[0.08em] ${f.tipo === "TRV" ? "bg-sky-400/10 text-aviation-cyan" : "bg-white/5 text-zinc-400"}`}>{f.tipo}</span>
                <span className="flex items-center px-2.5 lg:px-3.5 border-r border-white/10 text-zinc-500 text-[12px] lg:text-sm whitespace-nowrap">{f.fecha}</span>
                <span className="flex items-center px-2.5 lg:px-3.5 lg:border-r border-white/10 font-semibold truncate text-[12.5px] lg:text-sm">{f.ruta}</span>
                <span className="max-lg:hidden flex items-center px-3.5 border-r border-white/10 text-zinc-400">{f.matricula}</span>
                <span className="max-lg:hidden flex items-center px-3.5 border-r border-white/10 text-zinc-400 truncate">{f.modelo}</span>
                <span className="flex items-center justify-end px-2.5 lg:px-3.5 font-semibold text-[13px] lg:text-sm">{f.horas}</span>
              </Link>
            ))}
          </div>

          <div className="flex flex-col font-mono text-[12px] lg:text-sm border-y border-zinc-800 max-lg:order-4">
            {chequeo.map((c, i) => (
              <div key={c.etiqueta} className={`flex-1 min-h-11 lg:min-h-12 flex items-center gap-2.5 ${i < chequeo.length - 1 ? "border-b border-zinc-800" : ""}`}>
                <span className="uppercase">{c.etiqueta}</span>
                <span aria-hidden="true" className="flex-1 border-b-2 border-dotted border-zinc-700" />
                <span className={`uppercase ${TONO[c.tono]}`}>{c.valor}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

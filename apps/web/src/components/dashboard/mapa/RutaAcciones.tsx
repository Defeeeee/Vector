"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark, CloudOff, FileDown, FileText, Loader2, Printer, Trash2, X } from "lucide-react";
import type { Aircraft } from "@/types";
import type { PuntoResuelto } from "@/lib/resolucion-puntos";
import type { PilotoParaPlan } from "@/lib/formulario-plan";
import { crearPlan } from "@/actions/plan-de-vuelo";
import { borrarRuta, guardarRuta } from "@/actions/rutas";
import { formularioDesdePlanificador } from "@/components/dashboard/plan-de-vuelo/ArmarDesdePlanificador";
import { MAX_NOMBRE_RUTA, nombreSugerido, type RutaGuardada } from "@/lib/rutas-guardadas";
import { armarPiernera, nombrePiernera, type DatosPiernera } from "@/lib/piernera";
import { CAPAS_CARTAS, teselasDeRuta } from "@/lib/cartas-aip";

/**
 * Lo que se hace con una ruta del Mapa (3.13.0, Federico: "desde el mapa podemos mandarlo a que
 * llene el fpl?" y "guardar borradores en el mapa"):
 *
 * - **Armar el plan de vuelo**: el mismo puente que la planilla (`formularioDesdePlanificador`),
 *   con la duración sin viento como sugerencia, nunca llenada.
 * - **Guardar la ruta** con un nombre, en la base (`/rutas`): se arma en la compu y se vuela con
 *   el teléfono.
 * - **Tus rutas**: tocar una la carga; la ✕ la borra.
 * - La planilla con viento, para imprimir, sigue en `/dashboard/mapa/planilla`.
 */
export default function RutaAcciones({
  tokens,
  resueltos,
  aeronave,
  tasKt,
  altitudFt,
  distanciaNm,
  minutosSinViento,
  piloto,
  rutas,
  onRutas,
  onCargar,
  piernera,
  puntosRuta,
}: {
  tokens: string[];
  resueltos: (PuntoResuelto | null | undefined)[];
  aeronave: Aircraft | null;
  tasKt: number | null;
  altitudFt: number | null;
  distanciaNm: number;
  minutosSinViento: number | null;
  piloto: PilotoParaPlan;
  /** `null`: no se pudieron leer, y entonces no se ofrece guardar. */
  rutas: RutaGuardada[] | null;
  onRutas: (r: RutaGuardada[]) => void;
  onCargar: (r: RutaGuardada) => void;
  /** Lo que va en la piernera en PDF (3.15.0). */
  piernera: DatosPiernera;
  /** Los puntos ubicados de la ruta, para bajar sus cartas (el Mapa sin señal, 3.15.0). */
  puntosRuta: { lat: number; lon: number }[];
}) {
  const [armando, empezarArmar] = useTransition();
  const [guardando, empezarGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const hayRuta = tokens.length > 1;
  const textoRuta = tokens.join(" ");
  const yaGuardada = rutas?.find((r) => r.ruta === textoRuta) ?? null;

  const [bajando, setBajando] = useState(false);
  // La piernera se arma en el navegador (anda sin señal): pdf-lib se carga recién al tocar.
  const bajarPiernera = async () => {
    setBajando(true);
    setError(null);
    try {
      const { armarPdfPiernera } = await import("@/lib/piernera-pdf");
      const bytes = await armarPdfPiernera(armarPiernera(piernera));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = nombrePiernera(tokens);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("No se pudo armar la piernera.");
    } finally {
      setBajando(false);
    }
  };

  /*
    El Mapa sin señal (3.15.0): baja las teselas de las cartas del AIP (VFR y en ruta inferior)
    alrededor de la ruta; el service worker las guarda (`teselaGuardada`). El mapa base de OSM no
    se baja en masa (su política de uso no lo permite): se guarda lo que ya se miró.
  */
  const [bajandoCartas, setBajandoCartas] = useState<{ hechas: number; total: number } | null>(null);
  const [guardadas, setGuardadas] = useState<number | null>(null);
  const guardarSinSenal = async () => {
    const urls = CAPAS_CARTAS.filter((c) => c.id !== "sup").flatMap((c) => teselasDeRuta(c, puntosRuta));
    if (!urls.length) {
      setError("Esta ruta no tiene cartas del AIP para guardar (están las VFR de Baires y Córdoba y la en ruta inferior).");
      return;
    }
    setError(null);
    setGuardadas(null);
    setBajandoCartas({ hechas: 0, total: urls.length });
    let hechas = 0;
    let siguiente = 0;
    // De a seis: el VPS sirve las teselas desde el disco y no hace falta apurarlo.
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (siguiente < urls.length) {
          const u = urls[siguiente++];
          await fetch(u).catch(() => undefined);
          hechas++;
          if (hechas % 10 === 0 || hechas === urls.length) setBajandoCartas({ hechas, total: urls.length });
        }
      })
    );
    setBajandoCartas(null);
    setGuardadas(urls.length);
  };

  const armar = () =>
    empezarArmar(async () => {
      setError(null);
      const tas = aeronave?.cruise_tas_kt ?? tasKt ?? 0;
      const r = await crearPlan(
        formularioDesdePlanificador({
          codigos: tokens,
          resueltos: resueltos.map((x) => x ?? null),
          aeronave,
          tasKt: tas,
          // La velocidad va al plan sólo si es la del avión: la que se tipea en el Mapa es una prueba.
          tasEstimada: !aeronave?.cruise_tas_kt,
          altitudFt,
          minutosTotales: minutosSinViento,
          distanciaNm,
          litros: 0,
          consumoLh: aeronave?.fuel_burn_lph ?? 0,
          // Sin el combustible a bordo no hay autonomía que sugerir: se carga en el plan.
          consumoEstimado: true,
          piloto,
          motivoEet: `${Math.round(distanciaNm)} NM a ${Math.round(tas)} kt, sin viento (del Mapa)`,
        })
      );
      if (r && "error" in r) setError(r.error);
    });

  const guardar = () =>
    empezarGuardar(async () => {
      setError(null);
      const n = (nombre ?? "").trim() || nombreSugerido(tokens);
      const r = await guardarRuta({ nombre: n, ruta: textoRuta, aircraftId: aeronave?.id ?? null });
      if ("error" in r) return setError(r.error);
      onRutas([r.ruta, ...(rutas ?? [])]);
      setNombre(null);
    });

  const borrar = (id: string) =>
    empezarGuardar(async () => {
      setError(null);
      const r = await borrarRuta(id);
      if ("error" in r) return setError(r.error);
      onRutas((rutas ?? []).filter((x) => x.id !== id));
    });

  return (
    <section className="space-y-3">
      {hayRuta && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={armar}
            disabled={armando}
            className="bg-aviation-cyan text-noche hover:bg-sky-300 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold disabled:opacity-60 rounded-full"
          >
            {armando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Armar el plan de vuelo
          </button>
          {rutas !== null &&
            (yaGuardada ? (
              <span className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-[13px] font-semibold text-zinc-500">
                <Bookmark className="w-4 h-4" fill="currentColor" /> Guardada
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setNombre(nombreSugerido(tokens))}
                disabled={nombre !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-[13px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-60"
              >
                <Bookmark className="w-4 h-4" /> Guardar la ruta
              </button>
            ))}
        </div>
      )}

      {nombre !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, MAX_NOMBRE_RUTA))}
            aria-label="Nombre de la ruta"
            className="flex-1 min-w-0 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-aviation-blue/40"
          />
          <button type="submit" disabled={guardando} className="rounded-xl bg-aviation-blue text-white px-3 py-2 text-sm font-semibold disabled:opacity-60">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </button>
          <button type="button" onClick={() => setNombre(null)} aria-label="Cancelar" className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {hayRuta && (
        <button
          type="button"
          onClick={bajarPiernera}
          disabled={bajando}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-[13px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-60"
        >
          {bajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Piernera en PDF
        </button>
      )}

      {hayRuta && (
        <div>
          <button
            type="button"
            onClick={guardarSinSenal}
            disabled={bajandoCartas !== null}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-zinc-200 dark:border-white/10 px-3 py-2.5 text-[13px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-60"
          >
            {bajandoCartas ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudOff className="w-4 h-4" />}
            {bajandoCartas ? `Guardando las cartas ${bajandoCartas.hechas}/${bajandoCartas.total}` : "Guardar las cartas para volar sin señal"}
          </button>
          <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
            {guardadas !== null
              ? `Listo: ${guardadas} teselas de las cartas del AIP guardadas alrededor de la ruta. `
              : "Las cartas del AIP alrededor de la ruta (5 NM). "}
            El mapa de fondo se guarda a medida que lo mirás: recorré la ruta en el mapa antes de salir.
          </p>
        </div>
      )}

      {hayRuta && (
        <Link
          href={`/dashboard/mapa/planilla?ruta=${encodeURIComponent(tokens.join("-"))}${aeronave ? `&av=${aeronave.id}` : ""}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-aviation-blue hover:underline"
        >
          <Printer className="w-3.5 h-3.5" /> Planilla con viento y combustible, para imprimir
        </Link>
      )}

      {rutas && rutas.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Tus rutas</p>
          <ul className="space-y-px">
            {rutas.map((r) => (
              <li key={r.id} className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 ${r.ruta === textoRuta ? "bg-aviation-blue/10" : "hover:bg-zinc-50 dark:hover:bg-white/5"}`}>
                <button type="button" onClick={() => onCargar(r)} className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{r.nombre}</span>
                  <span className="block font-mono text-[11px] text-zinc-500 truncate">{r.ruta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => borrar(r.id)}
                  disabled={guardando}
                  aria-label={`Borrar ${r.nombre}`}
                  className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-white/10 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

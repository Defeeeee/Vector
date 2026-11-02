import { openingTotals } from "@/lib/summary";
import { idsDeSimuladores, separarSimuladores } from "@/lib/simulador";
import { nightLandingsOf } from "@/lib/landings";
import type { Aircraft, Flight, Logbook } from "@/types";

/**
 * El resumen de horas de un período: lo que el copiloto manda en PDF cuando el piloto le
 * pide "mis horas del año" o "el resumen de septiembre" (`resumen-horas-pdf.ts`).
 *
 * Las mismas reglas que el resto de Vector:
 * - un simulador no es vuelo (invariante 4): va aparte, con sus horas de simulador;
 * - las horas de apertura no tienen fecha (invariante 5): suman sólo al resumen de toda la
 *   bitácora, nunca al de un período, y se muestran aparte.
 *
 * Puro.
 */
export interface PeriodoResumen {
  /** "YYYY-MM-DD", inclusive. Sin `desde` ni `hasta`: toda la bitácora. */
  desde?: string | null;
  hasta?: string | null;
}

export interface CeldasDeTiempo {
  aerodromoDia: number;
  aerodromoNoche: number;
  travesiaDia: number;
  travesiaNoche: number;
}

export interface ResumenDeHoras {
  desde: string | null;
  hasta: string | null;
  vuelos: number;
  /** Tiempos de vuelo de los vuelos del período, sin simuladores ni apertura. */
  horas: number;
  aterrizajes: number;
  /** Al mando, con la regla de `nightLandingsOf`: un vuelo mixto cuenta uno. */
  aterrizajesNoche: number;
  piloto: CeldasDeTiempo;
  copiloto: CeldasDeTiempo;
  instrumentos: number;
  capota: number;
  simulador: { sesiones: number; horas: number };
  porAvion: { matricula: string; tipo: string; vuelos: number; horas: number }[];
  porFinalidad: { finalidad: string; vuelos: number; horas: number }[];
  /** Las horas de apertura de los libros: sólo en el resumen de toda la bitácora. */
  apertura: number | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function resumenDeHoras(
  vuelos: Flight[],
  aviones: Aircraft[],
  libros: Logbook[],
  periodo: PeriodoResumen = {},
  opciones: { alumno?: boolean } = {}
): ResumenDeHoras {
  const desde = periodo.desde?.slice(0, 10) || null;
  const hasta = periodo.hasta?.slice(0, 10) || null;
  const delPeriodo = vuelos.filter((f) => {
    const d = (f.date ?? "").slice(0, 10);
    return (!desde || d >= desde) && (!hasta || d <= hasta);
  });
  const { volados, simulados } = separarSimuladores(delPeriodo, idsDeSimuladores(aviones));
  const suma = (fn: (f: Flight) => number, vs: Flight[] = volados) => r1(vs.reduce((t, f) => t + n(fn(f)), 0));

  const porId = new Map(aviones.map((a) => [a.id, a]));
  const avion = new Map<string, { matricula: string; tipo: string; vuelos: number; horas: number }>();
  const finalidad = new Map<string, { finalidad: string; vuelos: number; horas: number }>();
  for (const f of volados) {
    const a = f.aircraft_id ? porId.get(f.aircraft_id) : undefined;
    const clave = a?.registration ?? "Sin avión";
    const fila = avion.get(clave) ?? { matricula: clave, tipo: a?.icao || a?.type || "", vuelos: 0, horas: 0 };
    fila.vuelos++;
    fila.horas = r1(fila.horas + n(f.duration));
    avion.set(clave, fila);
    const p = (f.purpose || "VP").toUpperCase();
    const fp = finalidad.get(p) ?? { finalidad: p, vuelos: 0, horas: 0 };
    fp.vuelos++;
    fp.horas = r1(fp.horas + n(f.duration));
    finalidad.set(p, fp);
  }
  const porHoras = <T extends { horas: number }>(xs: T[]) => xs.sort((a, b) => b.horas - a.horas);

  const todaLaBitacora = !desde && !hasta;
  const apertura = todaLaBitacora ? r1(openingTotals(libros, { alumno: opciones.alumno }).totalHours) : 0;

  return {
    desde,
    hasta,
    vuelos: volados.length,
    horas: suma((f) => f.duration),
    aterrizajes: suma((f) => f.landings),
    aterrizajesNoche: suma(nightLandingsOf),
    piloto: {
      aerodromoDia: suma((f) => f.pic_day_loc ?? 0),
      aerodromoNoche: suma((f) => f.pic_night_loc ?? 0),
      travesiaDia: suma((f) => f.pic_day_tra ?? 0),
      travesiaNoche: suma((f) => f.pic_night_tra ?? 0),
    },
    copiloto: {
      aerodromoDia: suma((f) => f.sic_day_loc ?? 0),
      aerodromoNoche: suma((f) => f.sic_night_loc ?? 0),
      travesiaDia: suma((f) => f.sic_day_tra ?? 0),
      travesiaNoche: suma((f) => f.sic_night_tra ?? 0),
    },
    instrumentos: suma((f) => n(f.imc_pil) + n(f.imc_cop)),
    capota: suma((f) => f.capota ?? 0),
    simulador: { sesiones: simulados.length, horas: suma((f) => n(f.sim_pil_en_inst) + n(f.sim_instructor), simulados) },
    porAvion: porHoras([...avion.values()]),
    porFinalidad: porHoras([...finalidad.values()]),
    apertura: apertura > 0 ? apertura : null,
  };
}

/** "2026-09-01" → "01/09/2026". */
export function fechaArgentina(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Cómo se nombra el período en el PDF y en el mensaje. */
export function nombreDelPeriodo(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return "Toda la bitácora";
  if (desde && hasta) return `Del ${fechaArgentina(desde)} al ${fechaArgentina(hasta)}`;
  return desde ? `Desde el ${fechaArgentina(desde)}` : `Hasta el ${fechaArgentina(hasta!)}`;
}

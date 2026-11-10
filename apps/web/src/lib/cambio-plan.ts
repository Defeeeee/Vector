import type { FormularioPlan } from "./formulario-plan";
import { eobtVigente, type Demora } from "./demora-plan";
import { nombreDelArchivo, type PlanOaci } from "./plan-de-vuelo";

/**
 * La modificación (CHG) de un plan de vuelo presentado (3.15.1).
 *
 * AIP ENR 1.10, punto 6 (AIRAC AMDT 2/2025, leído del PDF el 2026-11-10):
 * - 6.1: "Si hubiese cambios en el FPL presentado con respecto a la autonomía de vuelo o el
 *   número total de personas transportadas a bordo, u otras modificaciones de importancias,
 *   deben rectificarse en el plan de vuelo o presentar un mensaje de modificación (CHG) a la
 *   Oficina ARO/AIS como mínimo hasta 15 minutos antes de la Hora de Fuera de Calzos."
 * - 6.2: "La cantidad máxima de presentaciones de CHG en la Oficina ARO/AIS es de tres (3)
 *   formularios por vuelo."
 * - 6.4: los CHG "solo son aplicables a cambios en planes de vuelo que aún no hayan recibido
 *   autorización ATC"; con autorización, "por radiotelefonía directamente a la dependencia ATC".
 * - El formulario es el del Apéndice 3 (ENR 1.10-39, `plan-de-vuelo-chg.png`): las casillas 7,
 *   13, 16 y 18 del plan presentado y la **22, ENMIENDA**, con lo que cambia.
 *
 * **La casilla 22 no la explica la AIP**: es el campo 22 del Doc 4444 de OACI (Apéndice 3), el
 * número de la casilla, una barra y el dato nuevo entero de esa casilla ("19/E/0430 P/3"), y
 * cada una más separada por un guion. El Doc 4444 no está en el repo: Vector arma la línea y el
 * piloto la ve y la corrige antes de mandarla.
 *
 * Puro: la hora actual entra como parámetro.
 */

export const MAXIMO_CAMBIOS = 3;
/** Minutos antes de la EOBT hasta los que se presenta una CHG (6.1). */
export const ANTICIPACION_CAMBIO_MINUTOS = 15;

/** Las casillas que una CHG puede cambiar, con lo que el piloto reconoce de cada una. */
export const CASILLAS_CHG = [
  { n: "19", nombre: "Autonomía y personas a bordo" },
  { n: "15", nombre: "Velocidad, nivel y ruta" },
  { n: "16", nombre: "Destino, duración y alternativa" },
  { n: "18", nombre: "Otros datos" },
  { n: "8", nombre: "Reglas y tipo de vuelo" },
  { n: "9", nombre: "Aeronave" },
  { n: "10", nombre: "Equipo" },
] as const;

export type CasillaChg = (typeof CASILLAS_CHG)[number]["n"];

export interface CambioCasilla {
  casilla: CasillaChg;
  dato: string;
}

/** El dato de una casilla como está en el plan presentado, para partir de ahí. */
export function datoDeCasilla(p: PlanOaci, n: CasillaChg): string {
  switch (n) {
    case "8":
      return `${p.c8reglas}${p.c8tipo}`;
    case "9":
      return `${p.c9numero}${p.c9tipo}/${p.c9estela}`;
    case "10":
      return `${p.c10a}/${p.c10b}`;
    case "15":
      return `${p.c15velocidad}${p.c15nivel} ${p.c15ruta}`.trim();
    case "16": {
      const altn = [p.c16altn1, p.c16altn2].filter(Boolean).join(" ");
      return `${p.c16ad}${p.c16eet}${altn ? ` ${altn}` : ""}`;
    }
    case "18":
      return p.c18;
    case "19":
      return [p.c19.autonomia ? `E/${p.c19.autonomia}` : "", p.c19.personas ? `P/${p.c19.personas}` : ""].filter(Boolean).join(" ");
  }
}

/** La casilla 22: "19/E/0430 P/3 -15/N0100VFR DCT". Sin cambios con dato, vacía. */
export function enmienda(cambios: CambioCasilla[]): string {
  return cambios
    .map((c) => ({ ...c, dato: c.dato.trim().toUpperCase().replace(/\s+/g, " ") }))
    .filter((c) => c.dato)
    .map((c, i) => `${i ? "-" : ""}${c.casilla}/${c.dato}`)
    .join(" ");
}

/** Cuántas CHG ya se mandaron a la oficina (6.2): las anotadas en los envíos del plan. */
export function cambiosMandados(envios: { modo: string; tipo?: string }[]): number {
  return envios.filter((e) => e.modo === "aro" && e.tipo === "chg").length;
}

export function revisarCambio(
  f: FormularioPlan,
  demoras: Demora[],
  mandados: number,
  ahoraIso: string
): { error: string | null; aviso: string | null } {
  if (mandados >= MAXIMO_CAMBIOS) {
    return { error: "Ya mandaste tres modificaciones: es el máximo por vuelo (AIP ENR 1.10, 6.2). Presentá un plan nuevo.", aviso: null };
  }
  const vigente = eobtVigente(f, demoras);
  if (!vigente) return { error: "El plan no tiene fecha y hora de salida.", aviso: null };
  const salida = Date.parse(`${vigente.dof}T${vigente.eobt.slice(0, 2)}:${vigente.eobt.slice(2)}:00Z`);
  if (Date.parse(ahoraIso) > salida - ANTICIPACION_CAMBIO_MINUTOS * 60_000) {
    return {
      error: null,
      aviso:
        "Faltan menos de 15 minutos para la salida (o ya pasó): la AIP pide la CHG hasta 15 minutos antes (ENR 1.10, 6.1). Si ya tenés autorización ATC, el cambio va por radio a la dependencia (6.4).",
    };
  }
  return { error: null, aviso: null };
}

/** `CHG-LVABC-SADF1930SADM_201026.pdf`: como el de la demora, con el plan vigente. */
export function nombreDeCambio(p: PlanOaci): string {
  return `CHG-${nombreDelArchivo(p)}`;
}

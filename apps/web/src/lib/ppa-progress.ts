/**
 * El camino a la PPA de un alumno piloto: RAAC 61.520(a), Edición VI (enero 2026).
 *
 * Texto, para avión (ver `docs/normativa/raac-61-secciones-citadas.md`):
 *
 * > (1) Un total de cuarenta (40) horas de instrucción y de vuelo solo si completó el
 * > curso en un CIAC Tipo II o III, o treinta y cinco (35) horas […] si completó un curso
 * > de instrucción integrado […] en un CIAC Tipo III, que deben incluir por lo menos:
 * > (i) Veinte (20) horas de instrucción en doble mando;
 * > (ii) diez (10) horas de vuelo solo diurno […] incluyendo cinco (5) horas de vuelo de
 * > travesía;
 * > (iii) un (1) vuelo de travesía de un mínimo de ciento cincuenta (150) millas náuticas
 * > […] durante el cual se habrán realizado dos (2) aterrizajes completos en dos (2)
 * > aeródromos diferentes;
 * > (iv) la instrucción […] en un dispositivo de instrucción para simulación de vuelo
 * > […] es aceptable hasta un máximo de cinco (5) horas.
 * > (v) Tres (3) horas de instrucción en vuelo nocturno, que incluya: […] (B) diez (10)
 * > despegues y diez (10) aterrizajes […].
 *
 * **Cómo se lee la bitácora de Vector para esto:**
 * - Doble mando es un vuelo con finalidad **INST** ("Recepción de instrucción"). Vuelo
 *   solo es cualquier otro vuelo real (no de simulador).
 * - Día y noche, local y travesía, salen de las columnas del desglose, como en el resto
 *   de la app (`lib/landings.ts`).
 * - La travesía de 150 NM con dos aterrizajes en dos aeródromos distintos se detecta por
 *   la ruta cargada: la distancia la mide quien llama (necesita las coordenadas de los
 *   aeródromos, que viven en el server) y la pasa como `travesiaLarga`.
 * - El simulador suma al total, con el tope de 5 h sobre el acumulado.
 *
 * Puro y sin fechas: se testea en node.
 */
import type { Aircraft, Flight, Logbook } from "@/types";
import type { Requisito } from "@/lib/pca-progress";
import { nightLandingsOf } from "@/lib/landings";
import { idsDeSimuladores, separarSimuladores } from "@/lib/simulador";
import { aperturaDelAlumno, horasDeAperturaPPA } from "@/lib/apertura-alumno";

export const HORAS_PPA = 40;
export const HORAS_PPA_CURSO_INTEGRADO = 35;
export const TOPE_SIMULADOR_PPA = 5;

const dia = (f: Flight) => (f.pic_day_loc || 0) + (f.pic_day_tra || 0) + (f.sic_day_loc || 0) + (f.sic_day_tra || 0);
const noche = (f: Flight) => (f.pic_night_loc || 0) + (f.pic_night_tra || 0) + (f.sic_night_loc || 0) + (f.sic_night_tra || 0);
const travesiaDiurna = (f: Flight) => (f.pic_day_tra || 0) + (f.sic_day_tra || 0);
const esInstruccion = (f: Flight) => (f.purpose || "").toUpperCase() === "INST";
const suma = (vuelos: Flight[], fn: (f: Flight) => number) => vuelos.reduce((acc, f) => acc + fn(f), 0);
const redondear = (n: number) => Math.round(n * 10) / 10;

export function requisitosPPA(
  todos: Flight[],
  {
    aircraft = [],
    logbooks = [],
    travesiaLarga = () => false,
  }: {
    aircraft?: Aircraft[];
    logbooks?: Logbook[];
    /** ¿Este vuelo es la travesía de 61.520(a)(1)(iii)? Ver el encabezado. */
    travesiaLarga?: (f: Flight) => boolean;
  } = {}
): Requisito[] {
  const { volados, simulados } = separarSimuladores(todos, idsDeSimuladores(aircraft));
  const dobleMando = volados.filter(esInstruccion);
  const solo = volados.filter((f) => !esInstruccion(f));

  const apertura = logbooks.reduce(
    (acc, l) =>
      acc +
      [l.opening_pic_day_loc, l.opening_pic_day_tra, l.opening_pic_night_loc, l.opening_pic_night_tra,
        l.opening_sic_day_loc, l.opening_sic_day_tra, l.opening_sic_night_loc, l.opening_sic_night_tra]
        .reduce<number>((s, v) => s + (Number(v) || 0), 0),
    0
  );
  const simulador = Math.min(suma(simulados, (f) => f.duration || 0), TOPE_SIMULADOR_PPA);
  // Las horas de antes del alumno, cada una en su requisito (`lib/apertura-alumno.ts`).
  const antes = aperturaDelAlumno(logbooks);

  return [
    {
      clave: "total", label: "Instrucción y vuelo solo", grupo: "pca", unidad: "hs", esHoras: true,
      nota: `${HORAS_PPA_CURSO_INTEGRADO} con curso integrado · simulador hasta ${TOPE_SIMULADOR_PPA} h`,
      actual: redondear(suma(volados, (f) => f.duration || 0) + simulador + apertura + horasDeAperturaPPA(antes)), objetivo: HORAS_PPA,
    },
    {
      clave: "dobleMando", label: "Doble mando", grupo: "pca", unidad: "hs", esHoras: true,
      nota: "vuelos con instructor",
      actual: redondear(suma(dobleMando, (f) => f.duration || 0) + antes.doble_mando), objetivo: 20,
    },
    {
      clave: "soloDiurno", label: "Vuelo solo diurno", grupo: "pca", unidad: "hs", esHoras: true,
      actual: redondear(suma(solo, dia) + antes.solo), objetivo: 10,
    },
    {
      clave: "soloTravesia", label: "Solo de travesía", grupo: "pca", unidad: "hs", esHoras: true,
      actual: redondear(suma(solo, travesiaDiurna) + antes.solo_travesia), objetivo: 5,
    },
    {
      clave: "travesiaLarga", label: "Travesía de 150 NM", grupo: "pca", unidad: "vuelo", esHoras: false,
      nota: "2 aterrizajes en 2 aeródromos distintos",
      actual: antes.travesia_larga || volados.some(travesiaLarga) ? 1 : 0, objetivo: 1,
    },
    {
      clave: "nocturnoInstruccion", label: "Instrucción nocturna", grupo: "pca", unidad: "hs", esHoras: true,
      actual: redondear(suma(dobleMando, noche) + antes.instruccion_nocturna), objetivo: 3,
    },
    {
      clave: "aterrizajesNocturnos", label: "Aterrizajes nocturnos", grupo: "pca", unidad: "atrr", esHoras: false,
      nota: "en instrucción nocturna",
      actual: suma(dobleMando, nightLandingsOf) + antes.aterrizajes_nocturnos, objetivo: 10,
    },
  ];
}

/** Lo que le falta del total de horas, para el número grande. */
export function horasQueFaltanPPA(requisitos: Requisito[]): number {
  const total = requisitos.find((r) => r.clave === "total");
  return total ? redondear(Math.max(0, total.objetivo - total.actual)) : HORAS_PPA;
}

/**
 * ¿Una ruta es la travesía de 150 NM con dos aterrizajes en dos aeródromos distintos?
 * Recibe las distancias ya medidas entre puntos consecutivos (`null` si un tramo no se
 * pudo medir, y entonces no se afirma nada) y los códigos de la ruta.
 */
export function cumpleTravesiaLarga(codigos: string[], tramosNm: (number | null)[], aterrizajes: number): boolean {
  if (tramosNm.some((t) => t === null)) return false;
  const distancia = (tramosNm as number[]).reduce((a, b) => a + b, 0);
  const distintos = new Set(codigos.slice(1)).size;
  return distancia >= 150 && aterrizajes >= 2 && distintos >= 2;
}

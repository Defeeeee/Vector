/**
 * Importar el libro de papel: la lógica pura (lotes, unir y deduplicar, aviones a crear).
 *
 * Un libro largo no entra en un solo pedido a Gemini: se lee de a poco, en segundo plano
 * (`lib/importar-libro-servidor.ts`), un PDF en tramos de 3 páginas y las fotos de a 4. Cada
 * lote se guarda al terminar, así que un deploy que corta el proceso se retoma desde el lote
 * donde quedó. Lo que falla se dice (invariante 2: no decir "listo" si faltó algo).
 */

import { esHora, horariosDelVuelo, normalizarHoraTipeada } from "./horarios";
import { alturaDelSol } from "./sol";

export const TAM_LOTE_PDF = 3;
export const TAM_LOTE_FOTOS = 4;
/** Tope por libro. */
export const TOPE_PAGINAS_PDF = 120;
export const TOPE_FOTOS = 80;
export const TOPE_BYTES_LIBRO = 60 * 1024 * 1024;

/** Hojas de un lote, contadas desde 1 y con los dos extremos incluidos. */
export interface Rango {
  desde: number;
  hasta: number;
}

/** Parte `total` hojas en lotes de `tam`: 10 de a 4 → 1-4, 5-8, 9-10. */
export function partirEnLotes(total: number, tam: number): Rango[] {
  const lotes: Rango[] = [];
  for (let d = 1; d <= total; d += tam) lotes.push({ desde: d, hasta: Math.min(total, d + tam - 1) });
  return lotes;
}

/** Los lotes que faltan leer, dados los índices (desde 0) que ya están guardados. */
export function lotesPendientes(lotes: Rango[], hechos: ReadonlySet<number>): number[] {
  return lotes.map((_, i) => i).filter((i) => !hechos.has(i));
}

/** "la hoja 5" o "las hojas 5 a 8". */
export function textoDeHojas(r: Rango): string {
  return r.desde === r.hasta ? `la hoja ${r.desde}` : `las hojas ${r.desde} a ${r.hasta}`;
}

/** Junta rangos que se tocan: 1-4 y 5-8 son 1-8. Ordenados. */
export function unirRangos(rangos: Rango[]): Rango[] {
  const orden = [...rangos].sort((a, b) => a.desde - b.desde);
  const salida: Rango[] = [];
  for (const r of orden) {
    const ult = salida[salida.length - 1];
    if (ult && r.desde <= ult.hasta + 1) ult.hasta = Math.max(ult.hasta, r.hasta);
    else salida.push({ ...r });
  }
  return salida;
}

/** "las hojas 9 a 12" / "las hojas 3 y 9 a 12" / "las hojas 1, 5 y 9 a 12". */
export function textoDeFallidos(rangos: Rango[]): string {
  const rs = unirRangos(rangos);
  if (rs.length === 0) return "";
  const parte = (r: Rango) => (r.desde === r.hasta ? `${r.desde}` : `${r.desde} a ${r.hasta}`);
  const lista = rs.map(parte);
  const unaSola = rs.length === 1 && rs[0].desde === rs[0].hasta;
  const cola = lista.length > 1 ? `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}` : lista[0];
  return `${unaSola ? "la hoja" : "las hojas"} ${cola}`;
}

/** El aviso para el piloto cuando algún lote no se pudo leer. */
export function avisoDeFallidos(rangos: Rango[]): string | null {
  if (rangos.length === 0) return null;
  return `No pudimos leer ${textoDeFallidos(rangos)}: volvé a probar con esas o subilas en fotos.`;
}

/** "Leyendo las hojas 5 a 8 de 40…". */
export function textoDeProgreso(lote: Rango, total: number): string {
  return `Leyendo ${textoDeHojas(lote)} de ${total}…`;
}

// --- Los vuelos leídos --------------------------------------------------------------------

export interface VueloLeido {
  date?: string;
  aircraft_registration?: string;
  /** Marca y modelo como figura en el libro ("Cessna 152"). */
  aircraft_model?: string;
  route?: string;
  duration?: number | string;
  takeoff?: string;
  landing?: string;
  landings?: number | string;
  purpose?: string;
  [campo: string]: unknown;
}

/** La matrícula como se compara: sin guiones ni espacios, en mayúsculas. */
export function normalizarMatricula(m: string | null | undefined): string {
  return (m ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Un renglón de simulador no tiene avión: matrícula vacía o "SIM…". */
export function esSimuladorLeido(m: string | null | undefined): boolean {
  const c = normalizarMatricula(m);
  return c === "" || c === "NA" || c.startsWith("SIM");
}

const hora = (h: unknown) => String(h ?? "").trim().replace(/^(\d):/, "0$1:");

/** Misma fecha, matrícula, salida y ruta: es el mismo vuelo. */
export function claveDeVuelo(v: VueloLeido): string {
  return [
    String(v.date ?? "").trim(),
    normalizarMatricula(v.aircraft_registration),
    hora(v.takeoff),
    String(v.route ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
  ].join("|");
}

/** Saca los repetidos (una hoja que cayó en dos lotes), conservando el primero y el orden. */
export function deduplicar<T extends VueloLeido>(vuelos: T[]): T[] {
  const vistos = new Set<string>();
  const salida: T[] = [];
  for (const v of vuelos) {
    const k = claveDeVuelo(v);
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push(v);
  }
  return salida;
}

/** Une los vuelos de cada lote, en el orden de las hojas, sin repetidos. */
export function unirLotes<T extends VueloLeido>(porLote: T[][]): T[] {
  return deduplicar(porLote.flat());
}

/** ¿Es una fila de totales y no un vuelo? ("Totales a la página siguiente"). */
export function esFilaDeTotales(v: VueloLeido): boolean {
  const t = `${v.aircraft_registration ?? ""} ${v.route ?? ""} ${v.purpose ?? ""}`.toLowerCase();
  return /total|p[aá]gina|suma y sigue|transporte/.test(t);
}

// --- La respuesta de Gemini ---------------------------------------------------------------

/**
 * Lee el arreglo de vuelos que contestó Gemini. Una respuesta cortada a la mitad (se acabó el
 * espacio) se recupera hasta el último vuelo completo; si no hay nada que rescatar, `null`
 * y quien llama dice un error claro, no "Unexpected token".
 */
export function parsearVuelos(texto: string): VueloLeido[] | null {
  const limpio = (texto ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const comoLista = (x: unknown): VueloLeido[] | null => {
    if (Array.isArray(x)) return x.filter((v): v is VueloLeido => !!v && typeof v === "object");
    if (x && typeof x === "object" && Array.isArray((x as { flights?: unknown }).flights)) return comoLista((x as { flights: unknown }).flights);
    return null;
  };
  try {
    return comoLista(JSON.parse(limpio));
  } catch {
    // Cortada: se vuelve al último objeto cerrado y se cierra el arreglo.
    const fin = limpio.lastIndexOf("}");
    if (fin < 0 || !limpio.startsWith("[")) return null;
    try {
      return comoLista(JSON.parse(`${limpio.slice(0, fin + 1)}]`));
    } catch {
      return null;
    }
  }
}

// --- Los aviones que no están en el Hangar -------------------------------------------------

/** Un avión del libro que no está en el Hangar, con lo que se leyó. */
export interface AvionNuevo {
  /** La matrícula normalizada: la identidad, no cambia aunque el piloto corrija el texto. */
  clave: string;
  registration: string;
  type: string;
  icao: string;
  type_acft: string | null;
  vuelos: number;
  /** Tildado = se agrega al importar. */
  crear: boolean;
  /** Un simulador leído sin matrícula: se agrega al Hangar marcado como simulador. */
  simulador?: boolean;
}

/**
 * El ICAO de los modelos comunes, **sólo si se reconoce con seguridad**: si el modelo es
 * ambiguo ("Cessna 172" puede ser C172 en cualquier variante, pero un "Piper" a secas no),
 * queda vacío y lo completa el piloto. La categoría de los monomotores terrestres también.
 */
// Los designadores, contra la lista oficial de OACI (Doc 8643, doc8643.icao.int, bajada el 2026-11-18):
// ojo que el Tecnam P2008 es P208, el P2002 es SIRA, el P92 es ECHO y el TB-10 es TOBA.
const MODELOS: { patron: RegExp; icao: string; categoria: string }[] = [
  // El designador escrito tal cual, como lo anotan muchos libros (y el CAD): C150, ECHO, B350…
  ...([["C150", "MONT-T"], ["C152", "MONT-T"], ["C172", "MONT-T"], ["C182", "MONT-T"], ["C206", "MONT-T"], ["C208", "MONT-T"], ["PA11", "MONT-T"], ["PA18", "MONT-T"],
    ["PA22", "MONT-T"], ["P28A", "MONT-T"], ["PA38", "MONT-T"], ["P208", "MONT-T"], ["SIRA", "MONT-T"], ["ECHO", "MONT-T"], ["ASTO", "MONT-T"], ["TWEN", "MONT-T"],
    ["TOBA", "MONT-T"], ["PA30", "MULT-T"], ["PA34", "MULT-T"], ["PA44", "MULT-T"], ["P06T", "MULT-T"], ["B350", "MULT-T"]] as const)
    .map(([icao, categoria]) => ({ patron: new RegExp(`^${icao}$`, "i"), icao, categoria })),
  { patron: /\b(?:cessna\s*)?150\b/i, icao: "C150", categoria: "MONT-T" },
  { patron: /\b(?:cessna\s*)?152\b/i, icao: "C152", categoria: "MONT-T" },
  { patron: /\b(?:cessna\s*)?172\b/i, icao: "C172", categoria: "MONT-T" },
  { patron: /\b(?:cessna\s*)?182\b/i, icao: "C182", categoria: "MONT-T" },
  { patron: /\b(?:cessna\s*)?206\b/i, icao: "C206", categoria: "MONT-T" },
  { patron: /\b(?:cessna\s*)?208\b/i, icao: "C208", categoria: "MONT-T" },
  { patron: /\bp\s*-?\s*2008\b/i, icao: "P208", categoria: "MONT-T" },
  { patron: /\bp\s*-?\s*2002\b|\bsierra\b/i, icao: "SIRA", categoria: "MONT-T" },
  { patron: /\bp\s*-?\s*92\b|\becho\b/i, icao: "ECHO", categoria: "MONT-T" },
  { patron: /\bastore\b/i, icao: "ASTO", categoria: "MONT-T" },
  { patron: /\bp\s*-?\s*2010\b/i, icao: "TWEN", categoria: "MONT-T" },
  { patron: /\bp\s*-?\s*2006\s*t?\b/i, icao: "P06T", categoria: "MULT-T" },
  { patron: /\bpa\s*-?\s*11\b/i, icao: "PA11", categoria: "MONT-T" },
  { patron: /\bpa\s*-?\s*18\b/i, icao: "PA18", categoria: "MONT-T" },
  { patron: /\bpa\s*-?\s*22\b|tri-?pacer/i, icao: "PA22", categoria: "MONT-T" },
  { patron: /\bpa\s*-?\s*28\b|cherokee|warrior|archer/i, icao: "P28A", categoria: "MONT-T" },
  { patron: /\bpa\s*-?\s*38\b|tomahawk/i, icao: "PA38", categoria: "MONT-T" },
  { patron: /\btb\s*-?\s*10\b|tobago/i, icao: "TOBA", categoria: "MONT-T" },
  { patron: /\bpa\s*-?\s*30\b|twin comanche/i, icao: "PA30", categoria: "MULT-T" },
  { patron: /\bpa\s*-?\s*34\b|seneca/i, icao: "PA34", categoria: "MULT-T" },
  { patron: /\bpa\s*-?\s*44\b|seminole/i, icao: "PA44", categoria: "MULT-T" },
  { patron: /king\s*air\s*350|\bb\s*-?\s*300\b/i, icao: "B350", categoria: "MULT-T" },
];

export function icaoDeModelo(modelo: string | null | undefined): { icao: string; type_acft: string } | null {
  const m = (modelo ?? "").trim();
  if (!m) return null;
  // Si el texto encaja con más de un modelo, no se sabe.
  const hallados = MODELOS.filter((x) => x.patron.test(m));
  const icaos = new Set(hallados.map((x) => x.icao));
  if (icaos.size !== 1) return null;
  return { icao: hallados[0].icao, type_acft: hallados[0].categoria };
}

/**
 * Las matrículas del libro que no están en el Hangar, cada una con su modelo más frecuente y
 * cuántos vuelos tiene. Los simuladores no son aviones. `hangar` son las matrículas ya cargadas.
 */
export function avionesNuevos(vuelos: VueloLeido[], hangar: string[]): AvionNuevo[] {
  const conocidas = new Set(hangar.map(normalizarMatricula));
  const porClave = new Map<string, { registration: string; cuenta: Map<string, number>; clases: Map<string, number>; regs: Map<string, number>; vuelos: number }>();
  for (const v of vuelos) {
    if (esSimuladorLeido(v.aircraft_registration)) continue;
    const clave = normalizarMatricula(v.aircraft_registration);
    if (conocidas.has(clave)) continue;
    const e = porClave.get(clave) ?? { registration: "", cuenta: new Map(), clases: new Map(), regs: new Map(), vuelos: 0 };
    e.vuelos++;
    const modelo = (v.aircraft_model ?? "").trim();
    // El lector a veces pone la clase (MONT-T) en el modelo: no es un modelo, pero dice la clase.
    if (esClase(modelo)) e.clases.set(modelo.toUpperCase(), (e.clases.get(modelo.toUpperCase()) ?? 0) + 1);
    else if (modelo) e.cuenta.set(modelo, (e.cuenta.get(modelo) ?? 0) + 1);
    const reg = String(v.aircraft_registration ?? "").trim().toUpperCase();
    e.regs.set(reg, (e.regs.get(reg) ?? 0) + 1);
    porClave.set(clave, e);
  }
  const masFrecuente = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return [...porClave.entries()]
    .map(([clave, e]) => {
      const type = masFrecuente(e.cuenta);
      const deducido = icaoDeModelo(type);
      return {
        clave,
        registration: masFrecuente(e.regs) || clave,
        type,
        icao: deducido?.icao ?? "",
        type_acft: deducido?.type_acft ?? (masFrecuente(e.clases) || null),
        vuelos: e.vuelos,
        crear: true,
      };
    })
    .sort((a, b) => b.vuelos - a.vuelos || a.clave.localeCompare(b.clave));
}

/** Lo que el vuelo necesita para poder importarse. */
export interface VueloParaAvion {
  aircraft_id: string;
  /** La clave del avión "a crear" al que está asignado, si lo está. */
  nuevo_clave?: string;
}

/** ¿Al vuelo le falta avión? Uno asignado a un avión a crear (tildado) no bloquea. */
export function vueloSinAvion(v: VueloParaAvion, aCrear: AvionNuevo[]): boolean {
  if (v.aircraft_id) return false;
  return !(v.nuevo_clave && aCrear.some((a) => a.clave === v.nuevo_clave && a.crear));
}

/** Los aviones a crear que el piloto dejó tildados y con matrícula. */
export function avionesATildados(aCrear: AvionNuevo[]): AvionNuevo[] {
  return aCrear.filter((a) => a.crear && normalizarMatricula(a.registration));
}

// ── Simuladores ──────────────────────────────────────────────────────────────────────────────────
// Un renglón sin matrícula leída es, casi siempre, una sesión de simulador: en el libro se anota
// el equipo por el lugar o el modelo ("ASG ASG" en un B350, "GEO SIMULADORES" en un C172) y el
// lector no encuentra una matrícula. Hasta la 3.49.1 esos renglones sólo dejaban elegir un avión
// del Hangar, y quien no tenía un simulador cargado no podía importar el libro.

/** La clave de un simulador leído, por su modelo: un equipo por modelo. */
export function claveDeSimulador(modelo: string | null | undefined): string {
  return `SIM-${normalizarMatricula(modelo) || "X"}`;
}

export interface EquipoDelHangar {
  id: string;
  registration: string;
  type?: string | null;
  is_simulator?: boolean | null;
}

/** El simulador del Hangar para ese modelo, si hay uno solo que encaja. */
export function simuladorDelHangar(modelo: string | null | undefined, hangar: EquipoDelHangar[]): string | undefined {
  const sims = hangar.filter((a) => a.is_simulator);
  const m = normalizarMatricula(modelo);
  const mismos = m ? sims.filter((a) => normalizarMatricula(a.type).includes(m)) : [];
  if (mismos.length === 1) return mismos[0].id;
  if (!m && sims.length === 1) return sims[0].id;
  return undefined;
}

/** Los simuladores del libro que no están en el Hangar: uno por modelo, con una matrícula a corregir. */
export function simuladoresNuevos(vuelos: VueloLeido[], hangar: EquipoDelHangar[]): AvionNuevo[] {
  const conocidas = new Set(hangar.map((a) => normalizarMatricula(a.registration)));
  const porClave = new Map<string, AvionNuevo>();
  for (const v of vuelos) {
    if (!esSimuladorLeido(v.aircraft_registration)) continue;
    const modelo = (v.aircraft_model ?? "").trim();
    if (simuladorDelHangar(modelo, hangar)) continue;
    const clave = claveDeSimulador(modelo);
    const leida = String(v.aircraft_registration ?? "").trim().toUpperCase();
    const registration = (leida.startsWith("SIM") ? leida : `SIM ${modelo.toUpperCase()}`.trim()).slice(0, 16);
    if (conocidas.has(normalizarMatricula(registration))) continue;
    const e = porClave.get(clave);
    if (e) { e.vuelos++; continue; }
    const deducido = icaoDeModelo(modelo);
    porClave.set(clave, { clave, registration, type: modelo, icao: deducido?.icao ?? "", type_acft: deducido?.type_acft ?? null, vuelos: 1, crear: true, simulador: true });
  }
  return [...porClave.values()].sort((a, b) => b.vuelos - a.vuelos || a.clave.localeCompare(b.clave));
}

export interface HorasDeFila {
  duration: number;
  pic_day_loc?: number; pic_day_tra?: number; pic_night_loc?: number; pic_night_tra?: number;
  sic_day_loc?: number; sic_day_tra?: number; sic_night_loc?: number; sic_night_tra?: number;
  imc_pil?: number; imc_cop?: number; capota?: number;
  sim_instructor?: number; sim_pil_en_inst?: number;
}

/**
 * Una fila importada que va a un simulador, como la guarda el formulario (`lib/simulador.ts`):
 * duración en cero y las horas en instrucción terrestre (piloto, salvo que el libro las tenga
 * como instructor). Lo demás de la fila no existe en una sesión de simulador.
 */
export function comoSesionDeSimulador<T extends HorasDeFila>(f: T): T {
  const pil = f.sim_pil_en_inst || (f.sim_instructor ? undefined : f.duration || undefined);
  return {
    ...f, duration: 0, sim_pil_en_inst: pil,
    pic_day_loc: undefined, pic_day_tra: undefined, pic_night_loc: undefined, pic_night_tra: undefined,
    sic_day_loc: undefined, sic_day_tra: undefined, sic_night_loc: undefined, sic_night_tra: undefined,
    imc_pil: undefined, imc_cop: undefined, capota: undefined,
  };
}

/** Qué le falta a una fila para poder guardarse (fecha y horarios), o null si está bien. */
export function problemaDeFila(f: { date: string; takeoff: string; landing: string }): string | null {
  const d = new Date(`${f.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f.date) return "la fecha";
  if (!esHora(normalizarHoraTipeada(f.takeoff)) || !esHora(normalizarHoraTipeada(f.landing))) return "el horario";
  return null;
}

const COLUMNAS_DESGLOSE = ["pic_day_loc", "pic_day_tra", "pic_night_loc", "pic_night_tra", "sic_day_loc", "sic_day_tra", "sic_night_loc", "sic_night_tra"] as const;

/** Las horas del desglose de un vuelo (piloto o copiloto, día o noche, local o travesía). */
export function sumaDesglose(v: Partial<Record<(typeof COLUMNAS_DESGLOSE)[number], unknown>>): number {
  return COLUMNAS_DESGLOSE.reduce((s, k) => s + (typeof v[k] === "number" ? (v[k] as number) : Number(v[k]) || 0), 0);
}

/** Un vuelo (no simulador) con duración y sin una sola hora en el desglose. */
export function sinDesglose(v: VueloLeido): boolean {
  return !esSimuladorLeido(v.aircraft_registration) && (Number(v.duration) || 0) > 0 && sumaDesglose(v as never) === 0;
}

/** Cuántos vuelos de una lectura traen desglose. */
export function conDesglose(vuelos: VueloLeido[]): number {
  return vuelos.filter((v) => sumaDesglose(v as never) > 0).length;
}

/** Si a la mitad o más de los vuelos del lote les falta el desglose: vale una segunda lectura. */
export function faltaDesglose(vuelos: VueloLeido[]): boolean {
  const aviones = vuelos.filter((v) => !esSimuladorLeido(v.aircraft_registration) && (Number(v.duration) || 0) > 0);
  return aviones.length > 0 && aviones.filter(sinDesglose).length * 2 >= aviones.length;
}

const NOMBRE_COLUMNA: Record<(typeof COLUMNAS_DESGLOSE)[number], string> = {
  pic_day_loc: "Piloto día local", pic_day_tra: "Piloto día travesía", pic_night_loc: "Piloto noche local", pic_night_tra: "Piloto noche travesía",
  sic_day_loc: "Copiloto día local", sic_day_tra: "Copiloto día travesía", sic_night_loc: "Copiloto noche local", sic_night_tra: "Copiloto noche travesía",
};

/** El desglose en palabras, para la revisión ("Piloto día local 1,2"). */
export function resumenDesglose(v: Record<string, unknown>): string {
  return COLUMNAS_DESGLOSE.filter((k) => Number(v[k]) > 0).map((k) => `${NOMBRE_COLUMNA[k]} ${String(Number(v[k])).replace(".", ",")}`).join(" · ");
}

/**
 * Lo que se propone, **a pedido del piloto**, para un vuelo que llegó sin desglose: todo como
 * piloto y de día; local si sale y llega al mismo lugar, travesía si no. Es una suposición y
 * la pantalla lo dice: un vuelo nocturno o de copiloto se corrige a mano (o en el libro).
 */
export function desgloseSupuesto(v: { route?: string; duration?: number | string }): Partial<Record<(typeof COLUMNAS_DESGLOSE)[number], number>> {
  const lugares = String(v.route ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const local = lugares.length < 2 || lugares[0] === lugares[lugares.length - 1];
  return { [local ? "pic_day_loc" : "pic_day_tra"]: Number(v.duration) || 0 };
}

/** La clase del libro (MONT-T, MULT-T, MONT-H, MULT-H), que el lector a veces confunde con el modelo. */
export function esClase(s: string | null | undefined): boolean {
  return /^(MONT|MULT)-?[TH]$/i.test((s ?? "").trim());
}

// ── Lo que el lector confunde, corregido con reglas que no dependen de él ─────────────────────────
// (Berni, 2026-11-18: la capota leída como horas de simulador, y vuelos de día leídos como nocturnos.)

const DIA_NOCHE: [string, string][] = [["pic_day_loc", "pic_night_loc"], ["pic_day_tra", "pic_night_tra"], ["sic_day_loc", "sic_night_loc"], ["sic_day_tra", "sic_night_tra"]];

/**
 * Corrige una fila leída:
 * - **Capota:** un avión de verdad no tiene horas de simulador. Si el lector las puso ahí y la capota
 *   está vacía, son de capota (el libro de ANAC tiene las dos columnas juntas, en la discriminación).
 * - **Día o noche:** si el sol estaba arriba del horizonte al despegar y al aterrizar, el vuelo fue de
 *   día con cualquier definición de noche, y lo leído como nocturno pasa a diurno. Al revés, con el sol
 *   a más de 6° bajo el horizonte en las dos puntas (pasado el crepúsculo civil), lo diurno pasa a
 *   nocturno. Un vuelo que cruza la puesta o la salida del sol no se toca: ahí manda lo leído.
 * `coordsDe` da [lat, lon] de un código de aeródromo (null si no se conoce).
 */
export function corregirLectura(v: VueloLeido, coordsDe: (cod: string) => [number, number] | null): VueloLeido & { correcciones?: string[] } {
  const out: VueloLeido & { correcciones?: string[] } = { ...v };
  const correcciones: string[] = [];
  const num = (k: string) => Number(out[k]) || 0;
  if (!esSimuladorLeido(v.aircraft_registration) && num("sim_pil_en_inst") > 0 && num("capota") === 0) {
    out.capota = num("sim_pil_en_inst");
    delete out.sim_pil_en_inst;
    correcciones.push("capota");
  }
  const noche = DIA_NOCHE.some(([, n]) => num(n) > 0), dia = DIA_NOCHE.some(([d]) => num(d) > 0);
  if ((noche || dia) && !(noche && dia)) {
    const lugares = String(v.route ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const desde = coordsDe(lugares[0] ?? "") ?? coordsDe(lugares[lugares.length - 1] ?? "");
    const hasta = coordsDe(lugares[lugares.length - 1] ?? "") ?? desde;
    if (desde && hasta && v.date && v.takeoff && v.landing) {
      try {
        const { takeoff_dt, landing_dt } = horariosDelVuelo(String(v.date), String(v.takeoff), String(v.landing));
        const a1 = alturaDelSol(new Date(takeoff_dt), ...desde), a2 = alturaDelSol(new Date(landing_dt), ...hasta);
        const pasar = (de: 0 | 1) => DIA_NOCHE.forEach((par) => {
          const [o, d] = [par[de], par[1 - de]];
          if (num(o) > 0) { out[d] = num(d) + num(o); delete out[o]; }
        });
        if (noche && a1 > 0 && a2 > 0) { pasar(1); correcciones.push("día"); }
        else if (dia && a1 < -6 && a2 < -6) { pasar(0); correcciones.push("noche"); }
      } catch {
        // un horario que no se entiende se revisa en la pantalla (`problemaDeFila`)
      }
    }
  }
  if (correcciones.length) out.correcciones = correcciones;
  return out;
}

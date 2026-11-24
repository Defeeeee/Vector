/**
 * El cotejo de las hojas leídas de una foto o de un PDF escaneado contra los totales escritos en
 * la misma hoja (Federico, 2026-11-24).
 *
 * Un piloto subió 8 fotos de su libro y le quedaron la mitad de las horas: Gemini se salteaba
 * renglones y nada lo notaba. El libro de ANAC trae al pie de cada hoja los "Totales página
 * anterior" y los "Totales a la página siguiente" (o el total de la página): con eso se sabe cuánto
 * tiene que sumar lo leído. Si no cierra, se relee la hoja (`leer-libro-gemini.ts`); si sigue sin
 * cerrar, el piloto lo ve antes de confirmar. Todo esto es puro y testeado.
 */
import { conDesglose, esFilaDeTotales, esSimuladorLeido, parsearVuelos, type VueloLeido } from "@/lib/importar-libro";

/** Una hoja leída: sus vuelos y lo que dicen sus totales (horas decimales), si se leen. */
export interface HojaLeida {
  /** La suma de horas de vuelo de esta hoja, si está escrita como fila propia. */
  total_hoja?: number | null;
  /** "Totales página anterior": lo que la hoja trae de antes. */
  total_anterior?: number | null;
  /** "Totales a la página siguiente" o "a la fecha": lo acumulado al terminar la hoja. */
  total_a_la_fecha?: number | null;
  /** Cuántos renglones de la hoja tienen un vuelo escrito (sin los de totales). */
  renglones?: number | null;
  vuelos: VueloLeido[];
}

/** La diferencia que se tolera entre lo leído y lo escrito: redondeos de décimas y de minutos. */
export const TOLERANCIA_HORAS = 0.15;

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x.replace(",", ".")) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Horas con coma decimal y una cifra: "11,4". */
export const horasConComa = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");

/** ¿Un renglón es una sesión de simulador? (Sin matrícula y con horas de simulador.) */
function esSimulador(v: VueloLeido): boolean {
  const sim = (num(v.sim_instructor) ?? 0) + (num(v.sim_pil_en_inst) ?? 0);
  return sim > 0 && esSimuladorLeido(v.aircraft_registration);
}

/** Los vuelos de verdad de la hoja: sin las filas de totales que Gemini a veces copia. */
export const vuelosDeHoja = (h: HojaLeida): VueloLeido[] => h.vuelos.filter((v) => !esFilaDeTotales(v));

/** Lo que suman las horas de vuelo leídas (los simuladores no van en las columnas de vuelo). */
export function sumaLeida(h: HojaLeida): number {
  return redondear(vuelosDeHoja(h).reduce((s, v) => s + (esSimulador(v) ? 0 : num(v.duration) ?? 0), 0));
}

/** Lo que la hoja dice que suma: su total o, si no está, lo acumulado menos lo que traía. */
export function totalEsperado(h: HojaLeida): number | null {
  const propio = num(h.total_hoja);
  if (propio !== null && propio > 0) return redondear(propio);
  const antes = num(h.total_anterior), despues = num(h.total_a_la_fecha);
  if (despues !== null && despues > 0) {
    const d = despues - (antes ?? 0);
    // Sin "página anterior" sólo vale si es la primera hoja del libro (acumulado chico): si no, el
    // acumulado de todo el libro no es lo de esta hoja.
    if (antes !== null || d <= 30) return d > 0 ? redondear(d) : null;
  }
  return null;
}

export type Cotejo =
  | { estado: "ok"; leido: number; esperado: number | null }
  | { estado: "no-coincide"; leido: number; esperado: number | null; renglones: number | null; leidos: number };

/** ¿Lo leído de la hoja cierra con sus totales y con la cantidad de renglones escritos? */
export function cotejarHoja(h: HojaLeida): Cotejo {
  const leido = sumaLeida(h);
  const esperado = totalEsperado(h);
  const leidos = vuelosDeHoja(h).length;
  const renglones = num(h.renglones);
  const faltanRenglones = renglones !== null && renglones > leidos;
  const noSuma = esperado !== null && Math.abs(leido - esperado) > TOLERANCIA_HORAS;
  return faltanRenglones || noSuma ? { estado: "no-coincide", leido, esperado, renglones: renglones === null ? null : Math.round(renglones), leidos } : { estado: "ok", leido, esperado };
}

/** Lo que se le dice al piloto de una hoja que no cierra ("Foto 3: …"). */
export function textoDeCotejo(nombre: string, c: Cotejo): string | null {
  if (c.estado === "ok") return null;
  const partes: string[] = [];
  if (c.esperado !== null && Math.abs(c.leido - c.esperado) > TOLERANCIA_HORAS) partes.push(`los vuelos leídos suman ${horasConComa(c.leido)} h y la hoja dice ${horasConComa(c.esperado)} h`);
  if (c.renglones !== null && c.renglones > c.leidos) partes.push(`leímos ${c.leidos} de los ${c.renglones} vuelos escritos`);
  return `${nombre}: ${partes.join(", y ")}. Revisá esa hoja antes de importar: agregá o corregí lo que falte.`;
}

/** Lo que se le agrega al prompt para releer una hoja que no cerró. */
export function pedidoDeRelectura(hojas: HojaLeida[]): string {
  const lineas = hojas.map((h, i) => {
    const c = cotejarHoja(h);
    if (c.estado === "ok") return null;
    const nombre = hojas.length > 1 ? `En la hoja ${i + 1} leíste` : "Leíste";
    const total = c.esperado !== null ? `, pero sus totales escritos dan ${horasConComa(c.esperado)} h` : "";
    const renglones = c.renglones !== null && c.renglones > c.leidos ? ` y la hoja tiene ${c.renglones} renglones con vuelos` : "";
    return `${nombre} ${c.leidos} vuelos que suman ${horasConComa(c.leido)} h${total}${renglones}.`;
  }).filter(Boolean);
  if (!lineas.length) return "";
  return `

ATENCIÓN: esta es una segunda lectura. ${lineas.join(" ")}
Faltan o sobran vuelos. Volvé a leer la hoja renglón por renglón, de arriba abajo, sin saltear ninguno (incluidos los de letra chica, con tachones o cerca del borde o del doblez), con el año correcto, y comprobá que la suma de las duraciones dé el total de la hoja antes de contestar.`;
}

/** Puntaje de una lectura: primero las hojas que cierran, después cuánto se acerca, después el desglose. */
function puntaje(hojas: HojaLeida[]): [number, number, number, number] {
  let ok = 0, distancia = 0;
  for (const h of hojas) {
    const c = cotejarHoja(h);
    if (c.estado === "ok") ok++;
    if (c.esperado !== null) distancia += Math.abs(c.leido - c.esperado);
    if (c.estado === "no-coincide" && c.renglones !== null) distancia += Math.max(0, c.renglones - c.leidos) * 0.5;
  }
  const vuelos = hojas.flatMap(vuelosDeHoja);
  return [ok, -distancia, conDesglose(vuelos), vuelos.length];
}

/** De dos lecturas de las mismas hojas, la mejor (empate: la primera). */
export function mejorLectura(a: HojaLeida[], b: HojaLeida[]): HojaLeida[] {
  const pa = puntaje(a), pb = puntaje(b);
  for (let i = 0; i < pa.length; i++) {
    if (pb[i] > pa[i] + 1e-9) return b;
    if (pb[i] < pa[i] - 1e-9) return a;
  }
  return a;
}

/** ¿La lectura necesita otra vuelta? (Alguna hoja no cierra.) */
export const hayHojasQueNoCierran = (hojas: HojaLeida[]) => hojas.some((h) => cotejarHoja(h).estado !== "ok");

/**
 * Lee la respuesta de Gemini: `{ hojas: [...] }`. Acepta también la forma vieja (un arreglo de
 * vuelos o `{ flights }`), como una sola hoja sin totales. Una respuesta cortada se recupera
 * hasta donde se pueda (`parsearVuelos`).
 */
export function parsearHojas(texto: string): HojaLeida[] | null {
  const limpio = (texto ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const x = JSON.parse(limpio) as unknown;
    if (x && typeof x === "object" && !Array.isArray(x) && Array.isArray((x as { hojas?: unknown }).hojas)) {
      return ((x as { hojas: unknown[] }).hojas)
        .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
        .map((h) => ({
          total_hoja: num(h.total_hoja),
          total_anterior: num(h.total_anterior),
          total_a_la_fecha: num(h.total_a_la_fecha),
          renglones: num(h.renglones),
          vuelos: Array.isArray(h.vuelos) ? (h.vuelos as unknown[]).filter((v): v is VueloLeido => !!v && typeof v === "object") : [],
        }));
    }
  } catch {
    // Cortada: se cae a rescatar los vuelos.
  }
  const vuelos = parsearVuelos(limpio) ?? rescatarVuelosDeHojas(limpio);
  return vuelos ? [{ vuelos }] : null;
}

/** Una respuesta `{ hojas: [{ …, vuelos: [ … ] }] }` cortada: los vuelos completos que haya. */
function rescatarVuelosDeHojas(texto: string): VueloLeido[] | null {
  const i = texto.indexOf('"vuelos"');
  if (i < 0) return null;
  const desde = texto.indexOf("[", i);
  return desde < 0 ? null : parsearVuelos(texto.slice(desde));
}

/** Lo que se guarda de cada hoja para mirar el libro entero al final. */
export interface ResumenHoja {
  nombre: string;
  anterior: number | null;
  a_la_fecha: number | null;
}

export const resumenDeHoja = (nombre: string, h: HojaLeida): ResumenHoja => ({
  nombre,
  anterior: num(h.total_anterior),
  a_la_fecha: num(h.total_a_la_fecha),
});

/**
 * Lo que se ve mirando todas las hojas juntas:
 * - **una hoja que falta**: una termina con X h a la fecha y la siguiente que se subió arranca con
 *   más (no se subió la del medio);
 * - **horas de antes**: el libro arranca con horas de un libro anterior que no son vuelos de estas
 *   hojas; van en "Tus horas de antes".
 */
export function avisosDelLibro(hojas: ResumenHoja[]): string[] {
  const conTotales = hojas
    .filter((h): h is ResumenHoja & { anterior: number; a_la_fecha: number } => h.anterior !== null && h.a_la_fecha !== null && h.a_la_fecha >= h.anterior)
    .sort((a, b) => a.anterior - b.anterior);
  const avisos: string[] = [];
  for (let i = 1; i < conTotales.length; i++) {
    const antes = conTotales[i - 1], despues = conTotales[i];
    const hueco = despues.anterior - antes.a_la_fecha;
    if (hueco > 0.5) avisos.push(`Parece que falta una hoja: ${antes.nombre.toLowerCase()} termina con ${horasConComa(antes.a_la_fecha)} h y ${despues.nombre.toLowerCase()} arranca con ${horasConComa(despues.anterior)} h. Si no la subiste, agregá esas ${horasConComa(hueco)} h subiendo la hoja que falta.`);
  }
  const primera = conTotales[0];
  if (primera && primera.anterior > 0.5) {
    avisos.push(`Tu primera hoja (${primera.nombre.toLowerCase()}) trae ${horasConComa(primera.anterior)} h de antes. Si son de hojas o de un libro anterior que no subiste, cargalas en «Tus horas de antes» del Hangar para que tus totales den bien.`);
  }
  return avisos;
}

import type { Aircraft, Flight, Logbook } from "@/types";

/**
 * El libro de vuelo con la hoja de siempre: qué va en cada renglón, en qué hoja y con qué
 * totales. El dibujo del PDF está en `libro-anac-pdf.ts`; esto es puro y está testeado.
 *
 * **La fuente es la norma vigente, no la memoria** (invariante 6; ver
 * `docs/normativa/libro-de-vuelo-anac.md`):
 *
 * - **RAAC 61.120** (Edición VI, enero 2026): qué anota el piloto de cada vuelo.
 * - **Res. ANAC 470/2025, Anexo I**, el procedimiento del registro electrónico en el
 *   Casillero Aeronáutico Digital (CAD). Su punto 5 lista los datos del libro: la
 *   finalidad con sus siglas; la aeronave con marca y modelo, matrícula, potencia (la
 *   total en un multimotor) y clase (MONT-T, MULT-T, MONT-A, MULT-A); los tiempos; los
 *   aterrizajes; la discriminación, que **no suma a los totales**; y el adiestrador, que
 *   se asienta aparte. Su punto 9(b) mantiene el libro en papel, que **puede ser "en
 *   formato digital impreso"**, con los mismos datos que se declaran en el CAD.
 * - **La hoja es la de siempre**: la del Adjunto A de la Res. 147/2013 —derogada por la
 *   470/2025—, que es la de los libros en papel y la misma que usa el Libro de Vuelo
 *   Electrónico del CAD. De ella salen los 15 renglones, los totales de la página anterior
 *   arriba y los de la siguiente abajo, el año en el encabezado y las horas en UTC.
 *
 * Un cambio de año empieza hoja nueva. Los totales se arrastran de hoja en hoja,
 * arrancando por las horas que el piloto trajo de su libro de papel (`logbooks.opening_*`).
 *
 * **La hoja corta donde corta el libro de papel del piloto**: cada libro dice cuántos
 * renglones tiene (`logbooks.renglones_por_hoja`, 15 si no se cambió), y un vuelo
 * marcado `cierra_hoja` es el último de su hoja. Una hoja que se cerró sin llenarse
 * —por esa marca o por el cambio de año— lleva lo que quedó en blanco tachado con una
 * sola diagonal, como se hace en el papel.
 */

/** Los de la hoja del Adjunto A de la Res. 147/2013; cada libro puede tener los suyos. */
export const RENGLONES_POR_HOJA = 15;
export const RENGLONES_MIN = 5;
export const RENGLONES_MAX = 40;

/** Los renglones de la hoja de un libro: lo que cargó el piloto, dentro de lo razonable. */
export function renglonesDeLaHoja(libro: Logbook | null | undefined): number {
  const n = Math.round(Number(libro?.renglones_por_hoja));
  return Number.isFinite(n) && n >= RENGLONES_MIN && n <= RENGLONES_MAX ? n : RENGLONES_POR_HOJA;
}

/** Las columnas numéricas de la hoja, en su orden. */
export interface ValoresLibro {
  // Tiempos de vuelo: son los que suman al total del libro.
  aeroDiaPiloto: number;
  aeroDiaCopiloto: number;
  aeroNochePiloto: number;
  aeroNocheCopiloto: number;
  travDiaPiloto: number;
  travDiaCopiloto: number;
  travNochePiloto: number;
  travNocheCopiloto: number;
  aterrizajes: number;
  // Discriminación de tiempos de vuelo: no suman al total.
  instructor: number;
  multimotor: number;
  reactor: number;
  turbohelice: number;
  aeroaplicador: number;
  imcPiloto: number;
  imcCopiloto: number;
  capota: number;
  // Adiestrador terrestre / simulador: tampoco suman.
  simInstructor: number;
  simPilotoEnInstruccion: number;
}

export type ColumnaLibro = keyof ValoresLibro;

/** Las ocho columnas de "Tiempos de vuelo": su suma es el total de horas del libro. */
export const COLUMNAS_TIEMPOS_DE_VUELO: ColumnaLibro[] = [
  "aeroDiaPiloto",
  "aeroDiaCopiloto",
  "aeroNochePiloto",
  "aeroNocheCopiloto",
  "travDiaPiloto",
  "travDiaCopiloto",
  "travNochePiloto",
  "travNocheCopiloto",
];

export const COLUMNAS_LIBRO: ColumnaLibro[] = [
  ...COLUMNAS_TIEMPOS_DE_VUELO,
  "aterrizajes",
  "instructor",
  "multimotor",
  "reactor",
  "turbohelice",
  "aeroaplicador",
  "imcPiloto",
  "imcCopiloto",
  "capota",
  "simInstructor",
  "simPilotoEnInstruccion",
];

export interface RenglonLibro {
  dia: string;
  mes: string;
  horaSalida: string;
  desde: string;
  hasta: string;
  horaLlegada: string;
  finalidad: string;
  marcaModelo: string;
  matricula: string;
  potencia: string;
  clase: string;
  valores: ValoresLibro;
}

export interface HojaLibro {
  anio: number;
  /** Cuántos renglones tiene la hoja; los que no se usan quedan en blanco. */
  capacidad: number;
  /**
   * Se cerró antes de llenarse —un vuelo marcado "cerrar hoja", o el cambio de año—: lo
   * que quedó en blanco se tacha. La última hoja del libro, abierta, no.
   */
  cerrada: boolean;
  renglones: RenglonLibro[];
  /** Totales de la página anterior (la primera hoja: las horas de apertura). */
  anterior: ValoresLibro;
  /** Totales a la página siguiente: lo anterior más esta hoja. */
  siguiente: ValoresLibro;
}

export function valoresEnCero(): ValoresLibro {
  return Object.fromEntries(COLUMNAS_LIBRO.map((c) => [c, 0])) as unknown as ValoresLibro;
}

/**
 * Suma en décimas enteras: `0.1 + 0.2` en punto flotante da `0.30000000000000004`, y en
 * un libro que se presenta ante ANAC un total no puede tener ruido.
 */
function sumar(a: ValoresLibro, b: ValoresLibro): ValoresLibro {
  const r = valoresEnCero();
  for (const c of COLUMNAS_LIBRO) {
    r[c] = c === "aterrizajes" ? a[c] + b[c] : (Math.round(a[c] * 10) + Math.round(b[c] * 10)) / 10;
  }
  return r;
}

/** La suma de las ocho columnas de "Tiempos de vuelo": el total de horas del libro. */
export function totalHorasDeVuelo(v: ValoresLibro): number {
  return COLUMNAS_TIEMPOS_DE_VUELO.reduce((t, c) => t + Math.round(v[c] * 10), 0) / 10;
}

const n = (x: number | undefined | null) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** "13:05" en UTC, o vacío si no hay hora. La hoja pide UTC (nota impresa en el Adjunto A). */
export function horaUtc(iso: string | undefined | null): string {
  const t = Date.parse(iso ?? "");
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Desde y hasta: el primero y el último punto de la ruta. Un vuelo que sale y vuelve al
 * mismo lugar lleva ese lugar en los dos casilleros, como lo escribe el Libro de Vuelo
 * Electrónico del CAD; el "lugar y LOCAL" era de la Res. 147/2013, derogada. Una sesión
 * de simulador lleva la lección, o "SIMULADOR" si no se anotó ninguna.
 */
export function itinerario(route: string | undefined | null, esSimulador: boolean): { desde: string; hasta: string } {
  const texto = (route ?? "").trim().toUpperCase();
  if (esSimulador) {
    return { desde: !texto || texto === "LOCAL" ? "SIMULADOR" : texto, hasta: "" };
  }
  // "LOCAL" en la ruta no es un lugar: un vuelo local se anota con su aeródromo.
  const puntos = texto.split(/[\s,\-–>→]+/).filter((x) => x && x !== "LOCAL");
  if (puntos.length === 0) return { desde: "", hasta: "" };
  return { desde: puntos[0], hasta: puntos[puntos.length - 1] };
}

/**
 * La clase con las siglas del libro (Res. ANAC 470/2025, Anexo I, punto 5): MONT-T,
 * MULT-T, MONT-A y MULT-A. Vector guarda los acuáticos como MONT-H y MULT-H
 * ("hidroavión"), y así no se escriben en el libro.
 */
export function claseOficial(typeAcft: string | undefined | null): string {
  const t = (typeAcft ?? "").trim().toUpperCase();
  if (t === "MONT-H") return "MONT-A";
  if (t === "MULT-H") return "MULT-A";
  return t;
}

function renglon(f: Flight, avion: Aircraft | undefined): RenglonLibro {
  const esSimulador = !!avion?.is_simulator;
  const [, mes, dia] = (f.date ?? "").slice(0, 10).split("-");
  const v = valoresEnCero();

  if (esSimulador) {
    // Un simulador sólo llena su columna: de ese renglón no sale una hora de vuelo.
    v.simInstructor = n(f.sim_instructor);
    v.simPilotoEnInstruccion = n(f.sim_pil_en_inst);
  } else {
    v.aeroDiaPiloto = n(f.pic_day_loc);
    v.aeroDiaCopiloto = n(f.sic_day_loc);
    v.aeroNochePiloto = n(f.pic_night_loc);
    v.aeroNocheCopiloto = n(f.sic_night_loc);
    v.travDiaPiloto = n(f.pic_day_tra);
    v.travDiaCopiloto = n(f.sic_day_tra);
    v.travNochePiloto = n(f.pic_night_tra);
    v.travNocheCopiloto = n(f.sic_night_tra);
    v.aterrizajes = n(f.landings);
    v.imcPiloto = n(f.imc_pil);
    v.imcCopiloto = n(f.imc_cop);
    v.capota = n(f.capota);

    const total = totalHorasDeVuelo(v);
    // La discriminación sale de lo que Vector sabe. Lo que no sabe —reactor,
    // turbohélice— queda en blanco para completar a mano, no se inventa.
    if ((avion?.type_acft ?? "").toUpperCase().startsWith("MULT")) v.multimotor = total;
    if (f.purpose === "I") v.instructor = total;
    if (f.purpose === "AER") v.aeroaplicador = total;
  }

  const { desde, hasta } = itinerario(f.route, esSimulador);
  return {
    dia: dia ?? "",
    mes: mes ?? "",
    horaSalida: horaUtc(f.takeoff),
    desde,
    hasta,
    horaLlegada: horaUtc(f.landing),
    finalidad: f.purpose ?? "",
    // Como se anota en el libro: el tipo (C152, C172, ECHO, ASTO), no "Cessna 152". Es
    // el "Tipo OACI" que el piloto cargó en el Hangar; sin él, el nombre completo.
    marcaModelo: (avion?.icao ?? "").trim().toUpperCase() || (avion?.type ?? ""),
    matricula: avion?.registration ?? "",
    potencia: avion?.potencia_hp ? String(avion.potencia_hp) : "",
    clase: claseOficial(avion?.type_acft),
    valores: v,
  };
}

/** Las horas que el piloto trajo de su libro de papel, como totales de arranque. */
export function valoresDeApertura(libro: Logbook | null | undefined): ValoresLibro {
  const v = valoresEnCero();
  if (!libro) return v;
  v.aeroDiaPiloto = n(libro.opening_pic_day_loc);
  v.aeroDiaCopiloto = n(libro.opening_sic_day_loc);
  v.aeroNochePiloto = n(libro.opening_pic_night_loc);
  v.aeroNocheCopiloto = n(libro.opening_sic_night_loc);
  v.travDiaPiloto = n(libro.opening_pic_day_tra);
  v.travDiaCopiloto = n(libro.opening_sic_day_tra);
  v.travNochePiloto = n(libro.opening_pic_night_tra);
  v.travNocheCopiloto = n(libro.opening_sic_night_tra);
  v.aterrizajes = n(libro.opening_landings);
  v.imcPiloto = n(libro.opening_imc_pil);
  v.imcCopiloto = n(libro.opening_imc_cop);
  v.capota = n(libro.opening_capota);
  return v;
}

/**
 * Las hojas del libro: vuelos en orden, de a `renglonesPorHoja`, hoja nueva al cambiar
 * el año o después de un vuelo que cierra la hoja, y los totales arrastrados desde las
 * horas de apertura.
 */
export function armarLibro({
  vuelos,
  aeronaves,
  apertura,
  renglonesPorHoja = RENGLONES_POR_HOJA,
}: {
  vuelos: Flight[];
  aeronaves: Aircraft[];
  apertura: ValoresLibro;
  renglonesPorHoja?: number;
}): HojaLibro[] {
  const porId = new Map(aeronaves.map((a) => [a.id, a]));
  const ordenados = [...vuelos].sort(
    (a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.takeoff ?? "").localeCompare(b.takeoff ?? "")
  );

  const hojas: HojaLibro[] = [];
  let acumulado = apertura;
  let actual: HojaLibro | null = null;

  /** `antes`: la hoja se cierra sin haberse llenado, y lo que sobra se tacha. */
  const cerrar = (antes: boolean) => {
    if (!actual) return;
    actual.siguiente = actual.renglones.reduce((t, r) => sumar(t, r.valores), actual.anterior);
    actual.cerrada = antes && actual.renglones.length < actual.capacidad;
    acumulado = actual.siguiente;
    hojas.push(actual);
    actual = null;
  };

  for (const f of ordenados) {
    const anio = Number((f.date ?? "").slice(0, 4)) || 0;
    if (actual && actual.anio !== anio) cerrar(true);
    if (!actual) {
      actual = { anio, capacidad: renglonesPorHoja, cerrada: false, renglones: [], anterior: acumulado, siguiente: acumulado };
    }
    actual.renglones.push(renglon(f, f.aircraft_id ? porId.get(f.aircraft_id) : undefined));
    if (f.cierra_hoja) cerrar(true);
    else if (actual.renglones.length === renglonesPorHoja) cerrar(false);
  }
  cerrar(false);
  return hojas;
}

/**
 * Un número como va en la hoja: horas con un decimal y coma ("1,2"), aterrizajes enteros.
 * En un renglón, el cero va en blanco —como se completa a mano—; en los totales, se
 * escribe.
 */
export function formatoLibro(valor: number, columna: ColumnaLibro, enBlancoSiCero: boolean): string {
  if (enBlancoSiCero && !valor) return "";
  if (columna === "aterrizajes") return String(Math.round(valor));
  return valor.toFixed(1).replace(".", ",");
}

/** "23/09/2026", en Argentina. Para la línea "Generado con Vector el …" del pie. */
export function fechaDeGeneracion(ahora: Date): string {
  const d = new Date(ahora.getTime() - 3 * 60 * 60 * 1000); // UTC−3, sin horario de verano
  const dos = (x: number) => String(x).padStart(2, "0");
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "DÍAZ NEMETH, Federico": como pide el encabezado de la hoja. */
export function apellidoYNombre(nombre: string | null | undefined, apellido: string | null | undefined): string {
  const a = (apellido ?? "").trim().toLocaleUpperCase("es-AR");
  const n = (nombre ?? "").trim();
  return a && n ? `${a}, ${n}` : a || n;
}

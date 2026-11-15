import type { Aircraft, Flight } from "@/types";
import { timeOfDay } from "@/lib/summary";
import { distanciaNmPrecisa } from "@/lib/distance";
import { hitoCruzado } from "@/lib/hitos";
import { esVueloDeSimulador, idsDeSimuladores, soloVolados } from "@/lib/simulador";

/**
 * "Tu año en vuelo" (3.39.0): las estadísticas del año de un piloto, para la experiencia
 * de historias y para la imagen que se comparte.
 *
 * **Pura y serializable**: el server la calcula y se la pasa a los componentes, que no
 * saben sumar (igual que la tarjeta de horas, `lib/share-card.ts`). Ninguna fecha sale del
 * reloj de acá: el año y "hoy" los decide quien llama (invariante 1), y las fechas largas
 * ("12 de marzo") se escriben con una tabla propia, no con `toLocaleString`.
 *
 * Invariantes que toca:
 *  - 4: el año es de **vuelos**; los simuladores se cuentan aparte y nunca suman horas.
 *  - 5: las horas de apertura no tienen fecha, así que no son "del año": sólo entran al
 *    total de carrera para decidir si se cruzó un hito.
 *  - 10/14: lo que sale de acá hacia la imagen compartible no lleva nombre ni email. **La
 *    matrícula sí** (`aviones`): Federico lo decidió el 2026-11-15 ("con matrícula incluida,
 *    no pasa nada"); es la imagen que el piloto elige compartir, no la red social.
 */

export interface UbicacionAerodromo {
  lat: number;
  lon: number;
  nombre: string;
}

export type UbicarAerodromo = (codigo: string) => UbicacionAerodromo | null;

export interface EntradaTuAno {
  flights: Flight[];
  aircraft: Aircraft[];
  anio: number;
  ubicar: UbicarAerodromo;
  /** Cuándo rindió la PPA (`profiles.fecha_ppa`), si la rindió. */
  fechaPpa?: string | null;
  /** Las horas de apertura de los libros (`openingTotals(...).totalHours`). */
  aperturaHoras?: number;
}

export interface PuntoDeMapa {
  codigo: string;
  nombre: string;
  lat: number;
  lon: number;
  visitas: number;
}

export interface TuAno {
  anio: number;
  horas: number;
  vuelos: number;
  aterrizajes: number;
  /** Días distintos con al menos un vuelo. */
  dias: number;
  simulador: { sesiones: number; horas: number } | null;
  /** Cuántos aeródromos distintos (de las rutas escritas), ubicados o no. */
  aerodromos: number;
  /** El más frecuente, o null si no hay ninguno. */
  base: { codigo: string; nombre: string; visitas: number } | null;
  /** Los que se ubican, para el mapa de puntos; `tramos` son pares de índices de `puntos`. */
  mapa: { puntos: PuntoDeMapa[]; tramos: [number, number][] };
  /** Aproximada, sólo por la ruta escrita: los vuelos locales no suman. */
  distanciaNm: number;
  masLargo: { fecha: string; ruta: string; local: boolean; horas: number } | null;
  /** Doce valores, enero a diciembre. */
  horasPorMes: number[];
  mesTop: { nombre: string; horas: number } | null;
  momento: { nombre: string; rango: string; horas: number } | null;
  avion: { tipo: string; horas: number; vuelos: number; matricula: string | null } | null;
  /** Los aviones más volados del año, por matrícula (hasta 3), de más horas a menos. */
  aviones: { matricula: string; tipo: string; horas: number; vuelos: number }[];
  nocheHoras: number;
  ifrHoras: number;
  comparacion: { anioAnterior: number; horasAnterior: number; porcentaje: number } | null;
  hitos: { horas: number | null; ppa: { fecha: string } | null };
}

export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const n = (v?: number) => (typeof v === "number" && isFinite(v) ? v : 0);
const redondear1 = (v: number) => Math.round(v * 10) / 10;

/** "2026-03-12" → "12 de marzo", sin pasar por `Date` ni por el idioma del entorno. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} de ${mes}` : "";
}

/** El año actual **en hora argentina** (UTC-3, sin horario de verano), para el server. */
export function anioActualArgentina(ahora: Date): number {
  return new Date(ahora.getTime() - 3 * 3600 * 1000).getUTCFullYear();
}

/** Los puntos de una ruta escrita, en orden, sin los "???". */
export function puntosDeRuta(route: string | undefined): string[] {
  return (route ?? "")
    .split(/[\s-]+/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p && p !== "???");
}

const anioDe = (f: Flight) => Number((f.date ?? "").slice(0, 4));

/** Los años con al menos un vuelo real, del más nuevo al más viejo. */
export function aniosConVuelos(flights: Flight[], aircraft: Aircraft[]): number[] {
  const anios = new Set<number>();
  for (const f of soloVolados(flights, aircraft)) {
    const a = anioDe(f);
    if (Number.isInteger(a) && a > 1900) anios.add(a);
  }
  return [...anios].sort((a, b) => b - a);
}

/** Número a la argentina (1.234,5), sin `toLocaleString`: da lo mismo en Node y en el navegador. */
export function formatearNumero(valor: number, decimales = 0): string {
  const fijo = Math.abs(valor).toFixed(decimales);
  const [entero, dec] = fijo.split(".");
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const signo = valor < 0 && Number(fijo) !== 0 ? "-" : "";
  return signo + miles + (dec ? "," + dec : "");
}

/** Cuatro franjas en hora argentina: `takeoff` se guarda en UTC y `timeOfDay` agrupa en UTC. */
const FRANJAS = [
  { nombre: "de madrugada", rango: "0 y las 6", desde: 0 },
  { nombre: "de mañana", rango: "6 y las 12", desde: 6 },
  { nombre: "de tarde", rango: "12 y las 18", desde: 12 },
  { nombre: "al atardecer y de noche", rango: "18 y las 24", desde: 18 },
];

export function calcularTuAno(e: EntradaTuAno): TuAno {
  const { anio, aircraft, ubicar } = e;
  const simuladores = idsDeSimuladores(aircraft);
  const delAnio = (f: Flight) => anioDe(f) === anio;

  const volados = soloVolados(e.flights, aircraft);
  const vuelosDelAnio = volados.filter(delAnio);
  const simulados = e.flights.filter((f) => delAnio(f) && esVueloDeSimulador(f, simuladores));

  const horas = redondear1(vuelosDelAnio.reduce((a, f) => a + n(f.duration), 0));
  const dias = new Set(vuelosDelAnio.map((f) => f.date.slice(0, 10))).size;

  // Los aeródromos: la misma cuenta del Resumen (`allAirports`: una visita por aparición en la
  // ruta), pero con **todos** los puntos escritos y no sólo origen y destino, que es lo que hace
  // falta para medir una ruta de tres tramos.
  const visitas = new Map<string, number>();
  for (const f of vuelosDelAnio) {
    for (const p of puntosDeRuta(f.route)) if (p !== "LOCAL") visitas.set(p, (visitas.get(p) ?? 0) + 1);
  }
  const frecuencias = [...visitas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([icao, visits]) => ({ icao, visits }));
  const puntos: PuntoDeMapa[] = [];
  const indice = new Map<string, number>();
  for (const a of frecuencias) {
    const u = ubicar(a.icao);
    if (!u) continue;
    indice.set(a.icao, puntos.length);
    puntos.push({ codigo: a.icao, nombre: u.nombre, lat: u.lat, lon: u.lon, visitas: a.visits });
  }
  const base = frecuencias[0]
    ? {
        codigo: frecuencias[0].icao,
        nombre: ubicar(frecuencias[0].icao)?.nombre ?? frecuencias[0].icao,
        visitas: frecuencias[0].visits,
      }
    : null;

  // Distancia: sólo los tramos escritos cuyos dos extremos se ubican.
  let distancia = 0;
  const tramosVistos = new Set<string>();
  const tramos: [number, number][] = [];
  for (const f of vuelosDelAnio) {
    const pts = puntosDeRuta(f.route);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = indice.get(pts[i]);
      const b = indice.get(pts[i + 1]);
      if (a === undefined || b === undefined || a === b) continue;
      distancia += distanciaNmPrecisa(puntos[a].lat, puntos[a].lon, puntos[b].lat, puntos[b].lon);
      const clave = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!tramosVistos.has(clave)) {
        tramosVistos.add(clave);
        tramos.push([a, b]);
      }
    }
  }

  // El vuelo más largo (el primero si empatan).
  let largo: Flight | null = null;
  for (const f of vuelosDelAnio) if (n(f.duration) > 0 && (!largo || f.duration > largo.duration)) largo = f;
  let masLargo: TuAno["masLargo"] = null;
  if (largo) {
    const pts = puntosDeRuta(largo.route);
    const distintos = new Set(pts);
    masLargo = {
      fecha: fechaCorta(largo.date),
      ruta: pts.length ? pts.join(" → ") : "Sin ruta",
      local: distintos.size <= 1,
      horas: redondear1(largo.duration),
    };
  }

  const horasPorMes = new Array(12).fill(0) as number[];
  for (const f of vuelosDelAnio) {
    const m = Number(f.date.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) horasPorMes[m] += n(f.duration);
  }
  const horasMes = horasPorMes.map(redondear1);
  const maxMes = Math.max(...horasMes);
  const mesTop = maxMes > 0 ? { nombre: MESES[horasMes.indexOf(maxMes)], horas: maxMes } : null;

  // Momento del día, en hora argentina (UTC-3) a partir de la distribución en UTC del Resumen.
  let momento: TuAno["momento"] = null;
  const porHoraUtc = timeOfDay(vuelosDelAnio).byHour;
  const franjas = FRANJAS.map((fr) => {
    let h = 0;
    for (let k = fr.desde; k < fr.desde + 6; k++) h += porHoraUtc[(k + 3) % 24];
    return { ...fr, horas: h };
  });
  const mejor = franjas.reduce((a, b) => (b.horas > a.horas ? b : a), franjas[0]);
  if (mejor.horas > 0) momento = { nombre: mejor.nombre, rango: mejor.rango, horas: redondear1(mejor.horas) };

  // El tipo de avión más volado.
  const indiceAviones = new Map(aircraft.map((a) => [a.id, a]));
  const porTipo = new Map<string, { tipo: string; horas: number; vuelos: number; horasPorMatricula: Map<string, number> }>();
  for (const f of vuelosDelAnio) {
    const ac = f.aircraft_id ? indiceAviones.get(f.aircraft_id) : undefined;
    const tipo = (ac?.type || ac?.icao || "").trim();
    if (!ac || !tipo) continue;
    const cur = porTipo.get(tipo) ?? { tipo, horas: 0, vuelos: 0, horasPorMatricula: new Map() };
    cur.horas += n(f.duration);
    cur.vuelos += 1;
    cur.horasPorMatricula.set(ac.registration, (cur.horasPorMatricula.get(ac.registration) ?? 0) + n(f.duration));
    porTipo.set(tipo, cur);
  }
  const topTipo = [...porTipo.values()].sort((a, b) => b.horas - a.horas)[0];
  const avion = topTipo
    ? {
        tipo: topTipo.tipo,
        horas: redondear1(topTipo.horas),
        vuelos: topTipo.vuelos,
        matricula: [...topTipo.horasPorMatricula.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }
    : null;

  // Los aviones más volados, por matrícula.
  const porAvion = new Map<string, { matricula: string; tipo: string; horas: number; vuelos: number }>();
  for (const f of vuelosDelAnio) {
    const ac = f.aircraft_id ? indiceAviones.get(f.aircraft_id) : undefined;
    if (!ac?.registration?.trim()) continue;
    const cur = porAvion.get(ac.id) ?? { matricula: ac.registration.trim().toUpperCase(), tipo: (ac.type || ac.icao || "").trim(), horas: 0, vuelos: 0 };
    cur.horas += n(f.duration);
    cur.vuelos += 1;
    porAvion.set(ac.id, cur);
  }
  const aviones = [...porAvion.values()]
    .sort((a, b) => b.horas - a.horas || b.vuelos - a.vuelos)
    .slice(0, 3)
    .map((a) => ({ ...a, horas: redondear1(a.horas) }));

  const nocheHoras = redondear1(
    vuelosDelAnio.reduce((a, f) => a + n(f.pic_night_loc) + n(f.pic_night_tra) + n(f.sic_night_loc) + n(f.sic_night_tra), 0)
  );
  const ifrHoras = redondear1(vuelosDelAnio.reduce((a, f) => a + n(f.imc_pil) + n(f.imc_cop), 0));

  // Contra el año anterior, sólo si ese año tuvo vuelos.
  const horasAnterior = redondear1(volados.filter((f) => anioDe(f) === anio - 1).reduce((a, f) => a + n(f.duration), 0));
  const comparacion =
    horasAnterior > 0 && vuelosDelAnio.length > 0
      ? { anioAnterior: anio - 1, horasAnterior, porcentaje: Math.round(((horas - horasAnterior) / horasAnterior) * 100) }
      : null;

  // Hitos: el total de carrera antes del año y al final de él (apertura + lo volado).
  const apertura = n(e.aperturaHoras);
  const hastaAntes = apertura + volados.filter((f) => anioDe(f) < anio).reduce((a, f) => a + n(f.duration), 0);
  const hastaElFinal = apertura + volados.filter((f) => anioDe(f) <= anio).reduce((a, f) => a + n(f.duration), 0);
  const ppa = e.fechaPpa && Number(e.fechaPpa.slice(0, 4)) === anio ? { fecha: fechaCorta(e.fechaPpa) } : null;

  return {
    anio,
    horas,
    vuelos: vuelosDelAnio.length,
    aterrizajes: vuelosDelAnio.reduce((a, f) => a + n(f.landings), 0),
    dias,
    simulador: simulados.length
      ? { sesiones: simulados.length, horas: redondear1(simulados.reduce((a, f) => a + n(f.sim_pil_en_inst) + n(f.sim_instructor), 0)) }
      : null,
    aerodromos: frecuencias.length,
    base,
    mapa: { puntos, tramos },
    distanciaNm: Math.round(distancia),
    masLargo,
    horasPorMes: horasMes,
    mesTop,
    momento,
    avion,
    aviones,
    nocheHoras,
    ifrHoras,
    comparacion,
    hitos: { horas: hitoCruzado(hastaAntes, hastaElFinal), ppa },
  };
}

/**
 * Los puntos del mapa en un rectángulo `ancho` × `alto` con `margen`, sin tiles: equirectangular
 * con la longitud achicada por el coseno de la latitud media, para que no se estire. Un solo
 * punto va al centro.
 */
export function proyectarPuntos(
  puntos: { lat: number; lon: number }[],
  ancho: number,
  alto: number,
  margen: number
): { x: number; y: number }[] {
  if (!puntos.length) return [];
  const latMedia = puntos.reduce((a, p) => a + p.lat, 0) / puntos.length;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const xs = puntos.map((p) => p.lon * k);
  const ys = puntos.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const anchoU = ancho - 2 * margen;
  const altoU = alto - 2 * margen;
  const spanX = maxX - minX, spanY = maxY - minY;
  if (spanX === 0 && spanY === 0) return puntos.map(() => ({ x: ancho / 2, y: alto / 2 }));
  // Un mínimo de recorrido: dos aeródromos casi pegados no se estiran hasta ocupar todo el rectángulo.
  const escala = Math.min(anchoU / Math.max(spanX, 0.15), altoU / Math.max(spanY, 0.15));
  const offX = (ancho - spanX * escala) / 2;
  const offY = (alto - spanY * escala) / 2;
  return puntos.map((_, i) => ({ x: offX + (xs[i] - minX) * escala, y: offY + (ys[i] - minY) * escala }));
}

/** La vuelta al mundo por el ecuador, en millas náuticas (21.600): para dar escala a la distancia. */
export const VUELTA_AL_MUNDO_NM = 21600;

import type { Aircraft, Flight } from "@/types";
import { distanciaNmPrecisa } from "@/lib/distance";
import { soloVolados } from "@/lib/simulador";
import { MESES, puntosDeRuta } from "@/lib/tu-ano";

/**
 * "Tu mapa" (3.47.0): todos los aeródromos y las rutas de la carrera de un piloto en un mapa,
 * filtrable por año y por avión. Esto es la parte **pura**: agrupa aeródromos y piernas, aplica los
 * filtros y hace las cifras. La pantalla y la imagen compartible la usan igual.
 *
 * Invariantes que toca:
 *  - 1: ninguna fecha sale del reloj ni de `toLocaleString`; "12 de marzo de 2026" se escribe con
 *    una tabla (`fechaLarga`) y baja ya escrita.
 *  - 2: lo que no se puede ubicar **se cuenta y se dice** (`sinDibujar`), no se descarta en silencio.
 *  - 4: sólo vuelos (`soloVolados`): un simulador es un renglón del libro y no tiene ruta que dibujar.
 *  - 5: las horas de apertura no tienen ruta ni fecha; no entran.
 *  - 10: los números de la imagen salen de la sesión; de la URL sólo vienen los filtros, que se
 *    validan contra lo que el piloto de verdad tiene (`filtrosDeLaUrl`).
 */

export interface UbicacionMapa {
  lat: number;
  lon: number;
  nombre: string;
  /** La provincia, si el directorio la sabe. */
  provincia?: string;
}

export type UbicarParaMapa = (codigo: string) => UbicacionMapa | null;

export interface FiltrosMapa {
  anio: number | null;
  /** El id de la aeronave (de las del Hangar), no la matrícula. */
  avionId: string | null;
}

export interface OpcionAvion {
  id: string;
  matricula: string;
  tipo: string;
  vuelos: number;
}

export interface OpcionesMapa {
  /** Los años con vuelos, del más nuevo al más viejo. */
  anios: number[];
  /** Los aviones (no simuladores) con al menos un vuelo, del más volado al menos. */
  aviones: OpcionAvion[];
}

export interface AerodromoMapa {
  codigo: string;
  nombre: string;
  lat: number;
  lon: number;
  provincia: string | null;
  visitas: number;
  /** "2026-03-12". */
  primera: string;
  ultima: string;
  /** "12 de marzo de 2026", ya escrita. */
  primeraTexto: string;
  ultimaTexto: string;
}

/** Una pierna entre dos aeródromos, sin importar el sentido: `a` < `b` son índices de `aerodromos`. */
export interface PiernaMapa {
  a: number;
  b: number;
  veces: number;
}

export interface MapaCarrera {
  filtros: FiltrosMapa;
  /** Del más visitado al menos. */
  aerodromos: AerodromoMapa[];
  piernas: PiernaMapa[];
  cifras: {
    /** Todos los vuelos del filtro, se hayan podido dibujar o no. */
    vuelos: number;
    horas: number;
    aerodromos: number;
    /** Aproximada: sólo las piernas cuyos dos extremos se ubican. */
    distanciaNm: number;
    /** Las que el directorio sabe, escritas; puede ser "al menos". */
    provincias: string[];
  };
  sinDibujar: {
    /** Vuelos con una ruta cuyos aeródromos no se reconocieron (ninguno de ellos). */
    vuelos: number;
    /** Vuelos sin ningún aeródromo escrito (una ruta vacía o "LOCAL"). */
    sinRuta: number;
    /** Los códigos que no se reconocieron, para decirlos. */
    codigos: string[];
  };
  /** Los aviones más volados del filtro (hasta 3), por matrícula. */
  aviones: { matricula: string; tipo: string; horas: number; vuelos: number }[];
}

const n = (v?: number) => (typeof v === "number" && isFinite(v) ? v : 0);
const redondear1 = (v: number) => Math.round(v * 10) / 10;
const diaDe = (f: Flight) => (f.date ?? "").slice(0, 10);
const anioDe = (f: Flight) => Number((f.date ?? "").slice(0, 4));

/** "2026-03-12" → "12 de marzo de 2026", sin pasar por `Date` ni por el idioma del entorno. */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : "";
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "e", "y"]);

/** "BUENOS AIRES" → "Buenos Aires"; la de Tierra del Fuego, que MADHEL escribe larga, se acorta. */
export function provinciaLegible(p: string): string {
  const t = (p ?? "").trim();
  if (!t) return "";
  if (/^TIERRA DEL FUEGO/i.test(t)) return "Tierra del Fuego";
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Los años y los aviones que de verdad tienen vuelos: lo que los filtros pueden ofrecer. */
export function opcionesDelMapa(flights: Flight[], aircraft: Aircraft[]): OpcionesMapa {
  const volados = soloVolados(flights, aircraft);
  const anios = new Set<number>();
  const porAvion = new Map<string, number>();
  for (const f of volados) {
    const a = anioDe(f);
    if (Number.isInteger(a) && a > 1900) anios.add(a);
    if (f.aircraft_id) porAvion.set(f.aircraft_id, (porAvion.get(f.aircraft_id) ?? 0) + 1);
  }
  const aviones: OpcionAvion[] = [];
  for (const ac of aircraft) {
    const vuelos = porAvion.get(ac.id);
    if (!vuelos || ac.is_simulator) continue;
    aviones.push({ id: ac.id, matricula: (ac.registration ?? "").trim().toUpperCase(), tipo: (ac.type || ac.icao || "").trim(), vuelos });
  }
  aviones.sort((a, b) => b.vuelos - a.vuelos || a.matricula.localeCompare(b.matricula));
  return { anios: [...anios].sort((a, b) => b - a), aviones };
}

export interface FiltrosDeLaUrl {
  filtros: FiltrosMapa;
  /** Algo vino en la URL y no es un año ni un avión del piloto: quien llama decide (la imagen se niega). */
  invalido: boolean;
}

/**
 * Los filtros de `?anio=&avion=`, **contra lo que el piloto tiene**: un año sin vuelos o un avión
 * que no es suyo no pasan. Lo que no está se ignora (pantalla) o se rechaza (imagen).
 */
export function filtrosDeLaUrl(anio: string | null | undefined, avion: string | null | undefined, opciones: OpcionesMapa): FiltrosDeLaUrl {
  let invalido = false;
  let a: number | null = null;
  if (anio) {
    const v = /^\d{4}$/.test(anio) ? Number(anio) : NaN;
    if (opciones.anios.includes(v)) a = v;
    else invalido = true;
  }
  let id: string | null = null;
  if (avion) {
    if (opciones.aviones.some((x) => x.id === avion)) id = avion;
    else invalido = true;
  }
  return { filtros: { anio: a, avionId: id }, invalido };
}

export interface EntradaMapaCarrera {
  flights: Flight[];
  aircraft: Aircraft[];
  ubicar: UbicarParaMapa;
  filtros: FiltrosMapa;
}

/** Los aeródromos de una ruta escrita, en orden, sin "LOCAL" ni los "???" y sin repetir uno seguido del mismo. */
export function aerodromosDeRuta(route: string | undefined): string[] {
  const pts = puntosDeRuta(route).filter((p) => p !== "LOCAL");
  return pts.filter((p, i) => i === 0 || p !== pts[i - 1]);
}

export function calcularMapaCarrera(e: EntradaMapaCarrera): MapaCarrera {
  const { aircraft, ubicar, filtros } = e;
  const indiceAviones = new Map(aircraft.map((a) => [a.id, a]));
  const vuelos = soloVolados(e.flights, aircraft)
    .filter((f) => filtros.anio === null || anioDe(f) === filtros.anio)
    .filter((f) => filtros.avionId === null || f.aircraft_id === filtros.avionId);

  const ubicados = new Map<string, UbicacionMapa | null>();
  const ubicacion = (codigo: string) => {
    if (!ubicados.has(codigo)) ubicados.set(codigo, ubicar(codigo));
    return ubicados.get(codigo) ?? null;
  };

  interface Acum { codigo: string; visitas: number; primera: string; ultima: string }
  const acumulados = new Map<string, Acum>();
  const piernasPorClave = new Map<string, { a: string; b: string; veces: number }>();
  let sinRuta = 0;
  let sinUbicar = 0;
  const codigosSinUbicar = new Set<string>();
  let distancia = 0;

  for (const f of vuelos) {
    const dia = diaDe(f);
    const pts = aerodromosDeRuta(f.route);
    if (pts.length === 0) {
      sinRuta++;
      continue;
    }
    const conocidos = pts.map((p) => ubicacion(p));
    if (conocidos.every((u) => !u)) sinUbicar++;
    pts.forEach((p, i) => {
      if (!conocidos[i]) {
        codigosSinUbicar.add(p);
        return;
      }
      const cur = acumulados.get(p) ?? { codigo: p, visitas: 0, primera: dia, ultima: dia };
      cur.visitas += 1;
      if (dia && (!cur.primera || dia < cur.primera)) cur.primera = dia;
      if (dia && dia > cur.ultima) cur.ultima = dia;
      acumulados.set(p, cur);
    });
    // Piernas: pares consecutivos con los dos extremos conocidos (no se "puentea" un punto desconocido).
    for (let i = 0; i + 1 < pts.length; i++) {
      const u1 = conocidos[i];
      const u2 = conocidos[i + 1];
      if (!u1 || !u2 || pts[i] === pts[i + 1]) continue;
      distancia += distanciaNmPrecisa(u1.lat, u1.lon, u2.lat, u2.lon);
      const [a, b] = pts[i] < pts[i + 1] ? [pts[i], pts[i + 1]] : [pts[i + 1], pts[i]];
      const clave = `${a}|${b}`;
      const cur = piernasPorClave.get(clave) ?? { a, b, veces: 0 };
      cur.veces += 1;
      piernasPorClave.set(clave, cur);
    }
  }

  const aerodromos: AerodromoMapa[] = [...acumulados.values()]
    .sort((x, y) => y.visitas - x.visitas || x.codigo.localeCompare(y.codigo))
    .map((a) => {
      const u = ubicacion(a.codigo)!;
      return {
        codigo: a.codigo,
        nombre: u.nombre,
        lat: u.lat,
        lon: u.lon,
        provincia: u.provincia ? provinciaLegible(u.provincia) : null,
        visitas: a.visitas,
        primera: a.primera,
        ultima: a.ultima,
        primeraTexto: fechaLarga(a.primera),
        ultimaTexto: fechaLarga(a.ultima),
      };
    });
  const indice = new Map(aerodromos.map((a, i) => [a.codigo, i]));
  const piernas: PiernaMapa[] = [...piernasPorClave.values()]
    .map((p) => {
      const a = indice.get(p.a)!;
      const b = indice.get(p.b)!;
      return a < b ? { a, b, veces: p.veces } : { a: b, b: a, veces: p.veces };
    })
    .sort((x, y) => x.veces - y.veces);

  const provincias = [...new Set(aerodromos.map((a) => a.provincia).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "es"));

  const porAvion = new Map<string, { matricula: string; tipo: string; horas: number; vuelos: number }>();
  for (const f of vuelos) {
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

  return {
    filtros,
    aerodromos,
    piernas,
    cifras: {
      vuelos: vuelos.length,
      horas: redondear1(vuelos.reduce((a, f) => a + n(f.duration), 0)),
      aerodromos: aerodromos.length,
      distanciaNm: Math.round(distancia),
      provincias,
    },
    sinDibujar: { vuelos: sinUbicar, sinRuta, codigos: [...codigosSinUbicar].sort() },
    aviones,
  };
}

/** Cuánto pesa una pierna en el trazo: crece con las veces, pero sin tapar el mapa. */
export function grosorDePierna(veces: number, base = 1.5, tope = 6): number {
  return Math.min(tope, base + Math.log2(Math.max(1, veces)) * 1.2);
}

/** Cuánto mide un aeródromo en el mapa: crece con la raíz de las visitas, entre `minimo` y `maximo`. */
export function radioDeAerodromo(visitas: number, maxVisitas: number, minimo = 4, maximo = 16): number {
  if (maxVisitas <= 0) return minimo;
  return minimo + (maximo - minimo) * Math.sqrt(Math.max(0, visitas) / maxVisitas);
}

export type Proyector = (lat: number, lon: number) => { x: number; y: number };

/**
 * Una proyección que encuadra los puntos en `ancho` × `alto` con `margen`: equirectangular con la
 * longitud achicada por el coseno de la latitud central, para que no se estire. Se usa para los
 * puntos y también para el contorno de país, que por eso puede caer fuera del rectángulo (el
 * `<svg>` lo recorta). Con un solo punto, o muy juntos, no se acerca más que `spanMinLat` grados
 * de alto, para que el contorno se entienda.
 */
export function crearProyeccion(
  puntos: { lat: number; lon: number }[],
  ancho: number,
  alto: number,
  margen: number,
  spanMinLat = 4
): Proyector {
  if (!puntos.length) return () => ({ x: ancho / 2, y: alto / 2 });
  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latC = (minLat + maxLat) / 2;
  const lonC = (minLon + maxLon) / 2;
  const k = Math.cos((latC * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * k, spanMinLat * (ancho / alto));
  const spanY = Math.max(maxLat - minLat, spanMinLat);
  const escala = Math.min((ancho - 2 * margen) / spanX, (alto - 2 * margen) / spanY);
  return (lat, lon) => ({ x: ancho / 2 + (lon - lonC) * k * escala, y: alto / 2 - (lat - latC) * escala });
}

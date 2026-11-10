import { distanciaNmPrecisa } from "./distance";
import { contiene, type EspacioAereo, type Frecuencias } from "./espacios-aereos";
import { puntoDesde, rumboVerdadero, type Punto } from "./navegacion";
import { enVfr, type CorredorVfr, type SectorVfr } from "./corredores-vfr";

/** Los corredores y sectores VFR debajo de la TMA Baires (ENR 3.3): clase G. */
export interface Vfr {
  corredores: CorredorVfr[];
  sectores: SectorVfr[];
}

/**
 * **Las FIR y con quién se habla** (3.1.0): de ENR 2.1, cada FIR con su centro (ACC), sus
 * sectores y sus frecuencias, y la dependencia que te atiende en cada punto de la ruta.
 *
 * ## Los límites
 *
 * Se leen del texto de ENR 2.1, como los espacios aéreos (`espacios-aereos.ts`): coordenadas
 * (acá en grados y minutos, `3013S - 06012W`), arcos alrededor de un VOR, paralelos,
 * meridianos. Lo que el AIP no da con números es **la frontera**:
 *
 * - "siguiendo el límite internacional …": ese tramo se reemplaza por un **rodeo por afuera
 *   del país** (al oeste para Chile, al norte y al este para Bolivia, Paraguay y Brasil). Del
 *   lado argentino no cambia nada: a quién le hablás en Neuquén no depende de por dónde pasa
 *   el polígono en Chile. Esos tramos no se dibujan, porque la frontera ya está en el mapa;
 * - "2830S y límite internacional", "el paralelo 3830S y límite internacional": el punto donde
 *   el paralelo corta la frontera. Ahí **sí** importa, porque de ese punto sale en línea recta
 *   el límite entre dos FIR argentinas. La longitud sale de la frontera de Natural Earth
 *   (`frontera-chile.tsv`, `scripts/build-frontera.mjs`).
 *
 * La prueba de que las FIR están bien es que **cada aeródromo argentino cae en una sola**
 * (`firs.test.ts`).
 *
 * ## Los sectores y las frecuencias
 *
 * Las de los centros salen de la fila de cada FIR ("ACC EZEIZA / EZEIZA CENTRO … SECTOR
 * NORTE/ 135.50 MHz …") y la línea que separa los sectores, de sus observaciones ("a) DIVISIÓN
 * DEL SECTOR NORTE Y SECTOR SUR …"). Es la del espacio aéreo inferior, que es donde vuela un
 * avión de escuela. El sector Oceánico de Ezeiza no se separa: queda como Sur.
 */

/* ------------------------------------------------------------- coordenadas --- */

/** "3013S - 06012W", "3008S - 0603630W", "2649S 06149W": grados y minutos, a veces segundos. */
const RE_COORD_GM = /(\d{4}|\d{6})\s*S\s*[-–/]?\s*(\d{5}|\d{7})\s*W/g;

function deGradosMinutos(lat: string, lon: string): Punto {
  const g = (s: string, digitosGrados: number) => {
    const grados = Number(s.slice(0, digitosGrados));
    const minutos = Number(s.slice(digitosGrados, digitosGrados + 2));
    const segundos = s.length > digitosGrados + 2 ? Number(s.slice(digitosGrados + 2)) : 0;
    return -(grados + minutos / 60 + segundos / 3600);
  };
  return { lat: g(lat, 2), lon: g(lon, 3) };
}

/* ---------------------------------------------------------------- frontera --- */

/** La longitud de la frontera Argentina–Chile en un paralelo (la mediana de los cruces). */
export function longitudDeFrontera(lat: number, frontera: Punto[][]): number | null {
  const cruces: number[] = [];
  for (const tramo of frontera) {
    for (let i = 1; i < tramo.length; i++) {
      const a = tramo[i - 1];
      const b = tramo[i];
      if ((a.lat - lat) * (b.lat - lat) > 0 || a.lat === b.lat) continue;
      cruces.push(a.lon + ((lat - a.lat) / (b.lat - a.lat)) * (b.lon - a.lon));
    }
  }
  if (!cruces.length) return null;
  cruces.sort((x, y) => x - y);
  return cruces[Math.floor(cruces.length / 2)];
}

/* -------------------------------------------------------------- el límite --- */

/** Lejos del país, para los rodeos: al oeste de Chile, al norte de Bolivia, al este de Brasil. */
const OESTE = -77;
const NORTE = -18;
const ESTE = -50;

type Vecinos = "chile" | "chile-bolivia" | "noreste";

function vecinosDe(texto: string): Vecinos {
  if (/paraguay|brasil/i.test(texto)) return "noreste";
  if (/bolivia/i.test(texto)) return "chile-bolivia";
  return "chile";
}

function rodeo(a: Punto, b: Punto, v: Vecinos): Punto[] {
  if (v === "noreste") return [{ lat: NORTE, lon: a.lon }, { lat: NORTE, lon: ESTE }, { lat: b.lat, lon: ESTE }];
  if (v === "chile-bolivia") return [{ lat: a.lat, lon: OESTE }, { lat: NORTE, lon: OESTE }, { lat: NORTE, lon: b.lon }];
  return [{ lat: a.lat, lon: OESTE }, { lat: b.lat, lon: OESTE }];
}

const RUMBOS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, SO: 225, W: 270, O: 270, NW: 315, NO: 315 };

/** El arco de `a` a `b` alrededor de `centro`, para el lado que dice el texto (o el corto). */
function arcoEntre(centro: Punto, a: Punto, b: Punto, radio: number, hacia: number | null): Punto[] {
  const b1 = rumboVerdadero(centro, a);
  const b2 = rumboVerdadero(centro, b);
  const barridos = [(b2 - b1 + 360) % 360, -((b1 - b2 + 360) % 360)];
  const puntuar = (barrido: number) => {
    if (hacia === null) return Math.abs(barrido);
    const medio = (b1 + barrido / 2 + 360) % 360;
    return Math.abs(((medio - hacia + 540) % 360) - 180);
  };
  const barrido = puntuar(barridos[0]) <= puntuar(barridos[1]) ? barridos[0] : barridos[1];
  const pasos = Math.max(2, Math.ceil(Math.abs(barrido) / 3));
  const out: Punto[] = [];
  for (let i = 1; i < pasos; i++) out.push(puntoDesde(centro, (b1 + (barrido * i) / pasos + 360) % 360, radio));
  return out;
}

/** Dónde corta un círculo un paralelo: el cruce más cercano a `cerca` (la frontera). */
function circuloYParalelo(centro: Punto, radio: number, lat: number, cerca: number): Punto | null {
  let mejor: Punto | null = null;
  for (let b = 0; b < 360; b += 0.25) {
    const p = puntoDesde(centro, b, radio);
    const q = puntoDesde(centro, b + 0.25, radio);
    if ((p.lat - lat) * (q.lat - lat) > 0) continue;
    const t = (lat - p.lat) / (q.lat - p.lat || 1e-9);
    const cruce = { lat, lon: p.lon + t * (q.lon - p.lon) };
    if (!mejor || Math.abs(cruce.lon - cerca) < Math.abs(mejor.lon - cerca)) mejor = cruce;
  }
  return mejor;
}

export interface PuntoFir extends Punto {
  /** Un punto de rodeo o del polo: sirve para saber de qué FIR es un punto, no se dibuja. */
  falso?: boolean;
}

const RE_TOKEN = new RegExp(
  [
    String.raw`(?<coord>(?:\d{4}|\d{6})\s*S\s*[-–/]?\s*(?:\d{5}|\d{7})\s*W)`,
    String.raw`(?<latf>(?:paralelo\s+)?(?<latfLat>\d{4})S\s+y\s+l[íi]mite internacional)`,
    String.raw`(?<arco>arco de (?:radio de )?(?<radio>\d+(?:[.,]\d+)?)\s*NM(?: de radio)? con centro en (?:el )?(?:VOR\s*\/\s*DME|VOR)\s*(?<centro>[A-Z]{3}))`,
    String.raw`(?<run>(?:siguiendo|continuando) (?:por )?(?:el |este |dicho )?(?:y )?l[íi]mite internacional|(?:siguiendo|continuando) por este (?:y )?l[íi]mite)`,
    String.raw`(?<par>paralelo\s+(?<parLat>\d{4})S)`,
    String.raw`(?<mer>meridiano\s+(?<merLon>\d{5})W)`,
    String.raw`(?<polo>Polo Sur)`,
  ].join("|"),
  "g"
);

/**
 * Un límite en prosa, con todo lo que usa ENR 2.1 para las FIR, como lista de puntos. Con
 * `cerrado`, el último tramo vuelve al primero (por el rodeo, si estaba siguiendo la frontera).
 */
export function leerLimiteFir(
  textoCrudo: string,
  nombres: Map<string, Punto>,
  frontera: Punto[][],
  cerrado = true
): { ok: true; puntos: PuntoFir[] } | { ok: false; motivo: string } {
  const texto = textoCrudo.replace(/\s+/g, " ");
  const puntos: PuntoFir[] = [];
  let arcoPendiente: { centro: Punto; radio: number; hacia: number | null } | null = null;
  let fronteraPendiente: Vecinos | null = null;
  let vecinos: Vecinos = "chile";
  const ultimo = () => puntos[puntos.length - 1];

  const agregar = (p: Punto, falso = false): string | null => {
    const u = ultimo();
    if (u && fronteraPendiente) {
      puntos.push(...rodeo(u, p, fronteraPendiente).map((q) => ({ ...q, falso: true })));
      fronteraPendiente = null;
    }
    if (u && arcoPendiente) {
      const { centro, radio, hacia } = arcoPendiente;
      for (const extremo of [u, p]) {
        const d = distanciaNmPrecisa(centro.lat, centro.lon, extremo.lat, extremo.lon);
        if (Math.abs(d - radio) > Math.max(1, radio * 0.06)) return `un extremo de arco a ${d.toFixed(1)} NM del centro, y el radio es ${radio} NM`;
      }
      puntos.push(...arcoEntre(centro, u, p, radio, hacia));
      arcoPendiente = null;
    }
    if (u && Math.abs(u.lat - p.lat) < 1e-9 && Math.abs(u.lon - p.lon) < 1e-9) return null;
    puntos.push({ ...p, falso });
    return null;
  };
  const enFrontera = (lat: number): Punto | string => {
    const lon = longitudDeFrontera(lat, frontera);
    return lon === null ? `la frontera no cruza el paralelo ${lat.toFixed(2)}` : { lat, lon };
  };

  for (const m of texto.matchAll(RE_TOKEN)) {
    const g = m.groups!;
    let error: string | null = null;
    if (g.coord) {
      const c = /(\d{4}|\d{6})\s*S\s*[-–/]?\s*(\d{5}|\d{7})\s*W/.exec(g.coord)!;
      error = agregar(deGradosMinutos(c[1], c[2]));
    } else if (g.latf) {
      const lat = deGradosMinutos(g.latfLat, "00000").lat;
      vecinos = vecinosDe(texto.slice(m.index!, m.index! + 90));
      const f = enFrontera(lat);
      if (typeof f === "string") return { ok: false, motivo: f };
      if (arcoPendiente) {
        // "un arco … hacia el S hasta interceptar el paralelo 4127S y límite internacional"
        const cruce = circuloYParalelo(arcoPendiente.centro, arcoPendiente.radio, lat, f.lon);
        if (!cruce) return { ok: false, motivo: "el arco no corta el paralelo" };
        const { centro, radio, hacia } = arcoPendiente;
        arcoPendiente = null;
        puntos.push(...arcoEntre(centro, ultimo(), cruce, radio, hacia));
        puntos.push(cruce);
      } else {
        error = agregar(f);
      }
    } else if (g.arco) {
      const centro = nombres.get(g.centro);
      if (!centro) return { ok: false, motivo: `no está la coordenada de ${g.centro}` };
      const resto = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      const h = /(?:hacia el|sentido)\s+(NE|NW|NO|SE|SW|SO|N|E|S|W|O)\b/.exec(resto);
      arcoPendiente = { centro, radio: Number(g.radio.replace(",", ".")), hacia: h ? RUMBOS[h[1]] : null };
    } else if (g.run) {
      const contexto = texto.slice(Math.max(0, m.index! - 60), m.index! + 90);
      if (/bolivia|paraguay|brasil|chile/i.test(contexto)) vecinos = vecinosDe(contexto);
      fronteraPendiente = vecinos;
    } else if (g.par) {
      const lat = deGradosMinutos(g.parLat, "00000").lat;
      if (fronteraPendiente) {
        const f = enFrontera(lat);
        if (typeof f === "string") return { ok: false, motivo: f };
        error = agregar(f);
      } else if (ultimo()) {
        error = agregar({ lat, lon: ultimo().lon }, ultimo().falso);
      }
    } else if (g.mer) {
      const lon = deGradosMinutos("0000", g.merLon).lon;
      if (ultimo()) error = agregar({ lat: ultimo().lat, lon }, ultimo().falso);
    } else if (g.polo) {
      if (ultimo()) error = agregar({ lat: -89, lon: ultimo().lon }, true);
    }
    if (error) return { ok: false, motivo: error };
  }

  if (puntos.length < 2) return { ok: false, motivo: "sin puntos" };
  if (cerrado) {
    const primero = puntos[0];
    if (fronteraPendiente) puntos.push(...rodeo(ultimo(), primero, fronteraPendiente).map((q) => ({ ...q, falso: true })));
    const u = ultimo();
    if (Math.abs(u.lat - primero.lat) < 1e-9 && Math.abs(u.lon - primero.lon) < 1e-9) puntos.pop();
  }
  return { ok: true, puntos };
}

/* --------------------------------------------------------- centro y sectores --- */

export type { Frecuencias };

const RE_MHZ = /^(\d{3}\.\d{1,3})\s*MHz/;
const esEmergencia = (mhz: string) => Number(mhz) === 121.5;

/**
 * La dependencia y sus frecuencias de una fila de ENR 2.1: la primera línea "ACC …", "APP …"
 * o "TWR …", su distintivo (hasta la barra: "EZEIZA CENTRO/"), y cada "MHz" bajo el último
 * "SECTOR X" visto. Se recorre la fila entera porque el PDF, cuando la fila cambia de página,
 * deja las frecuencias del segundo sector después de las observaciones (TMA Baires).
 */
export function frecuenciasDeFila(fila: string, unidad: RegExp = /^(ACC|APP|TWR)\s+\S/): Frecuencias | null {
  const lineas = fila.split("\n").map((l) => l.trim());
  const i = lineas.findIndex((l) => unidad.test(l));
  if (i < 0) return null;
  // El distintivo, en castellano: el primer renglón con TORRE, CONTROL o CENTRO, hasta la
  // barra ("EZEIZA CENTRO/", "CONLARA TORRE" antes de "CONLARA TOWER"). Si sólo dice "CONTROL",
  // va con el renglón de arriba ("BAHÍA BLANCA / CONTROL/ BAHÍA BLANCA CONTROL").
  let distintivo = "";
  for (let j = i + 1; j < Math.min(lineas.length, i + 7); j++) {
    const l = lineas[j];
    if (/^(ESPAÑOL|SPANISH)/i.test(l)) break;
    if (!/\b(TORRE|CONTROL|CENTRO|APROXIMACI[ÓO]N|RADAR)\b/.test(l.split("/")[0])) continue;
    const antes = l.split("/")[0].trim();
    distintivo = /\s/.test(antes) || j === i + 1 ? antes : `${lineas[j - 1]} ${antes}`;
    break;
  }
  distintivo = distintivo.replace(/\s+/g, " ").trim();

  const sectores: Frecuencias["sectores"] = [];
  let actual: Frecuencias["sectores"][number] | null = null;
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j];
    if (j > i + 1 && unidad.test(l)) break; // otra dependencia (Resistencia tiene "ACC SIS")
    const sector = /^SECTOR\s*([A-ZÁÉÍÓÚÑÜ]*)/.exec(l);
    if (sector) {
      const nombre = (sector[1] || /^([A-ZÁÉÍÓÚÑÜ]+)/.exec(lineas[j + 1] ?? "")?.[1] || "").replace(/\W/g, "");
      if (nombre) {
        actual = sectores.find((s) => s.nombre === nombre) ?? { nombre, mhz: [] };
        if (!sectores.includes(actual)) sectores.push(actual);
      }
      continue;
    }
    const mhz = RE_MHZ.exec(l);
    if (mhz && !esEmergencia(mhz[1])) {
      if (!actual) {
        actual = { nombre: null, mhz: [] };
        sectores.push(actual);
      }
      if (!actual.mhz.includes(mhz[1])) actual.mhz.push(mhz[1]);
    }
  }
  const conFrecuencias = sectores.filter((s) => s.mhz.length);
  return distintivo && conFrecuencias.length ? { distintivo, sectores: conFrecuencias } : null;
}

/** La línea que separa el sector Norte del Sur, de oeste a este. */
export function lineaDeSectores(fila: string, nombres: Map<string, Punto>, frontera: Punto[][]): Punto[] | null {
  const lineas = fila.split("\n");
  const i = lineas.findIndex((l) => /DIVISIÓN DEL (SECTOR NORTE|ESPACIO AÉREO)/.test(l));
  if (i < 0) return null;
  const parrafo = [];
  for (let j = i; j < Math.min(lineas.length, i + 40); j++) {
    if (j > i + 2 && /^(Quedando|quedando|Verticalmente|Vertically|ESPACIO AÉREO RVSM|b\))/.test(lineas[j].trim())) break;
    if (/^(AIP ARGENTINA|DEPARTAMENTO|ENR 2|Nombre\.|Clase de|Name\.|class|Identificaci|dependencia|presta|Distintivo|Idiomas|servicio|Identification|unit|service|Languages|Hours|Frecuencia|- Prop|Frequency|purpose|Observaciones|Remarks|\/)/.test(lineas[j].trim())) continue;
    parrafo.push(lineas[j]);
  }
  const texto = parrafo.join(" ");
  const coords = [...texto.matchAll(RE_COORD_GM)];
  if (coords.length === 0) {
    // "Es determinado por el paralelo 4500S extendiéndose desde el límite Oeste hasta el límite Este".
    const par = /paralelo\s+(\d{4})S/.exec(texto);
    if (!par) return null;
    const lat = deGradosMinutos(par[1], "00000").lat;
    return [{ lat, lon: OESTE }, { lat, lon: ESTE }];
  }
  const r = leerLimiteFir(texto.slice(texto.search(/desde/i)), nombres, frontera, false);
  if (!r.ok) return null;
  const pts = r.puntos.map(({ lat, lon }) => ({ lat, lon }));
  return pts[0].lon > pts[pts.length - 1].lon ? pts.reverse() : pts;
}

/** ¿El punto está al norte de la línea? Fuera de sus extremos, la línea sigue horizontal. */
export function alNorteDe(linea: Punto[], p: Punto): boolean {
  if (p.lon <= linea[0].lon) return p.lat > linea[0].lat;
  if (p.lon >= linea[linea.length - 1].lon) return p.lat > linea[linea.length - 1].lat;
  for (let i = 1; i < linea.length; i++) {
    const a = linea[i - 1];
    const b = linea[i];
    if (p.lon >= Math.min(a.lon, b.lon) && p.lon <= Math.max(a.lon, b.lon) && a.lon !== b.lon) {
      return p.lat > a.lat + ((p.lon - a.lon) / (b.lon - a.lon)) * (b.lat - a.lat);
    }
  }
  return p.lat > linea[0].lat;
}

/* ----------------------------------------------------------------- armado --- */

export interface Fir {
  /** "FIR EZEIZA". */
  nombre: string;
  /** Para saber de qué FIR es un punto: incluye los rodeos. [lat, lon]. */
  poligono: [number, number][];
  /** Lo que se dibuja: los tramos del AIP, sin los rodeos ni la frontera. */
  bordes: [number, number][][];
  centro: Frecuencias | null;
  /** La línea entre el sector Norte y el Sur, si el centro tiene sectores. */
  lineaSectores: [number, number][] | null;
}

/** Las filas de FIR de `ENR-2.1.txt`. */
export function filasFir(texto: string): string[] {
  return texto.split(/\n\n(?=FIR [A-ZÁÉÍÓÚÑÜ ]+\nDesde)/).filter((b) => /^FIR [A-ZÁÉÍÓÚÑÜ ]+\nDesde/.test(b));
}

export function armarFirs(enr21: string, nombres: Map<string, Punto>, frontera: Punto[][]): { firs: Fir[]; descartadas: { nombre: string; motivo: string }[] } {
  const firs: Fir[] = [];
  const descartadas: { nombre: string; motivo: string }[] = [];
  for (const fila of filasFir(enr21)) {
    const lineas = fila.split("\n");
    const nombre = lineas[0].trim();
    // El límite en castellano: hasta el techo ("UNL") que va después.
    const fin = lineas.findIndex((l, i) => i > 0 && /^(UNL|FL\s*\d+)\s*$/.test(l.trim()));
    const lateral = lineas.slice(1, fin > 0 ? fin : undefined).join(" ");
    const r = leerLimiteFir(lateral, nombres, frontera);
    if (!r.ok) {
      descartadas.push({ nombre, motivo: r.motivo });
      continue;
    }
    const bordes: [number, number][][] = [];
    let actual: [number, number][] = [];
    const n = r.puntos.length;
    for (let i = 0; i <= n; i++) {
      const p = r.puntos[i % n];
      if (p.falso) {
        if (actual.length > 1) bordes.push(actual);
        actual = [];
      } else actual.push([p.lat, p.lon]);
    }
    if (actual.length > 1) bordes.push(actual);
    const linea = lineaDeSectores(fila, nombres, frontera);
    firs.push({
      nombre,
      poligono: r.puntos.map((p) => [p.lat, p.lon]),
      bordes,
      centro: frecuenciasDeFila(fila, /^ACC\s+\S/),
      lineaSectores: linea ? linea.map((p) => [p.lat, p.lon]) : null,
    });
  }
  return { firs, descartadas };
}

/* --------------------------------------------------- con quién se habla --- */

/** Techo y piso en pies de un texto de límites ("FL 55 / GND", "2.500 ft / GND"). `null` si no se entiende. */
export function rangoEnPies(limites: string): { techo: number; piso: number } | null {
  if (/\(I+\)/.test(limites)) return null;
  const valores = [...limites.matchAll(/FL\s*(\d+)|([\d.]+)\s*FT|\b(GND|SFC|MSL)\b|\b(UNL)\b/gi)].map((m) =>
    m[1] ? Number(m[1]) * 100 : m[2] ? Number(m[2].replace(/\./g, "")) : m[3] ? 0 : 999999
  );
  if (valores.length !== 2) return null;
  return { techo: Math.max(...valores), piso: Math.min(...valores) };
}

/**
 * La FIR de un punto. Si no cae en ninguna, la más cercana a menos de 10 NM: el AIP traza el
 * límite con Montevideo por el río Uruguay con rectas entre puntos del río, y tres aeródromos
 * de la costa entrerriana (Concepción del Uruguay, por ejemplo) quedan del lado de afuera.
 */
export function firDe(p: Punto, firs: Fir[]): Fir | null {
  const adentro = firs.find((f) => contiene(f.poligono, p));
  if (adentro) return adentro;
  let mejor: { fir: Fir; d: number } | null = null;
  for (const f of firs) {
    for (const borde of f.bordes) {
      for (let i = 1; i < borde.length; i++) {
        const d = aSegmentoNm(p, { lat: borde[i - 1][0], lon: borde[i - 1][1] }, { lat: borde[i][0], lon: borde[i][1] });
        if (d < 10 && (!mejor || d < mejor.d)) mejor = { fir: f, d };
      }
    }
  }
  return mejor?.fir ?? null;
}

function aSegmentoNm(p: Punto, a: Punto, b: Punto): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 60;
  const [px, py, ax, ay, bx, by] = [p.lon * k, p.lat * 60, a.lon * k, a.lat * 60, b.lon * k, b.lat * 60];
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export interface Dependencia {
  /**
   * - `torre`: la de la CTR o ATZ, o la de un aeródromo controlado en la salida o la llegada;
   * - `tma`: el control de la TMA;
   * - `claseG`: fuera de todo eso y por debajo de FL 245, clase G (ENR 2.1): sin control, y el
   *   centro sólo como información de vuelo;
   * - `centro`: por encima de FL 245;
   * - `aerodromo`: un aeródromo no controlado, en la salida o la llegada.
   */
  tipo: "torre" | "tma" | "claseG" | "centro" | "aerodromo";
  /** "ATZ SAN FERNANDO (I)", "TMA BAIRES (I)", "Clase G · FIR EZEIZA · Sector SUR". */
  donde: string;
  distintivo: string;
  mhz: string[];
  /** Lo que conviene saber además: la información de vuelo en clase G, de dónde sale un canal. */
  nota?: string;
}

/** Lo que el Mapa sabe de un aeródromo para la salida y la llegada. */
export interface RadioDeAerodromo {
  /** `null` si MADHEL no lo dice. */
  controlado: boolean | null;
  /** El canal de llamada, si es no controlado: de su ficha de MADHEL o de la lista de la zona. */
  llamada: string[];
  fuenteLlamada?: "madhel" | "lista";
  /** La torre de AD 2.18, si es controlado y está en el AIP. */
  torre: Frecuencias | null;
}

/** Por encima de esto la FIR es clase A o F (ENR 2.1): ahí sí se habla con el centro. */
const TECHO_CLASE_G = 24500;

/** El espacio con su dependencia ya resuelta (las torres de AD 2.18, las TMA de ENR 2.1). */
export type EspacioConDependencia = EspacioAereo;

/**
 * Quién te atiende en un punto, del espacio más chico al más grande: la torre de la CTR o ATZ,
 * el control de la TMA y el centro de la FIR, con su sector. Con `altitudFt`, sólo los espacios
 * en cuyos límites estás (a FL 060 pasás por arriba de un ATZ de 2500 ft); sin ella, todos los
 * que te contienen lateralmente.
 */
export function dependenciasEn(p: Punto, altitudFt: number | null, espacios: EspacioConDependencia[], firs: Fir[], vfr?: Vfr): Dependencia[] {
  const out: Dependencia[] = [];
  const orden = { ATZ: 0, CTR: 1, TMA: 2 } as const;
  const adentro = espacios
    .filter((e) => e.dependencia && contiene(e.poligono, p) && !(e.huecos ?? []).some((h) => contiene(h, p)))
    .filter((e) => {
      if (altitudFt === null) return true;
      const r = rangoEnPies(e.limites);
      return !r || (altitudFt <= r.techo && altitudFt >= r.piso);
    })
    .sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  // Un corredor o sector VFR (ENR 3.3) es clase G aunque esté dentro de una CTR o debajo de la
  // TMA: ahí no se habla con Aeroparque ni con Baires. Sólo una ATZ controlada le gana.
  const corredor = vfr ? enVfr(p, altitudFt, vfr.corredores, vfr.sectores, espacios.filter((e) => e.tipo === "CTR").map((e) => e.poligono)) : null;
  const atzControlada = adentro.find((e) => e.tipo === "ATZ");
  if (corredor && !atzControlada) {
    out.push({
      tipo: "claseG",
      donde: corredor.nombre,
      distintivo: "Sin control (clase G)",
      mhz: [],
      nota: `${corredor.tipo === "corredor" ? "Corredor" : "Sector"} VFR de ENR 3.3: hasta ${String(corredor.techoFt).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ft${corredor.agl ? " sobre el terreno" : ""}.${corredor.informacion ? ` Información de vuelo: ${corredor.informacion}.` : ""}`,
    });
  }
  for (const e of adentro) {
    if (corredor && !atzControlada) break;
    const d = e.dependencia!;
    out.push({
      tipo: e.tipo === "TMA" ? "tma" : "torre",
      donde: e.nombre,
      distintivo: d.distintivo,
      mhz: d.sectores.flatMap((s) => (s.nombre ? s.mhz.map((m) => `${m} (${s.nombre!.toLowerCase()})`) : s.mhz)),
    });
  }
  const fir = firDe(p, firs);
  if (fir?.centro) {
    const conSectores = fir.centro.sectores.filter((s) => s.nombre && /^(NORTE|SUR)$/.test(s.nombre));
    let sector = fir.centro.sectores[0];
    if (fir.lineaSectores && conSectores.length === 2) {
      const norte = alNorteDe(fir.lineaSectores.map(([lat, lon]) => ({ lat, lon })), p);
      sector = conSectores.find((s) => s.nombre === (norte ? "NORTE" : "SUR")) ?? sector;
    }
    const donde = `${fir.nombre}${sector.nombre ? ` · Sector ${sector.nombre.toLowerCase()}` : ""}`;
    if (altitudFt !== null && altitudFt > TECHO_CLASE_G) {
      out.push({ tipo: "centro", donde, distintivo: fir.centro.distintivo, mhz: sector.mhz });
    } else {
      // Clase G de GND a FL 245 en las cinco FIR (ENR 2.1, "CLASE DE ESPACIO AÉREO"): nadie te
      // controla. El centro da información de vuelo a quien la pida.
      out.push({
        tipo: "claseG",
        donde: `Clase G · ${donde}`,
        distintivo: "Sin control (clase G)",
        mhz: [],
        nota: `Información de vuelo: ${fir.centro.distintivo} ${sector.mhz.join(" · ")}`,
      });
    }
  }
  return out;
}

export interface Cambio {
  /** Millas desde la salida donde empezás a hablar con esta dependencia. */
  desdeNm: number;
  dependencia: Dependencia;
}

/**
 * Con quién hablás a lo largo de la ruta: la dependencia más chica en cada punto, cada media
 * milla, sin repetir. La salida y la llegada van a nivel del suelo (la torre); el resto, a la
 * altitud de crucero.
 */
export function dependenciasDeRuta(
  puntos: (Punto & { codigo?: string; label?: string })[],
  altitudFt: number | null,
  espacios: EspacioConDependencia[],
  firs: Fir[],
  aerodromos: Map<string, RadioDeAerodromo> = new Map(),
  /** En vuelo el primer punto es tu posición, no una salida en el suelo. */
  desdeElAire = false,
  vfr?: Vfr
): Cambio[] {
  const cambios: Cambio[] = [];
  // La misma torre escrita distinto (TMA "MAR DEL PLATA TORRE", CTR "Mar del Plata Torre") es una sola.
  const clave = (d: Dependencia) => `${d.distintivo.toUpperCase()}|${d.mhz.map((m) => m.replace(/\s.*$/, "")).join(",")}`;
  let recorrido = 0;
  const mirar = (p: Punto & { codigo?: string; label?: string }, alt: number | null, nm: number, extremo = false) => {
    const d = extremo ? enElAerodromo(p, espacios, firs, aerodromos) : dependenciasEn(p, alt, espacios, firs, vfr)[0];
    if (d && (!cambios.length || clave(cambios[cambios.length - 1].dependencia) !== clave(d))) cambios.push({ desdeNm: nm, dependencia: d });
  };
  if (puntos.length === 0) return cambios;
  if (desdeElAire) mirar(puntos[0], altitudFt, 0);
  else mirar(puntos[0], 0, 0, true);
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const d = distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
    const rumbo = rumboVerdadero(a, b);
    const pasos = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 1; k <= pasos; k++) {
      const esLlegada = i === puntos.length - 1 && k === pasos;
      mirar(k === pasos ? b : puntoDesde(a, rumbo, (d * k) / pasos), esLlegada ? 0 : altitudFt, recorrido + (d * k) / pasos, esLlegada);
    }
    recorrido += d;
  }
  return cambios;
}

/**
 * Con quién hablás en el suelo de un aeródromo (la salida o la llegada): la torre de su CTR o
 * ATZ, o la de AD 2.18 si es controlado; si es no controlado, su canal de llamada de MADHEL. Un
 * aeródromo no controlado debajo de una TMA opera con las reglas de la RAAC 91 y sus normas
 * particulares (ENR 1.1, Anexo BRAVO, a donde remiten sus fichas), no con la TMA.
 */
export function enElAerodromo(
  p: Punto & { codigo?: string; label?: string },
  espacios: EspacioConDependencia[],
  firs: Fir[],
  aerodromos: Map<string, RadioDeAerodromo>
): Dependencia | undefined {
  const en = dependenciasEn(p, 0, espacios, firs);
  if (en[0]?.tipo === "torre") return en[0];
  const ad = p.codigo ? aerodromos.get(p.codigo.toUpperCase()) : undefined;
  if (ad?.torre) {
    return { tipo: "torre", donde: `${p.label ?? p.codigo} · controlado`, distintivo: ad.torre.distintivo, mhz: ad.torre.sectores.flatMap((s) => s.mhz) };
  }
  if (ad && ad.controlado === false) {
    const fuente = !ad.llamada.length
      ? "Sin canal publicado (ni en MADHEL ni en la lista de la zona)."
      : ad.fuenteLlamada === "lista"
        ? "De la lista de frecuencias de la zona; no lo publica el AIP."
        : "El que publica su ficha de MADHEL.";
    // ENR 1.1, Anexo BRAVO (aeródromos debajo de una TMA): no fija una frecuencia común; sí que
    // el circuito va "a una altura máxima de 1.500 pies".
    const debajoDeTma = espacios.some((e) => e.tipo === "TMA" && contiene(e.poligono, p) && !(e.huecos ?? []).some((h) => contiene(h, p)));
    return {
      tipo: "aerodromo",
      donde: `${p.label ?? p.codigo} · no controlado`,
      distintivo: ad.llamada.length ? "Canal de llamada" : "Aeródromo no controlado",
      mhz: ad.llamada,
      nota: debajoDeTma ? `${fuente} Debajo de la TMA: circuito a 1.500 ft como máximo (ENR 1.1, Anexo BRAVO).` : fuente,
    };
  }
  return en[0];
}

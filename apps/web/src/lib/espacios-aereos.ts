import { distanciaNmPrecisa } from "./distance";
import { puntoDesde, rumboVerdadero, type Punto } from "./navegacion";

/**
 * **Los espacios aéreos controlados, dibujables** (3.0.0): las CTR y ATZ de AD 2.17 de cada
 * aeródromo y las TMA de ENR 2.1, para el mapa.
 *
 * ## De dónde salen
 *
 * Del texto del AIP **tal como está commiteado** (`src/data/aip/<ICAO>.txt`, que guarda
 * `build-aip.mjs`, y `src/data/aip/ENR-2.1.txt`, de `build-espacios.mjs`). No hay polígonos
 * guardados: se arman acá, en cada arranque, a partir del texto oficial. Así lo que se
 * dibuja se puede contrastar contra la fuente (invariante 12) y un cambio del AIP llega solo.
 *
 * ## Cómo se lee un límite lateral
 *
 * El AIP los escribe en prosa: "Desde 335428S - 0582732W … siguiendo un arco de 55 NM de
 * radio con centro en el VOR/DME EZE (344927S - 0583207W) hacia el SW hasta 335428S -
 * 0582732W". Lo que se usa:
 *
 * - **las coordenadas**, en el orden del texto, son los vértices;
 * - la coordenada que sigue a "centro en" es el **centro** de un arco o de un círculo, no un
 *   vértice. Si el centro sólo se nombra ("centro en VOR/DME CAT"), se usa la coordenada que
 *   el mismo texto dio antes para ese nombre, o la del arco anterior del mismo radio;
 * - "arco de N NM" entre dos vértices es un **arco** alrededor de su centro; lo demás, una
 *   recta. Cuando el texto sigue una ruta, un río o el límite de una FIR entre dos puntos, se
 *   dibuja recto y el espacio queda marcado como **aproximado**.
 *
 * ## Lo que no valida no se dibuja
 *
 * Un espacio aéreo mal dibujado es peor que uno que falta: el piloto confía en el borde. Por
 * eso cada uno tiene que pasar todo esto, y si no, va a `descartados` con el motivo:
 *
 * - el contorno **cierra** (termina en el punto donde empezó) o es un círculo;
 * - los dos extremos de cada arco **están sobre el radio** que dice el texto (±0,6 NM o 6 %):
 *   si no, el arco o el centro se leyeron mal;
 * - el polígono **no se cruza** consigo mismo;
 * - una CTR o ATZ **contiene a su aeródromo**, y una TMA al centro de su arco más grande;
 * - si un arco no dice para qué lado va, se prueban los dos y tiene que quedar **uno solo**
 *   que cumpla lo anterior, o el que va hacia donde dice el texto ("hacia el SW").
 *
 * Lo que se descarta, por ejemplo: la CTR Sauce Viejo, que se define con radiales sin
 * coordenadas, o una TMA cuyo texto se mezcla con otra columna de la tabla del PDF.
 */

export type TipoEspacio = "CTR" | "ATZ" | "TMA";

export interface EspacioAereo {
  /** "SADF-ATZ", "TMA-BAIRES". */
  id: string;
  tipo: TipoEspacio;
  /** Como lo escribe el AIP: "ATZ SAN FERNANDO". */
  nombre: string;
  /** Techo y piso, tal cual: "2500 FT / GND", "(I) FL 245 / 2500 FT AGL/ AMSL …". */
  limites: string;
  /** "C", "D", "A, B, C"; `null` si el texto no lo dice. */
  clase: string | null;
  /** [lat, lon], sin repetir el primero al final. */
  poligono: [number, number][];
  /** Algún tramo sigue una ruta, un río o un límite y se dibujó recto. */
  aproximado: boolean;
  /** "SADF AD 2.17", "ENR 2.1". */
  fuente: string;
  /**
   * Lo que no es de este espacio aunque esté adentro del contorno: en un espacio dividido en
   * sectores por nivel, el sector (II) es "el resto" y el (I) es su hueco (TMA Baires).
   */
  huecos?: [number, number][][];
  /** Con quién se habla adentro: la torre (AD 2.18) o el control de la TMA (ENR 2.1). */
  dependencia?: Frecuencias | null;
}

export interface Frecuencias {
  /** "EZEIZA CENTRO", "BAIRES CONTROL", "Fernando Torre". */
  distintivo: string;
  /** Por sector ("NORTE", "SUR"); `nombre: null` si la dependencia no tiene sectores. */
  sectores: { nombre: string | null; mhz: string[] }[];
}

/** ¿El punto está en el espacio? Adentro del contorno y fuera de sus huecos. */
export function dentroDelEspacio(e: Pick<EspacioAereo, "poligono" | "huecos">, p: Punto): boolean {
  return contiene(e.poligono, p) && !(e.huecos ?? []).some((h) => contiene(h, p));
}

export interface EspacioDescartado {
  tipo: TipoEspacio;
  nombre: string;
  fuente: string;
  motivo: string;
}

/* ------------------------------------------------------------- coordenadas --- */

/**
 * "342813S - 0584056W", "335458S -0695204W", "372800S/0562700W", "344927S 0583207W". También
 * como vienen a veces, mal escritas: sin el cero de la longitud ("454624S 672218W",
 * Comodoro Rivadavia) o sin la W antes del paréntesis ("(272649S 0590326)", Resistencia).
 */
const RE_COORD = /(\d{2})(\d{2})(\d{2})\s*S\s*[-–/]?\s*(\d{2,3})(\d{2})(\d{2})(?:\s*W|(?=\s*\)))/g;

interface CoordEnTexto extends Punto {
  /** Dónde empieza y termina en el texto. */
  desde: number;
  hasta: number;
  /** Como está escrita, normalizada: "342813S0584056W". */
  clave: string;
}

export function coordenadasDe(texto: string): CoordEnTexto[] {
  const out: CoordEnTexto[] = [];
  for (const m of texto.matchAll(RE_COORD)) {
    const [, la, lm, ls, oa, om, os] = m;
    out.push({
      lat: -(Number(la) + Number(lm) / 60 + Number(ls) / 3600),
      lon: -(Number(oa) + Number(om) / 60 + Number(os) / 3600),
      desde: m.index!,
      hasta: m.index! + m[0].length,
      clave: `${la}${lm}${ls}S${oa.padStart(3, "0")}${om}${os}W`,
    });
  }
  return out;
}

/** Los nombres con su coordenada en un texto: "VOR/DME FDO (342705S - 0583503W)" → FDO. */
export function nombradosDe(texto: string): Map<string, Punto> {
  const plano = texto.replace(/\s+/g, " ");
  const nombrados = new Map<string, Punto>();
  for (const c of coordenadasDe(plano)) {
    const antes = plano.slice(Math.max(0, c.desde - 14), c.desde);
    const m = /\b([A-Z]{3})\s*\(?\s*$/.exec(antes);
    if (m && !nombrados.has(m[1])) nombrados.set(m[1], { lat: c.lat, lon: c.lon });
  }
  return nombrados;
}

/* ---------------------------------------------------------------- geometría --- */

const dist = (a: Punto, b: Punto) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);

/** El arco de `desde` a `hasta` alrededor de `centro`, sin los extremos, cada ~5°. */
function arco(centro: Punto, desde: Punto, hasta: Punto, radio: number, horario: boolean): Punto[] {
  const b1 = rumboVerdadero(centro, desde);
  const b2 = rumboVerdadero(centro, hasta);
  let barrido = horario ? (b2 - b1 + 360) % 360 : -((b1 - b2 + 360) % 360);
  if (Math.abs(barrido) < 1e-6) barrido = horario ? 360 : -360;
  const pasos = Math.max(2, Math.ceil(Math.abs(barrido) / 5));
  const out: Punto[] = [];
  for (let i = 1; i < pasos; i++) out.push(puntoDesde(centro, (b1 + (barrido * i) / pasos + 360) % 360, radio));
  return out;
}

function circulo(centro: Punto, radio: number): Punto[] {
  const out: Punto[] = [];
  for (let b = 0; b < 360; b += 5) out.push(puntoDesde(centro, b, radio));
  return out;
}

/** Proyección local plana (x = lon·cos(lat)) para las pruebas de cruce y de inclusión. */
function plano(p: Punto, latRef: number): [number, number] {
  return [p.lon * Math.cos((latRef * Math.PI) / 180), p.lat];
}

/** ¿El punto está adentro del polígono? Ray casting en el plano local. */
export function contiene(poligono: [number, number][], p: Punto): boolean {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i];
    const [yj, xj] = poligono[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

function seCortan(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** ¿Algún lado se cruza con otro que no sea su vecino? */
function seCruza(puntos: Punto[]): boolean {
  const latRef = puntos[0].lat;
  const q = puntos.map((p) => plano(p, latRef));
  const n = q.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (seCortan(q[i], q[(i + 1) % n], q[j], q[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Área aproximada en NM² (fórmula del agrimensor sobre el plano local). */
function areaNm2(puntos: Punto[]): number {
  const latRef = puntos[0].lat;
  const q = puntos.map((p) => plano(p, latRef));
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i];
    const [x2, y2] = q[(i + 1) % q.length];
    s += x1 * y2 - x2 * y1;
  }
  return (Math.abs(s) / 2) * 60 * 60;
}

/* ---------------------------------------------------- el límite lateral --- */

/** Las direcciones con que el AIP dice para dónde va un arco ("hacia el SW"). */
const RUMBOS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, E: 90, SE: 135, S: 180, SUR: 180, SW: 225, SO: 225, W: 270, O: 270, NW: 315, NO: 315, NNW: 337.5 };

const RE_RADIO = /(\d+(?:[.,]\d+)?)\s*(?:NM|MN)\b/i;
const RE_TRAMO_TORCIDO = /\b(RN|RP|Av\.?|avenida|calle|r[ií]o|costa|v[ií]a|FFCC|l[ií]mite|autopista|ruta|camino)\b/i;

export type Limite =
  | {
      ok: true;
      poligono: Punto[];
      aproximado: boolean;
      centros: Punto[];
      usadas: string[];
      /** Los tramos rectos que en el texto siguen el límite de otro espacio ("siguiendo el límite del TMA SDE"). */
      porVecinos?: { desde: Punto; hasta: Punto; vecino: string }[];
    }
  | { ok: false; motivo: string };

interface Arco {
  /** Posición de la palabra "arco" en el texto. */
  en: number;
  radio: number;
  centro: Punto | null;
  horario: boolean | null;
  hacia: number | null;
}

/**
 * Un límite lateral en prosa, como polígono. `referencia` es el punto que tiene que quedar
 * adentro (el aeródromo de una CTR): sirve para elegir para qué lado va un arco.
 */
export function leerLimite(textoCrudo: string, referencia: Punto | null, externos?: Map<string, Punto>, contenedor?: Punto[]): Limite {
  const texto = textoCrudo.replace(/\s+/g, " ").trim();
  const coords = coordenadasDe(texto);

  // Los nombres con su coordenada ("VOR/DME EZE (344927S - 0583207W)"), para los centros y
  // los vértices que el texto nombra sin repetir la coordenada. Si no está en este texto, la
  // del resto del bloque (`externos`): el sector (II) de San Fernando dice "hasta el VOR FDO"
  // y la coordenada de FDO está en el límite lateral del ATZ.
  const nombrados = nombradosDe(texto);
  for (const [k, v] of externos ?? []) if (!nombrados.has(k)) nombrados.set(k, v);

  // Cada "centro en" se lleva la primera coordenada que le sigue, si no hay un "hasta" antes.
  const centros = new Map<number, Punto | null>();
  const esCentro = new Set<number>();
  for (const m of texto.matchAll(/centro(?:\s+en)?/gi)) {
    const desde = m.index! + m[0].length;
    const c = coords.find((x) => x.desde >= desde);
    const medio = c ? texto.slice(desde, c.desde) : "";
    if (c && c.desde - desde < 120 && !/\bhasta\b/i.test(medio)) {
      centros.set(m.index!, c);
      esCentro.add(c.desde);
    } else {
      const nombre = /^\s*(?:el\s+)?(?:punto de notificaci[oó]n\s+\w+\s+)?(?:D?VOR(?:\s*\/\s*DME)?|NDB|DME)?\s*([A-Z]{3})\b/.exec(texto.slice(desde));
      centros.set(m.index!, nombre ? nombrados.get(nombre[1]) ?? null : null);
    }
  }
  const centroDesde = (pos: number): Punto | null => {
    const k = [...centros.keys()].find((k) => k >= pos);
    return k === undefined ? null : centros.get(k) ?? null;
  };

  const vertices = coords.filter((c) => !esCentro.has(c.desde));
  const centrosUsados = coords.filter((c) => esCentro.has(c.desde));

  // Un vértice nombrado, sin coordenada pegada: "Luego hacia el SW hasta el VOR FDO, …".
  for (const m of texto.matchAll(/\bhasta (?:el )?(?:D?VOR(?:\s*\/\s*DME)?|NDB) ([A-Z]{3})\b/g)) {
    const fin = m.index! + m[0].length;
    const siguiente = coords.find((x) => x.desde >= fin);
    if (siguiente && siguiente.desde - fin < 6) continue; // la coordenada viene al lado: ya es vértice
    const p = nombrados.get(m[1]);
    if (!p) return { ok: false, motivo: `un vértice nombrado (${m[1]}) sin coordenada` };
    vertices.push({ lat: p.lat, lon: p.lon, desde: m.index!, hasta: fin, clave: m[1] });
  }
  vertices.sort((a, b) => a.desde - b.desde);

  // Un círculo: "Círculo de 10 NM de RDO con centro en …", sin vértices.
  if (/^c[ií]rculo\b/i.test(texto)) {
    const radio = RE_RADIO.exec(texto);
    const centro = centroDesde(0);
    if (!radio || !centro) return { ok: false, motivo: "círculo sin radio o sin centro" };
    if (vertices.length > 0) return { ok: false, motivo: "círculo con vértices: no se sabe cómo combinarlos" };
    return { ok: true, poligono: circulo(centro, Number(radio[1].replace(",", "."))), aproximado: false, centros: [centro], usadas: coords.map((c) => c.clave), porVecinos: [] };
  }

  if (vertices.length < 2) return { ok: false, motivo: "sin coordenadas para el contorno (radiales, o un límite sin puntos)" };

  // Los arcos, en el orden del texto.
  const arcos: Arco[] = [];
  let radioAnterior: { radio: number; centro: Punto } | null = null;
  for (const m of texto.matchAll(/\barco\b/gi)) {
    const resto = texto.slice(m.index!);
    const proximoVertice = vertices.find((v) => v.desde > m.index!);
    const clausula = resto.slice(0, proximoVertice ? proximoVertice.desde - m.index! : resto.length);
    const radio = RE_RADIO.exec(clausula);
    if (!radio) return { ok: false, motivo: "un arco sin radio" };
    const r = Number(radio[1].replace(",", "."));
    let centro = centroDesde(m.index!);
    // "centro en VOR/DME hacia el NW": el del arco anterior con el mismo radio.
    if (!centro && radioAnterior && Math.abs(radioAnterior.radio - r) < 0.01) centro = radioAnterior.centro;
    if (!centro) return { ok: false, motivo: "un arco sin centro" };
    radioAnterior = { radio: r, centro };
    const sentido = /sentido\s+(anti)?horario/i.exec(clausula);
    // "hacia el E" puede venir antes de la palabra arco: "(342813S - 0584056W) hacia el E por
    // Arco DME de 5 NM". Se busca desde el vértice anterior.
    const verticeAnterior = [...vertices].reverse().find((v) => v.desde < m.index!);
    const alrededor = texto.slice(verticeAnterior ? verticeAnterior.hasta : m.index!, m.index! + clausula.length);
    const hacia = /hacia el\s+(NNE|NNW|NE|NW|NO|SE|SW|SO|SUR|N|E|S|W|O)\b/.exec(alrededor);
    arcos.push({ en: m.index!, radio: r, centro, horario: sentido ? !sentido[1] : null, hacia: hacia ? RUMBOS[hacia[1]] : null });
  }

  // El contorno tiene que volver al punto de partida.
  const primero = vertices[0];
  const ultimo = vertices[vertices.length - 1];
  if (primero.clave !== ultimo.clave) return { ok: false, motivo: "el contorno no vuelve al punto de partida" };

  // Los tramos: de cada vértice al siguiente, recto o por un arco.
  interface Tramo {
    desde: CoordEnTexto;
    hasta: CoordEnTexto;
    arco: Arco | null;
    torcido: boolean;
    vecino: string | null;
  }
  const tramos: Tramo[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i];
    const b = vertices[i + 1];
    const enMedio = arcos.filter((x) => x.en > a.desde && x.en < b.desde);
    if (enMedio.length > 1) return { ok: false, motivo: "dos arcos entre dos puntos" };
    const arcoDelTramo = enMedio[0] ?? null;
    if (arcoDelTramo && arcoDelTramo.centro) {
      // El AIP redondea los vértices de las TMA a minutos enteros ("…58S", "…03W"): a 30 NM
      // eso da hasta ~1,5 NM de diferencia con el radio.
      const tolerancia = Math.max(0.6, arcoDelTramo.radio * 0.06);
      for (const extremo of [a, b]) {
        const d = dist(arcoDelTramo.centro, extremo);
        if (Math.abs(d - arcoDelTramo.radio) > tolerancia) {
          return { ok: false, motivo: `un extremo de arco a ${d.toFixed(1)} NM del centro, y el radio es ${arcoDelTramo.radio} NM` };
        }
      }
    }
    const textoEntre = texto.slice(a.hasta, b.desde);
    const vecino = arcoDelTramo ? null : /l[íi]mite (?:del |de la |de los )?((?:TMA|CTR) [A-Za-zÁÉÍÓÚÑÜáéíóúñü ]+?)(?=\s+(?:hacia|hasta)\b)/.exec(textoEntre);
    tramos.push({ desde: a, hasta: b, arco: arcoDelTramo, torcido: !arcoDelTramo && RE_TRAMO_TORCIDO.test(textoEntre), vecino: vecino ? vecino[1].trim() : null });
  }
  if (arcos.some((x) => !tramos.some((t) => t.arco === x))) return { ok: false, motivo: "un arco que no cae entre dos puntos" };

  // Los arcos sin sentido explícito se prueban para los dos lados.
  const dudosos = tramos.filter((t) => t.arco && t.arco.horario === null);
  if (dudosos.length > 4) return { ok: false, motivo: "demasiados arcos sin sentido para probar" };
  const candidatos: { poligono: Punto[]; acierto: number }[] = [];
  for (let combinacion = 0; combinacion < 1 << dudosos.length; combinacion++) {
    const puntos: Punto[] = [];
    let acierto = 0;
    for (const t of tramos) {
      puntos.push(t.desde);
      if (!t.arco) continue;
      const k = dudosos.indexOf(t);
      const horario = k < 0 ? !!t.arco.horario : Boolean(combinacion & (1 << k));
      const medio = arco(t.arco.centro!, t.desde, t.hasta, t.arco.radio, horario);
      puntos.push(...medio);
      // "Hacia el E" es para dónde arranca el arco: la tangente en el primer punto.
      if (k >= 0 && t.arco.hacia !== null) {
        const tangente = (rumboVerdadero(t.arco.centro!, t.desde) + (horario ? 90 : -90) + 360) % 360;
        const diferencia = Math.abs(((tangente - t.arco.hacia + 540) % 360) - 180);
        if (diferencia < 90) acierto++;
      }
    }
    if (puntos.length < 3 || seCruza(puntos)) continue;
    const anillo = puntos.map((p) => [p.lat, p.lon] as [number, number]);
    if (referencia && !contiene(anillo, referencia)) continue;
    // Un sector tiene que caer adentro de su espacio: eso decide para qué lado va su arco.
    if (contenedor && !puntos.every((q) => adentroOBorde(contenedor, q, 0.3))) continue;
    candidatos.push({ poligono: puntos, acierto });
  }
  if (candidatos.length === 0) {
    return { ok: false, motivo: referencia ? "ningún contorno posible contiene su referencia sin cruzarse" : "el contorno se cruza" };
  }
  const mejor = Math.max(...candidatos.map((c) => c.acierto));
  const elegidos = candidatos.filter((c) => c.acierto === mejor);
  if (elegidos.length > 1) return { ok: false, motivo: "no se sabe para qué lado va un arco" };

  return {
    ok: true,
    poligono: elegidos[0].poligono,
    aproximado: tramos.some((t) => t.torcido),
    centros: arcos.map((x) => x.centro!).concat(centrosUsados.filter((c) => !arcos.some((x) => x.centro === c))),
    usadas: coords.map((c) => c.clave),
    porVecinos: tramos.filter((t) => t.vecino).map((t) => ({ desde: { lat: t.desde.lat, lon: t.desde.lon }, hasta: { lat: t.hasta.lat, lon: t.hasta.lon }, vecino: t.vecino! })),
  };
}

/* ------------------------------------------------------------- AD 2.17 --- */

/** Sin las líneas que mete el PDF en cada página (encabezado, pie, número de campo suelto). */
function limpiar(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !/^(AIP ARGENTINA|DEPARTAMENTO|AD 2\.17 ESPACIO AÉREO DE LOS ATS \/ ATS AIRSPACE \(Cont\.\))/.test(l.trim()) && !/^\d$/.test(l.trim()))
    .join("\n");
}

/** "(*) FL 45 GND (**) 2.500 ft GND" → lo de la marca pedida, como "FL 45 / GND". */
function deLaMarca(texto: string, marca: string | null): string {
  const plano = texto.replace(/\s+/g, " ").trim();
  if (!/\(\*+\)/.test(plano)) return plano;
  const partes = plano.split(/(\(\*+\))/).filter((p) => p.trim());
  for (let i = 0; i < partes.length - 1; i++) if (partes[i] === marca) return partes[i + 1].trim();
  return plano;
}

const ALTURA = String.raw`(?:GND|SFC|UNL|FL\s*\d+|[\d.]+\s*ft(?:\s*(?:AGL|AMSL))?)`;

/** "FL 45 GND" → "FL 45 / GND": el techo y el piso, que el AIP escribe en dos renglones. */
function techoYPiso(texto: string): string {
  // Los sectores descritos en prosa (San Fernando): sólo los pares "(I) GND / 2500 ft".
  if (texto.length > 60) {
    const pares = [...texto.matchAll(new RegExp(String.raw`(\(I+\)\s*)?${ALTURA}\s*\/\s*${ALTURA}`, "gi"))].map((m) => m[0]);
    const unicos = [...new Set(pares)];
    if (unicos.length) return unicos.join(" · ");
  }
  const m = /^(.*?(?:FL\s*\d+|[\d.]+\s*ft(?:\s*(?:AGL|AMSL))?|UNL))\s+(GND|SFC|[\d.]+\s*ft.*|FL\s*\d+.*)$/i.exec(texto);
  return m ? `${m[1]} / ${m[2]}` : texto;
}

export interface SeccionAd217 {
  tipo: "CTR" | "ATZ";
  nombre: string;
  marca: string | null;
  limiteLateral: string;
  limites: string;
  clase: string | null;
  /**
   * Los sectores por nivel, si el AIP lo divide (ATZ San Fernando: "(I) GND / 2500 ft: Desde
   * … (II) GND / 1500 ft: Desde …"), cada uno con su propio límite lateral.
   */
  sectores: { marca: string; limites: string; limiteLateral: string }[];
}

/** "GND / 2500 ft" → "2500 ft / GND": arriba el techo, como el resto. */
function techoPrimero(t: string): string {
  const m = /^(GND|SFC)\s*\/\s*(.+)$/i.exec(t.trim());
  return m ? `${m[2].trim()} / ${m[1]}` : t.trim();
}

/** Los sectores que describe el texto de los límites verticales, en castellano. */
function sectoresAd(verticales: string): SeccionAd217["sectores"] {
  const castellano = verticales.split(/\/\s*The\b/)[0].replace(/\s+/g, " ");
  const out: SeccionAd217["sectores"] = [];
  for (const m of castellano.matchAll(/\((I{1,3})\)\s*([^:()]{2,40}?):\s*(Desde.*?)(?=\(I{1,3}\)\s*[^:()]{2,40}?:\s*Desde|$)/g)) {
    out.push({ marca: `(${m[1]})`, limites: techoPrimero(m[2]), limiteLateral: m[3].trim() });
  }
  return out.length >= 2 ? out : [];
}

/** Las CTR y ATZ que un bloque AD 2.17 define, con su texto en castellano. */
export function seccionesAd217(bloque: string): SeccionAd217[] {
  const texto = limpiar(bloque);
  const inicio = texto.indexOf("Designation and lateral limits");
  if (inicio < 0) return [];
  const lineas = texto.slice(inicio).split("\n").slice(1);

  // El castellano termina donde empieza el inglés, que arranca con el nombre al revés
  // ("SAN FERNANDO ATZ"). A veces el último renglón en castellano cierra con "/" y a veces no.
  let fin = lineas.findIndex((l) => /^[A-ZÁÉÍÓÚÑÜ .\/-]+ (CTR|ATZ)(\s*\(\*+\))?(\s|$)/.test(l.trim()));
  if (fin < 0) fin = lineas.findIndex((l) => /^2\b|Límites verticales/.test(l));
  if (fin < 0) return [];
  const castellano = lineas.slice(0, fin).map((l) => l.replace(/\/\s*$/, ""));

  const verticales = /Límites verticales \/ Vertical limits([\s\S]*?)\n3\b/.exec(texto)?.[1] ?? "";
  const clase = /Airspace classification\s+(.*)/.exec(texto)?.[1] ?? "";

  const secciones: SeccionAd217[] = [];
  for (const linea of castellano) {
    const m = /^(CTR|ATZ)\s+(.+?)(\s*\(\*+\))?\s*$/.exec(linea.trim());
    if (m) {
      // A veces el límite arranca en el mismo renglón del nombre ("CTR RÍO GRANDE Círculo de …").
      const pegado = /^(.*?)\s+((?:C[ií]rculo|Desde|Arco|Pol[ií]gono)\b.*)$/.exec(m[2]);
      if (pegado) m[2] = pegado[1];
      const marca = m[3]?.trim() ?? null;
      secciones.push({
        tipo: m[1] as "CTR" | "ATZ",
        nombre: `${m[1]} ${m[2].trim()}`,
        marca,
        limiteLateral: "",
        limites: techoYPiso(deLaMarca(verticales, marca)),
        clase: deLaMarca(clase, marca).replace(/[^A-G,]/g, "") || null,
        // Los sectores son del espacio que no lleva marca (*): con marcas, el bloque define
        // varios espacios y no uno dividido.
        sectores: marca ? [] : sectoresAd(verticales),
      });
      if (pegado) secciones[secciones.length - 1].limiteLateral = `${pegado[2]}\n`;
    } else if (secciones.length) {
      secciones[secciones.length - 1].limiteLateral += `${linea}\n`;
    }
  }
  return secciones;
}

/* ------------------------------------------------------------- ENR 2.1 --- */

export interface SeccionTma {
  nombre: string;
  limiteLateral: string;
  limites: string;
  clase: string | null;
}

const RE_VERTICAL = /^(\(I+\)\s*)?(FL\s*\d+|[\d.]+\s*FT|GND|SFC|UNL)\b/i;

/** Las filas de TMA de `ENR-2.1.txt` (sin los bloques de sectores ni de FIR que van al final). */
export function filasTma(texto: string): string[] {
  const tmas = texto.split(/\n\n(?=SECTORES TMA |FIR [A-ZÁÉÍÓÚÑÜ ]+\nDesde)/)[0];
  return tmas.split(/\n(?=TMA [A-ZÁÉÍÓÚÑÜ ()]+\n(?:Desde|C[ií]rculo|Arco))/).filter((b) => b.startsWith("TMA "));
}

/** ["(I) FL 245", "2500 FT AGL", "(II) FL 245", "FL 45"] → "(I) FL 245 / 2500 FT AGL · (II) FL 245 / FL 45". */
function enPares(renglones: string[]): string {
  if (renglones.length % 2 !== 0) return renglones.join(" · ");
  const pares: string[] = [];
  for (let i = 0; i < renglones.length; i += 2) pares.push(`${renglones[i]} / ${renglones[i + 1]}`);
  return pares.join(" · ");
}

/** Las TMA de `ENR-2.1.txt`, cada una con su texto en castellano. */
export function seccionesTma(texto: string): SeccionTma[] {
  return filasTma(texto).map((b) => {
    const lineas = b.split("\n");
    const nombre = lineas[0].trim();
    // Desde la 3.1.0 la fila viene entera: lo de la TMA en castellano termina donde empieza
    // el inglés ("From …", "Circle …").
    const finCastellano = lineas.findIndex((l, i) => i > 0 && /^(From|Circle|Arc of|Area)\b/.test(l.trim()));
    const cuerpo = lineas.slice(1, finCastellano > 0 ? finCastellano : undefined);
    const finLateral = cuerpo.findIndex((l) => RE_VERTICAL.test(l.trim()));
    const lateral = (finLateral < 0 ? cuerpo : cuerpo.slice(0, finLateral)).join("\n");
    const resto = finLateral < 0 ? [] : cuerpo.slice(finLateral);
    // En mayúsculas: el encabezado de cada página del PDF dice "Clase de espacio aéreo".
    const iClase = resto.findIndex((l) => /CLASE DE ESPACIO/.test(l));
    // Sólo los renglones de altura: entre ellos se meten las otras columnas de la tabla.
    const verticales = (iClase < 0 ? resto : resto.slice(0, iClase)).map((l) => l.trim()).filter((l) => RE_VERTICAL.test(l) || /^(AGL|AMSL)\b/.test(l));
    const clases = iClase < 0 ? [] : resto.slice(iClase).join("\n").match(/(?:^|\n|:\s*)([A-G])(?=\s*[-–:]|\s*$|\s*\n)/g) ?? [];
    const letras = [...new Set(clases.map((c) => c.replace(/[^A-G]/g, "")))].filter(Boolean);
    return {
      nombre,
      limiteLateral: lateral,
      limites: enPares(verticales),
      clase: letras.length ? letras.join(", ") : null,
    };
  });
}

/* ------------------------------------------------- sectores de una TMA --- */

/** Las TMA divididas en sectores por nivel: el texto de las observaciones, por TMA. */
export function sectoresTma(texto: string): { tma: string; texto: string }[] {
  return texto
    .split(/\n\n(?=SECTORES TMA |FIR [A-ZÁÉÍÓÚÑÜ ]+\nDesde)/)
    .filter((b) => b.startsWith("SECTORES TMA "))
    .map((b) => ({ tma: b.split("\n")[0].replace(/^SECTORES\s+/, "").trim(), texto: b.split("\n").slice(1).join("\n") }));
}

/** Distancia en NM de un punto a un segmento, en el plano local. */
function aSegmento(p: Punto, a: Punto, b: Punto): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 60;
  const [px, py, ax, ay, bx, by] = [p.lon * k, p.lat * 60, a.lon * k, a.lat * 60, b.lon * k, b.lat * 60];
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** La distancia en NM de un punto al borde de un anillo. */
export function distanciaAlBorde(anillo: Punto[], p: Punto): number {
  return Math.min(...anillo.map((a, i) => aSegmento(p, a, anillo[(i + 1) % anillo.length])));
}

/** ¿Adentro del anillo o a menos de `margen` NM de su borde? */
export function adentroOBorde(anillo: Punto[], p: Punto, margen: number): boolean {
  if (contiene(anillo.map((q) => [q.lat, q.lon]), p)) return true;
  return anillo.some((a, i) => aSegmento(p, a, anillo[(i + 1) % anillo.length]) < margen);
}

/**
 * El sector de una TMA que el AIP describe con arcos encadenados (TMA Baires, sector I):
 *
 * "desde intersección límite FIR … con el meridiano 05753W hasta 344958S-0575402W, siguiendo
 * por la línea de la costa … hasta 350358S-0572802W, continuando con un arco de 55 NM … EZE,
 * hasta la intersección con un arco de 25 NM … VOR PTA continuando por este arco hasta
 * interceptar un arco de 25 NM … EZE, … un arco de 25 NM … FDO, continuando por este arco
 * hasta la intersección del límite común de la FIR …, siguiendo por este límite hacia el S
 * hasta interceptar el meridiano 05753W."
 *
 * Se arma caminando: del meridiano a los vértices del texto, después por cada arco hasta que
 * cruza el borde del círculo siguiente, del lado que queda adentro de la TMA y afuera del
 * círculo anterior, y del último arco por el borde de la TMA (el límite de la FIR) hasta el
 * meridiano. El resultado rodea EZE, FDO y PTA: el sector (I), piso 2500 FT, es lo cercano a
 * Buenos Aires, y el (II), piso FL 45, el anillo de afuera y el río.
 * Los centros que el texto sólo nombra (PTA, FDO) salen del directorio de radioayudas, así que
 * el sector queda **aproximado**, como la costa, que se dibuja recta entre sus dos puntos.
 */
export function sectorPorArcos(textoCrudo: string, tma: Punto[], nombres: Map<string, Punto>): { ok: true; poligono: Punto[] } | { ok: false; motivo: string } {
  const texto = textoCrudo.replace(/\s+/g, " ");
  const meridiano = /meridiano (\d{3})(\d{2})W/.exec(texto);
  if (!meridiano) return { ok: false, motivo: "sin el meridiano de partida" };
  const lonM = -(Number(meridiano[1]) + Number(meridiano[2]) / 60);
  const vertices = coordenadasDe(texto);
  const arcos = [...texto.matchAll(/arco de (\d+(?:[.,]\d+)?)\s*NM de radio con centro en (?:el )?(?:D?VOR(?:\s*\/\s*DME)?|NDB)\s*([A-Z]{3})/g)].map((m) => ({
    radio: Number(m[1].replace(",", ".")),
    centro: nombres.get(m[2]) ?? null,
    nombre: m[2],
  }));
  if (vertices.length === 0 || arcos.length < 2) return { ok: false, motivo: "no se entiende la cadena de arcos" };
  const sinCentro = arcos.find((a) => !a.centro);
  if (sinCentro) return { ok: false, motivo: `no está la coordenada de ${sinCentro.nombre}` };

  const n = tma.length;
  const borde = (i: number) => [tma[i], tma[(i + 1) % n]] as const;
  const adentroTma = (p: Punto) => contiene(tma.map((q) => [q.lat, q.lon]), p);

  // Dónde el borde de la TMA cruza el meridiano: el cruce más cercano al primer vértice.
  let inicio: { p: Punto; lado: number } | null = null;
  for (let i = 0; i < n; i++) {
    const [a, b] = borde(i);
    if ((a.lon - lonM) * (b.lon - lonM) > 0 || a.lon === b.lon) continue;
    const t = (lonM - a.lon) / (b.lon - a.lon);
    const p = { lat: a.lat + t * (b.lat - a.lat), lon: lonM };
    if (!inicio || dist(p, vertices[0]) < dist(inicio.p, vertices[0])) inicio = { p, lado: i };
  }
  if (!inicio) return { ok: false, motivo: "el meridiano no cruza la TMA" };

  const camino: Punto[] = [inicio.p, ...vertices.map((v) => ({ lat: v.lat, lon: v.lon }))];
  let actual: Punto = camino[camino.length - 1];
  const PASO = 0.5;

  for (let k = 0; k < arcos.length; k++) {
    const { centro, radio } = arcos[k] as { centro: Punto; radio: number };
    if (Math.abs(dist(centro, actual) - radio) > Math.max(0.6, radio * 0.06)) return { ok: false, motivo: `el punto de entrada no está sobre el arco de ${radio} NM` };
    // El primer arco es el borde de la TMA: del segundo en adelante, hay que ir por afuera del
    // círculo anterior (el sector queda del lado de afuera de los arcos de 25 NM).
    const anterior = k > 1 ? (arcos[k - 1] as { centro: Punto; radio: number }) : null;
    const siguiente = arcos[k + 1] as { centro: Punto; radio: number } | undefined;
    const b0 = rumboVerdadero(centro, actual);
    // El sentido: el que sigue adentro de la TMA y, desde el segundo arco, afuera del anterior.
    const prueba = (s: number) => {
      if (k === 0) {
        // El primer arco es el borde de la TMA: del lado bueno, adentro hacia el centro y afuera
        // hacia fuera. Se prueba a 1,5 NM de cada lado porque el AIP redondea el vértice
        // (350358S-0572802W está a 54,5 NM de EZE, no a 55) y ahí el borde hace un escalón.
        return adentroTma(puntoDesde(centro, b0 + s * 2, radio - 1.5)) && !adentroTma(puntoDesde(centro, b0 + s * 2, radio + 1.5));
      }
      const q = puntoDesde(centro, b0 + s * 2, radio);
      return adentroTma(q) && (!anterior || dist(anterior.centro, q) > anterior.radio);
    };
    const sentidos = [1, -1].filter(prueba);
    if (sentidos.length !== 1) return { ok: false, motivo: `no se sabe para qué lado sigue el arco de ${radio} NM` };
    const s = sentidos[0];
    // Se camina hasta **cruzar** el borde del círculo siguiente (o, en el último arco, el de la
    // TMA): el punto de partida puede estar adentro o afuera. En Baires, 350358S-0572802W ya
    // está a 22 NM de PTA, adentro de su círculo de 25.
    const lado = (q: Punto) => (siguiente ? dist(siguiente.centro, q) <= siguiente.radio : adentroTma(q));
    const ladoInicial = lado(puntoDesde(centro, b0 + s * 0.05, radio));
    let llego = false;
    for (let g = PASO; g < 360; g += PASO) {
      const q = puntoDesde(centro, b0 + s * g, radio);
      const fin = lado(q) !== ladoInicial;
      if (fin) {
        // Afinado: el cruce entre el último paso de este lado y éste.
        let lo = g - PASO;
        let hi = g;
        for (let r = 0; r < 20; r++) {
          const mid = (lo + hi) / 2;
          const m = puntoDesde(centro, b0 + s * mid, radio);
          const cruzo = lado(m) !== ladoInicial;
          if (cruzo) hi = mid;
          else lo = mid;
        }
        actual = puntoDesde(centro, b0 + s * hi, radio);
        camino.push(actual);
        llego = true;
        break;
      }
      camino.push(q);
    }
    if (!llego) return { ok: false, motivo: `el arco de ${radio} NM no llega al siguiente` };
  }

  // Del último arco, por el borde de la TMA hasta el meridiano: el camino más corto.
  let ladoFin = 0;
  for (let i = 1; i < n; i++) if (aSegmento(actual, ...borde(i)) < aSegmento(actual, ...borde(ladoFin))) ladoFin = i;
  const recorrer = (paso: 1 | -1) => {
    const pts: Punto[] = [];
    let i = paso === 1 ? (ladoFin + 1) % n : ladoFin;
    const hasta = paso === 1 ? (inicio!.lado + 1) % n : inicio!.lado;
    for (let c = 0; c < n && i !== hasta; c++) {
      pts.push(tma[i]);
      i = (i + paso + n) % n;
    }
    if (paso === 1) pts.push(tma[inicio!.lado]);
    else pts.push(tma[(inicio!.lado + 1) % n]);
    return pts;
  };
  const largo = (pts: Punto[]) => pts.reduce((t, p, i) => t + dist(i ? pts[i - 1] : actual, p), 0) + dist(pts[pts.length - 1], inicio!.p);
  const a = recorrer(1);
  const b = recorrer(-1);
  camino.push(...(largo(a) <= largo(b) ? a : b));

  if (seCruza(camino)) return { ok: false, motivo: "el sector se cruza" };
  if (!camino.every((p) => adentroOBorde(tma, p, 0.5))) return { ok: false, motivo: "el sector se sale de la TMA" };
  // El sector rodea las radioayudas de sus arcos de 25 NM: es lo que está cerca de ellas.
  const afuera = arcos.slice(1).filter((x) => !contiene(camino.map((q) => [q.lat, q.lon]), x.centro!));
  if (afuera.length) return { ok: false, motivo: `el sector deja afuera ${afuera.map((x) => x.nombre).join(", ")}, que tiene que rodear` };
  return { ok: true, poligono: camino };
}

/* ------------------------------------------------------------- armado --- */

/** La coordenada que sigue al primer "centro en" del texto. */
function primerCentro(textoCrudo: string): Punto | null {
  const texto = textoCrudo.replace(/\s+/g, " ");
  const m = /centro(?:\s+en)?/i.exec(texto);
  if (!m) return null;
  const c = coordenadasDe(texto).find((x) => x.desde > m.index);
  return c && c.desde - m.index < 130 ? c : null;
}

export interface Fuentes {
  /** ICAO → el bloque AD 2.17 de su `.txt`, con su punto de referencia. */
  ad217: { icao: string; bloque: string; arp: Punto | null }[];
  /** El texto de `ENR-2.1.txt`. */
  enr21: string;
  /** Las radioayudas por ident, para los centros que el AIP sólo nombra (sectores de TMA). */
  radioayudas?: Map<string, Punto>;
}

/** Los tamaños más grandes que se aceptan, en NM²: un número absurdo es un parser roto. */
const AREA_MAXIMA: Record<TipoEspacio, number> = { ATZ: 600, CTR: 4000, TMA: 40000 };

export function armarEspacios(f: Fuentes): { espacios: EspacioAereo[]; descartados: EspacioDescartado[] } {
  const espacios: EspacioAereo[] = [];
  const descartados: EspacioDescartado[] = [];
  /** Por id: los tramos que siguen el límite de un vecino, y el texto (para saber sus radioayudas). */
  const porVecinos = new Map<string, NonNullable<Extract<Limite, { ok: true }>["porVecinos"]>>();
  const textos = new Map<string, string>();

  const agregar = (tipo: TipoEspacio, nombre: string, id: string, fuente: string, lateral: string, ref: Punto | null, limites: string, clase: string | null) => {
    const r = leerLimite(lateral, ref);
    if (!r.ok) {
      descartados.push({ tipo, nombre, fuente, motivo: r.motivo });
      return;
    }
    const area = areaNm2(r.poligono);
    if (area > AREA_MAXIMA[tipo]) {
      descartados.push({ tipo, nombre, fuente, motivo: `${Math.round(area)} NM²: demasiado grande para una ${tipo}` });
      return;
    }
    espacios.push({ id, tipo, nombre, limites, clase, poligono: r.poligono.map((p) => [p.lat, p.lon]), aproximado: r.aproximado, fuente });
    if (r.porVecinos?.length) porVecinos.set(id, r.porVecinos);
    textos.set(id, lateral);
  };

  for (const { icao, bloque, arp } of f.ad217) {
    const nombres = nombradosDe(bloque);
    for (const s of seccionesAd217(bloque)) {
      const antes = espacios.length;
      agregar(s.tipo, s.nombre, `${icao}-${s.tipo}`, `${icao} AD 2.17`, s.limiteLateral, arp, s.limites, s.clase);
      const padre = espacios.length > antes ? espacios[espacios.length - 1] : null;
      if (!padre || s.sectores.length === 0) continue;

      // Dividido por nivel: un espacio por sector, con su límite. Cada sector tiene que caer
      // adentro del espacio entero; si alguno no se puede dibujar, queda el entero con los
      // límites de todos, como antes.
      const anillo = padre.poligono.map(([lat, lon]) => ({ lat, lon }));
      const sectores = s.sectores.map((x) => ({ x, r: leerLimite(x.limiteLateral, null, nombres, anillo) }));
      const todos = sectores.every(({ r }) => r.ok && r.poligono.every((p) => adentroOBorde(anillo, p, 0.3)));
      if (!todos) continue;
      espacios.pop();
      for (const { x, r } of sectores) {
        if (!r.ok) continue;
        espacios.push({
          ...padre,
          id: `${padre.id}-${x.marca.replace(/\W/g, "")}`,
          nombre: `${padre.nombre} ${x.marca}`,
          limites: x.limites,
          poligono: r.poligono.map((p) => [p.lat, p.lon]),
          aproximado: padre.aproximado || r.aproximado,
        });
      }
    }
  }

  const sectores = sectoresTma(f.enr21);
  for (const s of seccionesTma(f.enr21)) {
    // La referencia de una TMA: el centro de su primer arco o círculo, si tiene.
    const ref = primerCentro(s.limiteLateral);
    const antes = espacios.length;
    agregar("TMA", s.nombre, s.nombre.replace(/\s+/g, "-"), "ENR 2.1", s.limiteLateral, ref, s.limites, s.clase);
    const tma = espacios.length > antes ? espacios[espacios.length - 1] : null;
    const def = sectores.find((x) => x.tma === s.nombre);
    if (!tma || !def) continue;

    // Dividida por nivel (TMA Baires): el sector (I) se arma con sus arcos y el (II) es el
    // resto, con el (I) como hueco. Cada uno con el techo y el piso de su marca.
    const nombres = new Map([...(f.radioayudas ?? new Map<string, Punto>()), ...nombradosDe(s.limiteLateral)]);
    const anillo = tma.poligono.map(([lat, lon]) => ({ lat, lon }));
    // El texto del sector (I): desde "(I) El límite vertical inferior" hasta el del (II).
    const textoUno = /\(I\)\s*El l[íi]mite vertical inferior([\s\S]*?)\(II\)\s*El l[íi]mite/.exec(def.texto)?.[1] ?? "";
    const uno = sectorPorArcos(textoUno, anillo, nombres);
    const limitesDe = (marca: string) => s.limites.split(" · ").find((l) => l.startsWith(marca))?.replace(marca, "").trim() ?? s.limites;
    if (!uno.ok) {
      descartados.push({ tipo: "TMA", nombre: `${s.nombre} (sectores)`, fuente: "ENR 2.1", motivo: `se dibuja entera: ${uno.motivo}` });
      continue;
    }
    espacios.pop();
    const sectorUno = uno.poligono.map((p) => [p.lat, p.lon] as [number, number]);
    espacios.push(
      { ...tma, id: `${tma.id}-I`, nombre: `${s.nombre} (I)`, limites: limitesDe("(I)"), poligono: sectorUno, aproximado: true },
      { ...tma, id: `${tma.id}-II`, nombre: `${s.nombre} (II)`, limites: limitesDe("(II)"), huecos: [sectorUno] }
    );
  }

  seguirVecinos(espacios, porVecinos, textos);
  return { espacios, descartados };
}

/**
 * "siguiendo el límite del TMA SDE hacia el W hasta …": ese tramo no es una recta, es el borde
 * del vecino. Dibujado recto, corta el círculo de la otra TMA y las dos se pisan (Tucumán con
 * Santiago del Estero, San Juan con Mendoza). Se reemplaza por el camino más corto sobre el
 * borde del vecino, entre los dos puntos del texto, si los dos están sobre ese borde (±2 NM).
 *
 * El vecino se nombra a veces entero ("TMA LA RIOJA") y a veces por su radioayuda ("TMA SDE",
 * "TMA DOZ"): se busca por nombre y, si no, por la radioayuda en el centro de su texto. Se
 * resuelve en rondas porque un vecino puede seguir a otro (Río Cuarto sigue a Villa Reynolds,
 * que sigue a San Luis).
 */
function seguirVecinos(espacios: EspacioAereo[], porVecinos: Map<string, { desde: Punto; hasta: Punto; vecino: string }[]>, textos: Map<string, string>) {
  const sinTilde = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  const buscar = (nombre: string): EspacioAereo | null => {
    const n = sinTilde(nombre);
    const porNombre = espacios.find((e) => sinTilde(e.nombre.replace(/\s+\(I+\)$/, "")) === n && !e.huecos);
    if (porNombre) return porNombre;
    const ident = /^(?:TMA|CTR)\s+([A-Z]{3})$/.exec(n)?.[1];
    if (!ident) return null;
    return espacios.find((e) => e.tipo === n.slice(0, 3) && new RegExp(`(?:VOR|NDB|DME)\\s*([/ ]\\s*DME)?\\s*${ident}\\b`).test(textos.get(e.id) ?? "")) ?? null;
  };
  const pendientes = new Set(porVecinos.keys());
  for (let ronda = 0; ronda < 4 && pendientes.size; ronda++) {
    for (const id of [...pendientes]) {
      const tramos = porVecinos.get(id)!;
      const vecinos = tramos.map((t) => buscar(t.vecino));
      // Si un vecino todavía tiene que seguir a otro, se espera a la ronda siguiente.
      if (vecinos.some((v) => v && pendientes.has(v.id) && v.id !== id) && ronda < 3) continue;
      const e = espacios.find((x) => x.id === id)!;
      let anillo = e.poligono.map(([lat, lon]) => ({ lat, lon }));
      tramos.forEach((t, k) => {
        const v = vecinos[k];
        if (!v) return;
        const borde = v.poligono.map(([lat, lon]) => ({ lat, lon }));
        // El lado del vecino más cercano a cada punto (el punto puede caer en medio de un lado).
        const n = borde.length;
        const lado = (p: Punto) => {
          let mejor = 0;
          for (let i = 1; i < n; i++) if (aSegmento(p, borde[i], borde[(i + 1) % n]) < aSegmento(p, borde[mejor], borde[(mejor + 1) % n])) mejor = i;
          return mejor;
        };
        const la = lado(t.desde);
        const lb = lado(t.hasta);
        if (aSegmento(t.desde, borde[la], borde[(la + 1) % n]) > 2 || aSegmento(t.hasta, borde[lb], borde[(lb + 1) % n]) > 2) return;
        // Hacia adelante: los vértices la+1 … lb. Hacia atrás: la … lb+1.
        const adelante: Punto[] = [];
        for (let i = (la + 1) % n, c = 0; c < n && la !== lb; i = (i + 1) % n, c++) {
          adelante.push(borde[i]);
          if (i === lb) break;
        }
        const atras: Punto[] = [];
        for (let i = la, c = 0; c < n && la !== lb; i = (i - 1 + n) % n, c++) {
          if (i === lb) break;
          atras.push(borde[i]);
        }
        const largo = (pts: Punto[]) => pts.reduce((s, p, i) => s + dist(i ? pts[i - 1] : t.desde, p), 0) + (pts.length ? dist(pts[pts.length - 1], t.hasta) : dist(t.desde, t.hasta));
        const medio = la === lb ? [] : largo(adelante) <= largo(atras) ? adelante : atras;
        const i = anillo.findIndex((p, j) => sonIguales(p, t.desde) && sonIguales(anillo[(j + 1) % anillo.length], t.hasta));
        if (i < 0) return;
        const nuevo = [...anillo.slice(0, i + 1), ...medio, ...anillo.slice(i + 1)];
        if (!seCruza(nuevo)) anillo = nuevo;
      });
      e.poligono = anillo.map((p) => [p.lat, p.lon]);
      pendientes.delete(id);
    }
  }
}

const sonIguales = (a: Punto, b: Punto) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

import { distanciaNmPrecisa } from "./distance";
import { contiene } from "./espacios-aereos";
import type { Punto } from "./navegacion";

/**
 * **Los corredores y sectores VFR debajo de la TMA Baires** (3.2.0), de ENR 3.3 del AIP
 * (`src/data/aip/ENR-3.3-BAIRES.txt`, que guarda `build-espacios.mjs`).
 *
 * Son **clase G**, dentro y fuera de la CTR: lo dice ENR 3.3 ("Aquellos vuelos VFR que realicen
 * en espacio aéreo Clase G, es decir: a) Dentro de los Corredores VFR; b) Dentro de los sectores
 * VFR …") y la carta ENR 6.10 ("en Baires dentro y fuera de CTR clase G"). Por eso un vuelo de
 * San Fernando a Martín García por el Corredor Nº 2 no habla con Aeroparque aunque cruce su CTR
 * (Federico, 2026-11-03).
 *
 * - **Corredores**: un eje (los puntos de la tabla de ENR 3.3) y un ancho. Dentro de una CTR,
 *   2500 m (1250 m a cada lado) y 1.000 ft como máximo; fuera, 5000 m y 2.000 ft. El Nº 2, entre
 *   Benavídez y el límite de la CTR Aeroparque, tiene 300 m del lado sur y 1250 m del norte.
 * - **Sectores**: un polígono, un techo ("GND/2000 FT AGL", que se toma sobre el nivel del mar:
 *   el terreno de la zona está a pocos metros) y quién da información de vuelo.
 */

export interface CorredorVfr {
  /** "2". */
  numero: string;
  /** Debajo de qué TMA (3.15.0): los números se repiten entre Baires y Córdoba. Sin zona, Baires. */
  zona?: "baires" | "cordoba";
  /** "ISLA MARTIN GARCÍA – ESTACIÓN BENAVIDEZ". */
  nombre: string;
  eje: Punto[];
  /** El nombre de cada punto del eje, como lo escribe la tabla ("ESTACIÓN BENAVIDEZ"). */
  puntos: string[];
}

export interface SectorVfr {
  /** "Sector VFR Escuela de San Fernando". */
  nombre: string;
  poligono: [number, number][];
  techoFt: number;
  /** "TWR AER", "ACC EZE". */
  informacion: string | null;
}

/** Ancho a cada lado del eje, en NM, y altura máxima (ENR 3.3, "VUELOS VFR SIN ENLACE …"). */
const DENTRO_CTR = { mediaNm: 1250 / 1852, techoFt: 1000 };
const FUERA_CTR = { mediaNm: 2500 / 1852, techoFt: 2000 };
/** El Nº 2 entre Benavídez y el límite de la CTR Aeroparque: 300 m del lado sur. */
const SUR_DEL_2 = 300 / 1852;

/**
 * Córdoba (ENR 3.3, TABLA 1): 2.000 m de ancho dentro de la CTR (1.000 m a cada lado), 2.500 m
 * fuera (1.250 m), desde el suelo hasta 1.500 ft **AGL**. El terreno de Córdoba está entre 1.300 y
 * 3.500 ft: con la altura del GPS (sobre el nivel del mar) no se sabe si se está por encima, así
 * que ahí el corredor se mira sólo de costado (invariante 2: no saber no es "afuera").
 */
const CORDOBA = { dentro: { mediaNm: 1000 / 1852, techoFt: 1500 }, fuera: { mediaNm: 1250 / 1852, techoFt: 1500 } };

function reglas(c: Pick<CorredorVfr, "zona">) {
  return c.zona === "cordoba" ? { ...CORDOBA, agl: true } : { dentro: DENTRO_CTR, fuera: FUERA_CTR, agl: false };
}

/** "Corredor VFR Nº 3", o "Corredor VFR Nº 3 (Córdoba)": los números se repiten. */
export function etiquetaCorredor(c: Pick<CorredorVfr, "numero" | "zona">): string {
  return `Corredor VFR Nº ${c.numero}${c.zona === "cordoba" ? " (Córdoba)" : ""}`;
}

/** Quién da información de vuelo en el corredor. Córdoba (ENR 3.3, 1): el 9 y el 10, la TWR ESC. */
export function informacionCorredor(c: Pick<CorredorVfr, "numero" | "zona">): string | null {
  if (c.zona !== "cordoba") return null;
  return c.numero === "9" || c.numero === "10"
    ? "TWR Escuela de Aviación Militar (clase D cuando están activas sus zonas restringidas)"
    : "APP/TWR Córdoba";
}

/** El ancho y la altura, para mostrarlos (ENR 3.3 de cada zona). */
export function descripcionCorredor(c: Pick<CorredorVfr, "zona">): string {
  return c.zona === "cordoba"
    ? "Clase G · 2.000 m en la CTR y 2.500 m fuera · GND a 1.500 ft AGL · IAS 150 kt"
    : "Clase G · 2.500 m y 1.000 ft máx. en CTR; 5.000 m y 2.000 ft fuera";
}

/**
 * "350721S — 0585355W", "341714S – 0590555W", "342113S — 0584111 W". La segunda, de 7 dígitos,
 * es la longitud aunque termine en S por error de tipeo (Villars: "0585619S").
 */
const RE_COORD = /(\d{2})(\d{2})(\d{2})S\s*[—–-]\s*(\d{3})(\d{2})(\d{2})\s?[WS]\b/;

function aPunto(m: RegExpExecArray): Punto {
  return {
    lat: -(Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600),
    lon: -(Number(m[4]) + Number(m[5]) / 60 + Number(m[6]) / 3600),
  };
}

/** Los sectores VFR: "Limites laterales del sector VFR Escuela de X" con su tabla de puntos. */
export function sectoresVfr(texto: string): SectorVfr[] {
  const out: SectorVfr[] = [];
  for (const m of texto.matchAll(/Limites laterales del sector VFR (Escuela de [A-Za-zÁÉÍÓÚáéíóúñ]+(?: [A-Z][a-záéíóúñ]+)*?)\s*(?::|Lateral)/g)) {
    const desde = m.index! + m[0].length;
    const fin = texto.indexOf("Vertical limits", desde);
    const tramo = texto.slice(desde, fin > 0 ? fin : desde + 2000);
    const puntos = [...tramo.matchAll(/(\d{2})(\d{2})(\d{2})S\s+(\d{3})(\d{2})(\d{2})W/g)].map((c) => aPunto(c as unknown as RegExpExecArray));
    if (puntos.length > 2 && Math.abs(puntos[0].lat - puntos[puntos.length - 1].lat) < 1e-9 && Math.abs(puntos[0].lon - puntos[puntos.length - 1].lon) < 1e-9) puntos.pop();
    // "Límites verticales: GND/2000 FL AGL" (Morón, con FL por FT) o "Limites verticales: GND/1.000 FT AGL".
    const techo = /L[íi]mites verticales:\s*GND\s*\/\s*([\d.,]+)\s*F[LT]/i.exec(tramo);
    const info = /información de vuelo y alerta:\s*([A-Z]{3}\s+[A-Z]{3})/.exec(tramo);
    if (puntos.length < 3 || !techo) continue;
    out.push({
      nombre: `Sector VFR ${m[1].trim()}`,
      poligono: puntos.map((p) => [p.lat, p.lon]),
      techoFt: Number(techo[1].replace(/[.,]/g, "")),
      informacion: info ? info[1] : null,
    });
  }
  return out;
}

/**
 * Los corredores de la tabla de ENR 3.3 ("Número Corredor / Trayectoria y Coordenadas
 * Geográficas"): un renglón con el número, después nombre y coordenada de cada punto. Si una
 * coordenada viene mal escrita (Benavídez en el Nº 17: "058410SW"), se toma la del mismo punto
 * en otro corredor.
 */
export function corredoresVfr(texto: string): CorredorVfr[] {
  const i = texto.indexOf("Número Corredor");
  if (i < 0) return [];
  const fin = texto.indexOf("VUELOS HACIA Y DESDE", i);
  const lineas = texto.slice(i, fin > 0 ? fin : undefined).split("\n").map((l) => l.trim()).filter(Boolean);

  // Los nombres de la lista de arriba ("Nº 2 AERÓDROMO ISLA MARTÍN GARCÍA - ESTACIÓN BENAVIDEZ"),
  // que a veces siguen en el renglón de abajo. La lista termina en "Los vuelos VFR".
  const nombres = new Map<string, string>();
  const lista = texto.slice(texto.indexOf("se designan los siguientes"), texto.indexOf("Los vuelos VFR que se efectúen sin enlace"));
  let ultimo: string | null = null;
  for (const l of lista.split("\n").map((x) => x.trim())) {
    const m = /^Nº\s*(\d{1,2})\s+(.+)$/.exec(l);
    if (m) {
      ultimo = m[1];
      nombres.set(m[1], m[2]);
    } else if (ultimo && l && !/^(corredores|A efectos)/i.test(l)) {
      nombres.set(ultimo, `${nombres.get(ultimo)} ${l}`);
    }
  }
  for (const [k, v] of nombres) nombres.set(k, v.replace(/\s*\(\d{6}S\s*[-–—]\s*\d{7}W\)\.?/g, "").replace(/\s+/g, " ").replace(/\.$/, "").trim());

  const crudos: { numero: string; puntos: { nombre: string; p: Punto | null }[] }[] = [];
  let actual: (typeof crudos)[number] | null = null;
  let nombre = "";
  for (const l of lineas) {
    // El número solo, o con el primer nombre en el mismo renglón ("10 GRAL LAS HERAS 042°/222°").
    const numero = /^(\d{1,2})(?:\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]+?))?(?:\s+\d{3}°.*)?$/.exec(l);
    if (numero && !/NM/.test(l)) {
      actual = { numero: numero[1], puntos: [] };
      crudos.push(actual);
      nombre = numero[2]?.trim() ?? "";
      continue;
    }
    if (!actual) continue;
    const c = RE_COORD.exec(l);
    if (c) {
      actual.puntos.push({ nombre, p: aPunto(c) });
      nombre = "";
    } else if (/\d{6}S\s*[—–-]\s*\S+[WS]/.test(l)) {
      actual.puntos.push({ nombre, p: null }); // la coordenada mal escrita
      nombre = "";
    } else if (!/°|^\d+(\.\d+)?\s*NM$|^Rumbo|^Magn|^Heading|^Distan|^Trayectoria|^Path|^Corridor|^Número|^AIP ARGENTINA|^ENR \d|^DEPARTAMENTO/.test(l)) {
      nombre = l.replace(/^\d+(\.\d+)?\s*NM/, "").trim();
    }
  }
  const porNombre = new Map<string, Punto>();
  for (const c of crudos) for (const x of c.puntos) if (x.p && x.nombre) porNombre.set(x.nombre.toUpperCase(), x.p);

  return crudos
    .map((c) => {
      const conCoord = c.puntos.map((x) => ({ nombre: x.nombre, p: x.p ?? porNombre.get(x.nombre.toUpperCase()) ?? null })).filter((x) => x.p !== null);
      return {
        numero: c.numero,
        nombre: nombres.get(c.numero) ?? `Corredor VFR Nº ${c.numero}`,
        eje: conCoord.map((x) => x.p!),
        puntos: conCoord.map((x) => x.nombre),
      };
    })
    .filter((c) => c.eje.length >= 2);
}

/**
 * Los corredores de Córdoba (3.15.0), de la TABLA-2 de su parte de ENR 3.3
 * (`src/data/aip/ENR-3.3-CORDOBA.txt`): el número y, en uno o más renglones, cada punto como
 * "NOMBRE - 310018S-0643158W" (a veces la coordenada sigue en el renglón de abajo), y después el
 * rumbo y la distancia, que no se usan: el eje sale de las coordenadas.
 */
export function corredoresVfrCordoba(texto: string): CorredorVfr[] {
  const i = texto.search(/Distancias en NM/);
  const fin = texto.indexOf("Excepción", i);
  if (i < 0) return [];
  const tabla = texto
    .slice(i, fin > 0 ? fin : undefined)
    .replace(/\n/g, " ")
    .replace(/(\d{6}S)-\s+(\d{7}W)/g, "$1-$2")
    .replace(/\s+/g, " ");
  // Un número de corredor es uno o dos dígitos seguidos de un nombre en mayúsculas (la distancia
  // del corredor anterior va seguida del número, o del final de la tabla).
  const cortes = [...tabla.matchAll(/(?:^|\s)(\d{1,2}) (?=(?:AD\.?\s)?[A-ZÁÉÍÓÚÑ]{2})/g)];
  const out: CorredorVfr[] = [];
  cortes.forEach((m, k) => {
    const desde = m.index! + m[0].length;
    const hasta = k + 1 < cortes.length ? cortes[k + 1].index! : tabla.length;
    const trozo = tabla.slice(desde, hasta);
    const puntos = [...trozo.matchAll(/([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ./ ]*?)\s*-\s*(\d{2})(\d{2})(\d{2})S-(\d{3})(\d{2})(\d{2})W/g)];
    if (puntos.length < 2) return;
    const nombres = puntos.map((p) => p[1].replace(/^AD\.?\s*/, "").trim());
    out.push({
      numero: m[1],
      zona: "cordoba",
      nombre: `${nombres[0]} – ${nombres[nombres.length - 1]}`,
      eje: puntos.map((p) => aPunto([p[0], p[2], p[3], p[4], p[5], p[6], p[7]] as unknown as RegExpExecArray)),
      puntos: nombres,
    });
  });
  return out;
}

/** Distancia con signo de un punto a un segmento, en NM: positiva hacia el norte del eje. */
function aEje(p: Punto, a: Punto, b: Punto): { d: number; norte: boolean } {
  const k = Math.cos((p.lat * Math.PI) / 180) * 60;
  const [px, py, ax, ay, bx, by] = [p.lon * k, p.lat * 60, a.lon * k, a.lat * 60, b.lon * k, b.lat * 60];
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return { d: Math.hypot(px - qx, py - qy), norte: py > qy };
}

export interface EnVfr {
  tipo: "corredor" | "sector";
  nombre: string;
  techoFt: number;
  /** El techo es sobre el terreno (Córdoba): no se compara con la altura del GPS. */
  agl?: boolean;
  informacion: string | null;
}

/**
 * ¿El punto está en un corredor o un sector VFR, a una altura permitida? `ctrs` son los
 * polígonos de las CTR (el ancho y el techo de un corredor cambian adentro). Sin altitud, sólo
 * lateralmente.
 */
export function enVfr(p: Punto, altitudFt: number | null, corredores: CorredorVfr[], sectores: SectorVfr[], ctrs: [number, number][][]): EnVfr | null {
  for (const s of sectores) {
    if (contiene(s.poligono, p) && (altitudFt === null || altitudFt <= s.techoFt)) return { tipo: "sector", nombre: s.nombre, techoFt: s.techoFt, informacion: s.informacion };
  }
  const enCtr = ctrs.some((c) => contiene(c, p));
  for (const c of corredores) {
    const r = reglas(c);
    const regla = enCtr ? r.dentro : r.fuera;
    if (!r.agl && altitudFt !== null && altitudFt > regla.techoFt) continue;
    for (let i = 1; i < c.eje.length; i++) {
      const { d, norte } = aEje(p, c.eje[i - 1], c.eje[i]);
      const media = c.zona !== "cordoba" && c.numero === "2" && enCtr && !norte ? SUR_DEL_2 : regla.mediaNm;
      if (d <= media) return { tipo: "corredor", nombre: etiquetaCorredor(c), techoFt: regla.techoFt, agl: r.agl, informacion: informacionCorredor(c) };
    }
  }
  return null;
}

/** Largo de un corredor, para los tests y el tooltip. */
export function largoNm(c: CorredorVfr): number {
  return c.eje.slice(1).reduce((s, p, i) => s + distanciaNmPrecisa(c.eje[i].lat, c.eje[i].lon, p.lat, p.lon), 0);
}

/**
 * El código con que se escribe un punto de corredor en la ruta: el nombre sin "ESTACIÓN",
 * "AERÓDROMO" ni "ATZ", sin tildes ni espacios. "ESTACIÓN BENAVIDEZ" → "BENAVIDEZ", "DIQUE
 * LUJÁN" → "DIQUELUJAN", "M. PAZ" → "MPAZ".
 */
export function codigoVfr(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/^(ESTACION|AERODROMO|AD\.?|ATZ)\s+/, "")
    .replace(/[^A-Z0-9]/g, "");
}

/** Los puntos de los corredores, por su código, para escribirlos en la ruta. */
export function puntosVfr(corredores: CorredorVfr[]): Map<string, { nombre: string; lat: number; lon: number }> {
  const out = new Map<string, { nombre: string; lat: number; lon: number }>();
  for (const c of corredores) {
    c.puntos.forEach((nombre, i) => {
      // "ATZ MAT", "ATZ ENO": son aeródromos, y la ruta ya los encuentra por su designador.
      if (/^ATZ\b/.test(nombre)) return;
      const codigo = codigoVfr(nombre);
      if (codigo.length >= 3 && !out.has(codigo)) out.set(codigo, { nombre, lat: c.eje[i].lat, lon: c.eje[i].lon });
    });
  }
  return out;
}

/** Los corredores a menos de `nm` de un punto, para sugerirlos. */
export function corredoresCerca(p: Punto, corredores: CorredorVfr[], nm = 3): CorredorVfr[] {
  return corredores.filter((c) => c.eje.some((q, i) => i > 0 && aEje(p, c.eje[i - 1], q).d <= nm));
}

/**
 * La franja del corredor, con su ancho de verdad, para dibujarla: a cada lado del eje, 1250 m
 * dentro de una CTR y 2500 m fuera; el Nº 2, dentro de la CTR, 300 m del lado sur. Se recorre el
 * eje cada 0,2 NM y en cada punto se mira si está en una CTR, así el ancho cambia donde cruza el
 * límite. Devuelve el contorno [lat, lon]: el borde izquierdo de ida y el derecho de vuelta.
 */
export function bandaDeCorredor(c: CorredorVfr, ctrs: [number, number][][]): [number, number][] {
  const latRef = c.eje[0].lat;
  const k = Math.cos((latRef * Math.PI) / 180) * 60;
  const aPlano = (p: Punto) => [p.lon * k, p.lat * 60] as const;
  const dePlano = (x: number, y: number): [number, number] => [y / 60, x / k];
  const izquierda: [number, number][] = [];
  const derecha: [number, number][] = [];
  for (let i = 1; i < c.eje.length; i++) {
    const [ax, ay] = aPlano(c.eje[i - 1]);
    const [bx, by] = aPlano(c.eje[i]);
    const largo = Math.hypot(bx - ax, by - ay);
    if (largo === 0) continue;
    const [ux, uy] = [(bx - ax) / largo, (by - ay) / largo];
    // La normal izquierda (-uy, ux); "norte" es la que sube en latitud.
    const izquierdaEsNorte = ux > 0 || (ux === 0 && uy < 0);
    const pasos = Math.max(1, Math.ceil(largo / 0.2));
    for (let s = i === 1 ? 0 : 1; s <= pasos; s++) {
      const x = ax + ((bx - ax) * s) / pasos;
      const y = ay + ((by - ay) * s) / pasos;
      const [lat, lon] = dePlano(x, y);
      const enCtr = ctrs.some((ctr) => contiene(ctr, { lat, lon }));
      const media = enCtr ? reglas(c).dentro.mediaNm : reglas(c).fuera.mediaNm;
      const sur = c.zona !== "cordoba" && c.numero === "2" && enCtr ? SUR_DEL_2 : media;
      const [mi, md] = izquierdaEsNorte ? [media, sur] : [sur, media];
      izquierda.push(dePlano(x - uy * mi, y + ux * mi));
      derecha.push(dePlano(x + uy * md, y - ux * md));
    }
  }
  return [...izquierda, ...derecha.reverse()];
}

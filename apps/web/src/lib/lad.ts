/**
 * Los LAD (Lugares Aptos Denunciados) de ANAC en el plan de vuelo, la parte pura: leer la
 * lista, buscar por número o por nombre, y leer las coordenadas que escribe el piloto.
 *
 * La lista sale del CAD de ANAC (`scripts/build-lad.mjs` → `src/data/lad.tsv`): número y
 * nombre, **sin coordenadas**. En el plan, un LAD va con ZZZZ en la casilla 13 o 16 y en la 18
 * `DEP/` o `DEST/` con "el nombre y lugar", y para lo que no está en la AIP "el lugar en
 * coordenadas" (`docs/normativa/plan-de-vuelo-eana.md`): por eso el selector las pide aparte.
 */

export interface Lad {
  /** El número del LAD, sin ceros adelante: "2013". */
  numero: string;
  nombre: string;
}

/** El código con el que un LAD viaja por la app y se muestra: "LAD2013". */
export const codigoLad = (numero: string) => `LAD${Number(numero)}`;

/** "LAD2013" → "2013", o `null` si no es un código de LAD. */
export function numeroDeCodigoLad(codigo: string | null | undefined): string | null {
  const m = /^LAD\s?0*(\d{1,6})$/i.exec((codigo ?? "").trim());
  return m ? String(Number(m[1])) : null;
}

export function leerLadsTsv(texto: string): Lad[] {
  const salida: Lad[] = [];
  for (const linea of texto.split("\n")) {
    const [numero, nombre] = linea.split("\t");
    if (/^\d+$/.test(numero ?? "") && nombre?.trim()) salida.push({ numero, nombre: nombre.trim() });
  }
  return salida;
}

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/**
 * Busca por número ("2013", "LAD2013", "lad 2013") o por nombre ("villa josefina", sin
 * tildes, todas las palabras). Por número va primero el exacto y después los que empiezan
 * así; por nombre, primero los que empiezan con lo escrito.
 */
export function buscarLads(consulta: string, lads: Lad[], max = 6): Lad[] {
  const q = plano(consulta);
  if (q.length < 2) return [];
  const numero = /^(?:LAD ?)?0*(\d{1,6})$/.exec(q)?.[1];
  if (numero) {
    const exacto = lads.filter((l) => l.numero === numero);
    const empiezan = lads.filter((l) => l.numero !== numero && l.numero.startsWith(numero));
    return [...exacto, ...empiezan].slice(0, max);
  }
  // "LAD" a secas, o "lad villa": la palabra LAD no es parte del nombre.
  const palabras = q.split(" ").filter((p) => p && p !== "LAD");
  if (!palabras.length) return [];
  const coinciden = lads
    .map((l) => ({ l, n: plano(l.nombre) }))
    .filter(({ n }) => palabras.every((p) => n.includes(p)));
  coinciden.sort((a, b) => Number(b.n.startsWith(palabras[0])) - Number(a.n.startsWith(palabras[0])) || a.n.length - b.n.length);
  return coinciden.slice(0, max).map(({ l }) => l);
}

/**
 * Las coordenadas que escribe el piloto para un LAD, en lo que suele tener a mano:
 * - el formato del plan, grados y minutos: `3427S05835W` (con o sin espacio en el medio);
 * - grados, minutos y segundos: `34°27'15"S 58°35'30"W` (o con espacios: `34 27 15 S 58 35 30 W`);
 * - decimales, como los copia de un mapa: `-34.4542, -58.5913`.
 *
 * Devuelve `null` si no se entiende o si no cae en un lugar posible.
 */
export function leerCoordenadas(texto: string): { lat: number; lon: number } | null {
  const t = (texto ?? "").trim().toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!t) return null;
  const valida = (lat: number, lon: number) =>
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

  // 3427S05835W (o 342715S0583530W, con segundos).
  const oaci = /^(\d{2})(\d{2})(\d{2})?\s?([NS])\s?(\d{3})(\d{2})(\d{2})?\s?([EW])$/.exec(t);
  if (oaci) {
    const [, la, lam, las, ns, lo, lom, los, ew] = oaci;
    if (Number(lam) >= 60 || Number(lom) >= 60 || Number(las ?? 0) >= 60 || Number(los ?? 0) >= 60) return null;
    const lat = (Number(la) + Number(lam) / 60 + Number(las ?? 0) / 3600) * (ns === "S" ? -1 : 1);
    const lon = (Number(lo) + Number(lom) / 60 + Number(los ?? 0) / 3600) * (ew === "W" ? -1 : 1);
    return valida(lat, lon);
  }

  // 34°27'15"S 58°35'30"W, 34 27 S 58 35 W, 34°27.5'S…
  const gms = /^(\d{1,2})[°º\s]\s?(\d{1,2}(?:\.\d+)?)?['’\s]?\s?(\d{1,2}(?:\.\d+)?)?["”\s]?\s?([NS])\s(\d{1,3})[°º\s]\s?(\d{1,2}(?:\.\d+)?)?['’\s]?\s?(\d{1,2}(?:\.\d+)?)?["”\s]?\s?([EW])$/.exec(t);
  if (gms) {
    const [, la, lam, las, ns, lo, lom, los, ew] = gms;
    const lat = (Number(la) + Number(lam ?? 0) / 60 + Number(las ?? 0) / 3600) * (ns === "S" ? -1 : 1);
    const lon = (Number(lo) + Number(lom ?? 0) / 60 + Number(los ?? 0) / 3600) * (ew === "W" ? -1 : 1);
    return valida(lat, lon);
  }

  // -34.4542 -58.5913
  const dec = /^(-?\d{1,2}(?:\.\d+)?)\s(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (dec) return valida(Number(dec[1]), Number(dec[2]));
  return null;
}

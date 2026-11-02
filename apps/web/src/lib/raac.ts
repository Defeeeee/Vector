/**
 * "Preguntale a la RAAC" (2.31.0): buscar en el texto de la RAAC las secciones que
 * contestan una pregunta de reglamento, para que el copiloto (`/api/chat`, herramienta
 * `consultar_raac`) conteste **sólo con eso** y citando la sección (invariante 6).
 *
 * El texto está en `src/data/raac/raac-<parte>.json`, partido por sección por
 * `scripts/build-raac.mjs`, tal como lo publica ANAC. Hoy: la Parte 61, VI edición.
 *
 * La búsqueda es simple a propósito: palabras sin tildes, comparadas por su raíz (las primeras
 * cinco letras, para que "aterrizaje" encuentre "aterrizajes" y "médico" a "médica"), unos
 * sinónimos de cómo pregunta un piloto ("CMA", "de noche"), y el puntaje BM25: pesa lo raro
 * de cada palabra y no deja que una sección larguísima (las definiciones de 61.001) gane sólo
 * por nombrar todo. El título cuenta triple. Un número de sección ("61.060") va directo.
 */

export interface SeccionRaac {
  seccion: string;
  titulo: string;
  /** "Capítulo E: Licencia de piloto comercial": los títulos se repiten entre licencias. */
  capitulo?: string;
  pagina: number;
  texto: string;
}

export interface ParteRaac {
  parte: number;
  titulo: string;
  edicion: string;
  fuente: string;
  secciones: SeccionRaac[];
}

export interface ResultadoRaac {
  seccion: string;
  titulo: string;
  capitulo?: string;
  /** El texto de la sección; si es muy larga, sólo los párrafos que coinciden. */
  texto: string;
}

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const VACIAS = new Set(
  "que como cual cuales cuanto cuantos cuanta cuantas para por con sin los las del una uno unos unas este esta esto ese esa son ser hay tengo tiene tienen puedo puede pueden necesito necesita debo debe deben hacer hago mas menos muy cuando donde desde hasta sobre entre segun raac parte seccion piloto pilotos vuelo vuelos llevar sacar".split(" ")
);

/** Cómo pregunta un piloto → cómo lo dice la norma. */
const SINONIMOS: Record<string, string[]> = {
  cma: ["certificacion", "medica"],
  medico: ["medica"],
  noche: ["nocturn", "noche"],
  nocturno: ["nocturn", "noche"],
  vence: ["vigencia", "validez"],
  dura: ["vigencia", "validez"],
  duracion: ["vigencia", "validez"],
  vencimiento: ["vigencia", "validez"],
  // La VI edición no habla de "llevar pasajeros": la experiencia reciente (61.140) son
  // despegues y aterrizajes para actuar como piloto al mando, lleve o no a alguien.
  pasajeros: ["pasajer", "reciente"],
  aterrizajes: ["aterrizaje", "despegue", "reciente"],
  aterrizaje: ["aterrizaje", "despegue", "reciente"],
  recencia: ["reciente"],
  solo: ["solo"],
  alumno: ["alumno"],
  ppa: ["privado"],
  pca: ["comercial"],
  hvi: ["instrumentos"],
  ingles: ["ingles", "idioma"],
};

const raiz = (palabra: string) => palabra.slice(0, Math.min(palabra.length, 5));

function terminos(consulta: string): string[] {
  const palabras = sinTildes(consulta).match(/[a-zñ]{3,}/g) ?? [];
  const salida = new Set<string>();
  for (const p of palabras) {
    if (VACIAS.has(p)) continue;
    for (const s of SINONIMOS[p] ?? [p]) salida.add(raiz(s));
  }
  return [...salida];
}

const veces = (texto: string, termino: string) => texto.split(termino).length - 1;

/**
 * Si la sección es larga, los párrafos (o las oraciones, en las definiciones, que vienen de
 * corrido) que nombran algún término, hasta `max` caracteres.
 */
function recortar(texto: string, ts: string[], max: number): string {
  if (texto.length <= max) return texto;
  const partes = texto.includes("\n") ? texto.split("\n") : texto.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/);
  const elegidas = partes.filter((p) => ts.some((t) => sinTildes(p).includes(t)));
  const salida: string[] = [];
  let largo = 0;
  for (const p of elegidas.length ? elegidas : partes) {
    if (largo + p.length > max) break;
    salida.push(p);
    largo += p.length + 1;
  }
  return (salida.join("\n") || texto.slice(0, max)) + "\n[…]";
}

const K1 = 1.2;
const B = 0.75;

export function buscarEnRaac(consulta: string, partes: ParteRaac[], { max = 4, caracteres = 3500 } = {}): ResultadoRaac[] {
  const secciones = partes.flatMap((p) => p.secciones);
  // "61.060" o "61.060(b)": directo a la sección.
  const pedidas = [...consulta.matchAll(/\b(\d{2,3}\.\d{3,4})\b/g)].map((m) => m[1]);
  const directas = secciones.filter((s) => pedidas.includes(s.seccion));
  // "¿Qué es…?": primero las definiciones de la Parte (61.001), recortadas a lo que se pregunta.
  if (/\b(que es|que son|que significa|definicion|define)\b/.test(sinTildes(consulta))) {
    directas.push(...secciones.filter((s) => /\.001$/.test(s.seccion)));
  }

  const ts = terminos(consulta);
  // El capítulo cuenta como título: dice de qué licencia es "Experiencia de vuelo".
  const normalizadas = secciones.map((s) => ({ s, texto: sinTildes(s.texto), titulo: sinTildes(`${s.titulo} ${s.capitulo ?? ""}`) }));
  const df = new Map(ts.map((t) => [t, normalizadas.filter((n) => n.texto.includes(t) || n.titulo.includes(t)).length]));
  const largoMedio = normalizadas.reduce((t, n) => t + n.texto.length, 0) / Math.max(normalizadas.length, 1);
  const puntaje = (n: (typeof normalizadas)[number]) => {
    let p = 0;
    let distintos = 0;
    for (const t of ts) {
      const tf = veces(n.texto, t) + 3 * veces(n.titulo, t);
      if (!tf) continue;
      distintos++;
      const d = df.get(t) || 1;
      const idf = Math.log(1 + (secciones.length - d + 0.5) / (d + 0.5));
      p += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * n.texto.length) / largoMedio));
    }
    // Una sección que nombra varias de las palabras le gana a una que repite una sola.
    return p * (1 + distintos / Math.max(ts.length, 1));
  };

  const porPuntaje = ts.length
    ? normalizadas
        .map((n) => ({ s: n.s, p: puntaje(n) }))
        .filter((x) => x.p > 0)
        .sort((a, b) => b.p - a.p)
        .map((x) => x.s)
    : [];

  const vistas = new Set<string>();
  return [...directas, ...porPuntaje]
    .filter((s) => !vistas.has(s.seccion) && vistas.add(s.seccion))
    .slice(0, max)
    .map((s) => ({ seccion: s.seccion, titulo: s.titulo, capitulo: s.capitulo, texto: recortar(s.texto, ts, caracteres) }));
}

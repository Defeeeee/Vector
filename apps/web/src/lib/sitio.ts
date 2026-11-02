import type { Metadata } from "next";

/**
 * Lo público del sitio: la URL canónica y las guías. Lo leen el `sitemap`, la landing,
 * el índice de guías, el pie y los datos estructurados, así que una guía nueva se
 * agrega acá y aparece en todos lados. Un test comprueba que cada una tenga su página.
 */

/** La URL pública, sin barra final. Todo lo canónico se arma sobre ésta. */
export const SITIO_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://vector.fdiaznem.com.ar").replace(/\/+$/, "");

/**
 * Lo que va en todo `openGraph`: el de una página reemplaza entero al del layout, así
 * que sin esto las páginas públicas perdían el nombre del sitio y el idioma.
 */
export const OG_BASE = { siteName: "Vector", locale: "es_AR" } as const;

export interface Guia {
  /** El segmento de la URL: `/guias/<slug>`. */
  slug: string;
  /** El título de la página: el `<h1>` y el `<title>`. */
  titulo: string;
  /** Para los links: el pie, las tarjetas. */
  corto: string;
  /** El resumen del índice, y la meta description. Hasta ~160 caracteres. */
  descripcion: string;
  /** Cuándo se verificó contra las fuentes, ISO. */
  actualizada: string;
}

export const GUIAS: Guia[] = [
  {
    slug: "examen-ppa",
    corto: "Examen PPA",
    titulo: "Preguntas del examen de Piloto Privado (PPA) de ANAC, para practicar",
    descripcion:
      "379 preguntas del banco de ANAC con su respuesta y sus figuras, por materia: aerodinámica, motor, instrumentos, meteorología, navegación, performance y reglamentación.",
    actualizada: "2026-10-21",
  },
  {
    slug: "horas-centesimales",
    corto: "Horas centesimales",
    titulo: "Cuadro de horas centesimales: minutos a décimas de hora",
    descripcion:
      "El cuadro de la hoja del libro de vuelo para pasar minutos a décimas, con una calculadora: poné la hora de salida y la de llegada y te da el tiempo como va en el libro.",
    actualizada: "2026-09-23",
  },
  {
    slug: "libro-de-vuelo",
    corto: "Cómo completar el libro",
    titulo: "Cómo completar el libro de vuelo en Argentina",
    descripcion:
      "Columna por columna: itinerario, finalidad, aeronave, tiempos, aterrizajes, discriminación y certificaciones. Qué cambió con el registro electrónico de ANAC.",
    actualizada: "2026-09-23",
  },
  {
    slug: "cad-anac-registro-de-horas",
    corto: "Registro en el CAD",
    titulo: "Registro de horas de vuelo en el CAD de ANAC",
    descripcion:
      "Qué cambió con la Resolución 470/2025, desde cuándo es obligatorio y el paso a paso para declarar tus vuelos en el Casillero Aeronáutico Digital.",
    actualizada: "2026-09-23",
  },
  {
    slug: "requisitos-pca",
    corto: "Requisitos de la PCA",
    titulo: "Horas para la licencia de Piloto Comercial de Avión (PCA)",
    descripcion:
      "Los mínimos de experiencia de la RAAC 61.620: horas totales, al mando, de travesía, de instrumentos y nocturnas, con lo que cambió en la edición 2026.",
    actualizada: "2026-09-23",
  },
  {
    slug: "experiencia-reciente",
    corto: "¿Puedo volar hoy?",
    titulo: "¿Puedo volar hoy? Experiencia reciente, repaso de vuelo y CMA",
    descripcion:
      "Qué pide la RAAC 61 para ejercer tu licencia: aterrizajes en los últimos 90 o 180 días, experiencia nocturna, repaso de vuelo cada 24 meses y certificado médico vigente.",
    actualizada: "2026-09-23",
  },
];

export function guia(slug: string): Guia {
  const g = GUIAS.find((x) => x.slug === slug);
  if (!g) throw new Error(`No existe la guía ${slug}`);
  return g;
}

/** Una ruta del sitio como URL absoluta, para lo canónico y los datos estructurados. */
export function urlAbsoluta(ruta: string): string {
  return `${SITIO_URL}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "23 de septiembre de 2026", sin `Intl`: la misma cadena en el server y en cualquier
 * navegador (invariante 1).
 */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Las fuentes que citan las guías, en un solo lugar: si cambia una URL, cambia acá. */
export const FUENTES = {
  raac61: {
    texto: "RAAC Parte 61, VI edición (enero 2026), publicada en InfoLEG",
    url: "https://servicios.infoleg.gob.ar/infolegInternet/anexos/420000-424999/422623/res65.pdf",
  },
  res470: {
    texto: "Resolución ANAC 470/2025, Boletín Oficial del 15/07/2025",
    url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/328340/20250715",
  },
  procedimiento: {
    texto: "Procedimiento para el registro de actividad de vuelo electrónico (Anexo I de la Res. 470/2025), ANAC",
    url: "https://www.argentina.gob.ar/sites/default/files/pocedimiento_registro_electronico.pdf",
  },
  guiaCad: {
    texto: "Registro de Actividad de Vuelo, paso a paso para pilotos (guía de ANAC)",
    url: "https://www.argentina.gob.ar/sites/default/files/registro_act_vuelo_pilotos_0.pdf",
  },
  paginaCad: {
    texto: "Registro electrónico de horas de vuelo, página de ANAC",
    url: "https://www.argentina.gob.ar/anac/personal-aeronautico/foliado-de-libro-de-vuelo",
  },
  bancoPpa: {
    texto: "Preguntas de acuerdo RAAC 61.105, Conocimientos aeronáuticos (Res. ANAC 306/2014), página del examen de PPA de ANAC",
    url: "https://www.argentina.gob.ar/anac/personal-aeronautico/examenes/ppa-piloto-privado-de-avion",
  },
  res147: {
    texto: "Resolución ANAC 147/2013 y su Adjunto A, la hoja del libro de vuelo de pilotos (derogada por la Res. 470/2025)",
    url: "https://www.argentina.gob.ar/normativa/nacional/norma-210610/texto",
  },
} as const;

/** El `metadata` de una guía: título, descripción, canónica y vista previa. */
export function metadataDeGuia(slug: string): Metadata {
  const g = guia(slug);
  return {
    title: `${g.titulo} | Vector`,
    description: g.descripcion,
    alternates: { canonical: `/guias/${g.slug}` },
    openGraph: { ...OG_BASE, title: g.titulo, description: g.descripcion, url: `/guias/${g.slug}`, type: "article" },
  };
}

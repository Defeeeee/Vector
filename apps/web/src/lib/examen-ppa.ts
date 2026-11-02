import banco from "@/data/examen-ppa.json";

/**
 * La práctica del examen de Piloto Privado (PPA) con el banco de preguntas de ANAC
 * (`docs/normativa/examen-ppa-anac.md`): 379 preguntas con su respuesta, en 8 materias. 63
 * llevan su figura, recortada del mismo banco (`public/examen-ppa/`).
 *
 * Puro: armar una tanda, corregir y llevar la cuenta de lo que se falló. La cuenta vive en
 * el navegador de quien practica (no hace falta cuenta en Vector).
 */
export interface Pregunta {
  /** El número de la pregunta en el banco de ANAC (RAAC 61.105, Res. 306/2014). */
  id: number;
  materia: Materia;
  pregunta: string;
  opciones: string[];
  /** El índice de la opción correcta, como la marca el banco. */
  correcta: number;
  /** La figura que el banco pone en la pregunta, si tiene. */
  figura?: { src: string; ancho: number; alto: number };
}

export const MATERIAS = [
  "Aerodinámica",
  "Grupo motopropulsor",
  "Instrumentos de vuelo",
  "Meteorología",
  "Navegación",
  "Performance",
  "Reglamentación",
  "Generalidades",
] as const;
export type Materia = (typeof MATERIAS)[number];

export const PREGUNTAS = banco as Pregunta[];

/** La nota de las preguntas de reglamentación: el banco es de 2014 y la RAAC 61 cambió en 2026. */
export const NOTA_REGLAMENTACION =
  "Es la respuesta del banco de ANAC (2014). La RAAC 61 se reeditó en enero de 2026: ante una duda, manda la norma vigente.";

/** Lo que se lleva de cada pregunta: cuántas veces se acertó y se falló, y cómo salió la última. */
export type Historial = Record<string, { bien: number; mal: number; ultima: boolean }>;

export function registrar(h: Historial, id: number, acierto: boolean): Historial {
  const previa = h[id] ?? { bien: 0, mal: 0, ultima: false };
  return { ...h, [id]: { bien: previa.bien + (acierto ? 1 : 0), mal: previa.mal + (acierto ? 0 : 1), ultima: acierto } };
}

/** Las que la última vez salieron mal: lo que conviene repasar. */
export function falladas(h: Historial, preguntas: Pregunta[] = PREGUNTAS): Pregunta[] {
  return preguntas.filter((p) => h[p.id] && !h[p.id].ultima);
}

/** Cuántas de cada materia se vieron alguna vez, para mostrar el avance. */
export function avance(h: Historial, preguntas: Pregunta[] = PREGUNTAS): { materia: Materia; total: number; vistas: number; bien: number }[] {
  return MATERIAS.map((materia) => {
    const de = preguntas.filter((p) => p.materia === materia);
    return {
      materia,
      total: de.length,
      vistas: de.filter((p) => h[p.id]).length,
      bien: de.filter((p) => h[p.id]?.ultima).length,
    };
  });
}

/**
 * Una tanda de `cantidad` preguntas al azar de `materia` (o de todas), sin repetir. Con
 * `soloFalladas`, sólo las que la última vez salieron mal. `azar` es inyectable para los tests.
 */
export function armarTanda(
  opciones: { materia?: Materia | null; cantidad: number; soloFalladas?: boolean; historial?: Historial },
  azar: () => number = Math.random,
  preguntas: Pregunta[] = PREGUNTAS
): Pregunta[] {
  let pool = opciones.materia ? preguntas.filter((p) => p.materia === opciones.materia) : preguntas;
  if (opciones.soloFalladas) pool = falladas(opciones.historial ?? {}, pool);
  const mezcla = [...pool];
  for (let i = mezcla.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [mezcla[i], mezcla[j]] = [mezcla[j], mezcla[i]];
  }
  return mezcla.slice(0, Math.max(0, opciones.cantidad));
}

/** El resultado de una tanda, en total y por materia. */
export function resultado(respuestas: { pregunta: Pregunta; elegida: number }[]) {
  const bien = respuestas.filter((r) => r.elegida === r.pregunta.correcta).length;
  const porMateria = MATERIAS.map((materia) => {
    const de = respuestas.filter((r) => r.pregunta.materia === materia);
    return { materia, total: de.length, bien: de.filter((r) => r.elegida === r.pregunta.correcta).length };
  }).filter((m) => m.total > 0);
  return { total: respuestas.length, bien, porcentaje: respuestas.length ? Math.round((100 * bien) / respuestas.length) : 0, porMateria };
}

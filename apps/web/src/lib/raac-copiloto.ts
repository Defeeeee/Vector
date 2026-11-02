import { Type } from "@google/genai";
import raac61 from "@/data/raac/raac-61.json";
import { buscarEnRaac, type ParteRaac } from "@/lib/raac";

/**
 * "Preguntale a la RAAC" en los dos copilotos (el de la web, `/api/chat`, y el de WhatsApp):
 * las reglas del prompt, la herramienta `consultar_raac` y lo que devuelve. Un solo lugar,
 * para que los dos contesten igual (invariante 6: lo regulatorio, contra la norma).
 */

/** Las Partes de la RAAC que el copiloto puede citar (`scripts/build-raac.mjs`). */
export const RAAC: ParteRaac[] = [raac61 as ParteRaac];

export const REGLAS_RAAC = `## PREGUNTAS DE REGLAMENTO (RAAC):
1. Para cualquier pregunta de reglamentación —licencias, habilitaciones, CMA, experiencia reciente, requisitos de horas, vuelo solo, instructor, edad, idioma, qué dice una sección—, llamá SIEMPRE a 'consultar_raac' antes de contestar. Podés llamarla más de una vez con otras palabras si lo primero no sirve.
2. Contestá SÓLO con el texto que devuelve, y citá cada dato con su sección exacta (ej: "RAAC 61.140(a)(2)"). Podés explicarlo en criollo, pero sin agregar números, plazos ni condiciones que no estén en ese texto.
3. Si lo que devuelve no contesta la pregunta, decí que no está en los textos de la RAAC que tiene Vector y que lo consulte en la norma o con su instructor. NUNCA contestes reglamento de memoria, aunque creas saberlo.
4. Hoy Vector tiene la RAAC 61 (licencias y habilitaciones de piloto, VI Edición, enero 2026). Todavía NO tiene la RAAC 91 (reglas de vuelo y operación): si preguntan algo de reglas de vuelo, espacio aéreo, plan de vuelo, mínimos VFR o equipamiento, decilo así.
5. Cerrá las respuestas de reglamento con: "Fuente: RAAC 61, VI Edición (enero 2026). Ante una duda, manda la norma vigente."`;

export const DECLARACION_RAAC = {
  name: "consultar_raac",
  description:
    "Busca en el texto oficial de la RAAC 61 (licencias y habilitaciones de piloto, VI Edición, enero 2026) las secciones que contestan una pregunta de reglamento, y devuelve su texto tal como lo publica ANAC, con el número de sección. Úsala SIEMPRE ante preguntas de reglamentación; no contestes reglamento sin ella.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      consulta: {
        type: Type.STRING,
        description: "La pregunta o las palabras clave, en castellano (ej: 'experiencia reciente nocturna', 'validez del certificado médico', '61.505').",
      },
    },
    required: ["consulta"],
  },
};

/** Lo que recibe el modelo: el texto de las secciones, o que no hay nada. */
export function respuestaRaac(consulta: unknown) {
  const secciones = buscarEnRaac(String(consulta ?? ""), RAAC);
  return secciones.length
    ? {
        fuente: "RAAC 61, VI Edición (enero 2026), texto publicado por ANAC",
        secciones: secciones.map((r) => ({ seccion: `RAAC ${r.seccion}`, titulo: r.titulo, capitulo: r.capitulo, texto: r.texto })),
      }
    : { secciones: [], nota: "No se encontró nada sobre eso en la RAAC 61 que tiene Vector." };
}

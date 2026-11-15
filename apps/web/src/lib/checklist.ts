/**
 * Las checklists del avión (3.39.0): lo que el piloto cargó, tal cual. **Vector no inventa ni
 * completa procedimientos**: no hay ninguna de fábrica.
 *
 * El formato de texto (el que se escribe y se guarda; lo repite `apps/api/src/models/checklists.py`):
 *
 *   # Título          empieza una sección
 *   - texto           un paso (con tilde; el número lo pone la pantalla)
 *     - texto         (con sangría) un sub-paso del elemento anterior: A., B., C.
 *   > texto           una nota (sin tilde)
 *
 * Las líneas sueltas antes del primer `#` son notas de introducción (sección sin título); las vacías
 * se ignoran y cualquier otra línea suelta es un paso. Lógica pura, sin DOM.
 */

export interface ElementoChecklist {
  tipo: "paso" | "nota";
  texto: string;
  sub: string[];
}

export interface SeccionChecklist {
  titulo: string | null;
  elementos: ElementoChecklist[];
}

export interface EstructuraChecklist {
  secciones: SeccionChecklist[];
}

export const MAX_NOMBRE = 80;
export const MAX_SECCIONES = 40;
export const MAX_ELEMENTOS = 80;
export const MAX_LARGO_ELEMENTO = 300;
export const MAX_SUB = 12;
export const MAX_TEXTO = 40_000;

export function parsearChecklist(texto: string): EstructuraChecklist {
  const secciones: SeccionChecklist[] = [];
  for (const cruda of texto.replace(/\r/g, "").split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (linea.startsWith("#")) {
      secciones.push({ titulo: linea.replace(/^#+/, "").trim(), elementos: [] });
      continue;
    }
    if (secciones.length === 0) secciones.push({ titulo: null, elementos: [] });
    const elementos = secciones[secciones.length - 1].elementos;
    const conSangria = /^( {2}|\t)/.test(cruda);
    if (conSangria && linea.startsWith("- ") && elementos.length > 0) {
      elementos[elementos.length - 1].sub.push(linea.slice(2).trim());
    } else if (linea.startsWith(">")) {
      elementos.push({ tipo: "nota", texto: linea.slice(1).trim(), sub: [] });
    } else if (linea.startsWith("- ") || linea === "-") {
      elementos.push({ tipo: "paso", texto: linea.slice(1).trim(), sub: [] });
    } else {
      // Antes del primer `#` una línea suelta es una nota de introducción; después, un paso.
      elementos.push({ tipo: secciones.length === 1 && secciones[0].titulo === null ? "nota" : "paso", texto: linea, sub: [] });
    }
  }
  return { secciones };
}

export function escribirChecklist(estructura: EstructuraChecklist): string {
  const bloques: string[] = [];
  for (const s of estructura.secciones) {
    const lineas: string[] = [];
    if (s.titulo !== null) lineas.push(`# ${s.titulo}`.trimEnd());
    for (const e of s.elementos) {
      lineas.push(`${e.tipo === "nota" ? ">" : "-"} ${e.texto}`.trimEnd());
      for (const sub of e.sub) lineas.push(`  - ${sub}`);
    }
    bloques.push(lineas.join("\n"));
  }
  return bloques.join("\n\n");
}

/** "Master Aviónica: OFF" → etiqueta y valor, cortando en el primer ":". Sin ":" es sólo etiqueta. */
export function partirPaso(texto: string): { etiqueta: string; valor: string | null } {
  const i = texto.indexOf(":");
  if (i < 0) return { etiqueta: texto.trim(), valor: null };
  const valor = texto.slice(i + 1).trim();
  return { etiqueta: texto.slice(0, i).trim(), valor: valor || null };
}

/** Un identificador estable de cada ítem tildable: sección, elemento y sub-paso (o -1 si es el paso). */
export function claveDeItem(seccion: number, elemento: number, sub: number = -1): string {
  return sub < 0 ? `${seccion}.${elemento}` : `${seccion}.${elemento}.${sub}`;
}

/** Las claves de todo lo que se tilda: los pasos y los sub-pasos de los pasos (no de las notas). */
export function itemsTildables(seccion: SeccionChecklist, indice: number): string[] {
  const claves: string[] = [];
  seccion.elementos.forEach((e, i) => {
    if (e.tipo !== "paso") return;
    claves.push(claveDeItem(indice, i));
    e.sub.forEach((_s, j) => claves.push(claveDeItem(indice, i, j)));
  });
  return claves;
}

/** Por qué un nombre o un texto no entra, o null si está bien: los mismos topes que el backend. */
export function validarChecklist(nombre: string, texto: string): string | null {
  const n = nombre.trim();
  if (!n) return "Ponele un nombre a la checklist.";
  if (n.length > MAX_NOMBRE) return `El nombre pasa de ${MAX_NOMBRE} letras.`;
  if (texto.length > MAX_TEXTO) return `La checklist es demasiado larga (máximo ${MAX_TEXTO.toLocaleString("es-AR")} letras).`;
  const { secciones } = parsearChecklist(texto);
  if (secciones.length > MAX_SECCIONES) return `Hay demasiadas secciones (máximo ${MAX_SECCIONES}).`;
  for (const s of secciones) {
    if ((s.titulo?.length ?? 0) > MAX_LARGO_ELEMENTO) return `Un título pasa de ${MAX_LARGO_ELEMENTO} letras.`;
    if (s.elementos.length > MAX_ELEMENTOS) return `Una sección tiene más de ${MAX_ELEMENTOS} elementos.`;
    for (const e of s.elementos) {
      if (e.texto.length > MAX_LARGO_ELEMENTO || e.sub.some((x) => x.length > MAX_LARGO_ELEMENTO)) {
        return `Un paso o nota pasa de ${MAX_LARGO_ELEMENTO} letras.`;
      }
      if (e.sub.length > MAX_SUB) return `Un elemento tiene más de ${MAX_SUB} sub-pasos.`;
    }
  }
  return null;
}

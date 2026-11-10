/**
 * Las rutas guardadas del Mapa (migración 039 del backend): lo que vuelve de `/rutas` y el
 * nombre que se propone al guardar. Puro, testeado.
 */

export interface RutaGuardada {
  id: string;
  nombre: string;
  /** La ruta como se escribe en el Mapa: "SADF DCT SADM". */
  ruta: string;
  aircraft_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Lo que el backend acepta (`RutaGuardadaCrear`). */
export const MAX_NOMBRE_RUTA = 80;
export const MAX_RUTA = 600;

/**
 * El nombre que se propone: "SADF → SADM", "SADF local" si sale y vuelve al mismo lugar, o
 * "SADF → SAAK por BENAVIDEZ" con un punto en el medio. Sin DCT: no dice nada.
 */
export function nombreSugerido(tokens: string[]): string {
  const t = tokens.filter((x) => x && x !== "DCT");
  if (t.length === 0) return "";
  if (t.length === 1) return t[0];
  const [salida, llegada] = [t[0], t[t.length - 1]];
  const medio = t.slice(1, -1);
  if (salida === llegada) return medio.length ? `${salida} local por ${medio.join(" ")}`.slice(0, MAX_NOMBRE_RUTA) : `${salida} local`;
  const base = `${salida} → ${llegada}`;
  if (medio.length === 1) return `${base} por ${medio[0]}`;
  return base;
}

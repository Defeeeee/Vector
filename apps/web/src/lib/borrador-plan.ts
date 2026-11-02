/**
 * El borrador de un plan de vuelo en el teléfono, para editarlo sin señal (2026-10-23).
 *
 * El editor guarda cada cambio en el servidor (`guardarPlan`), y además lo deja acá, en el
 * navegador: si no hay señal o se cierra la app con el guardado pendiente, lo escrito no se
 * pierde. Al abrir el plan, el borrador se recupera **sólo si es más nuevo que lo que tiene el
 * servidor**; si en otro dispositivo se guardó algo después, gana el servidor.
 *
 * Puro: la clave y la decisión. Leer y escribir `localStorage` es del componente.
 */
export interface BorradorPlan<F> {
  formulario: F;
  /** ISO, cuándo se escribió en el teléfono. */
  at: string;
}

export const claveBorrador = (id: string) => `vector-plan-borrador-${id}`;

/** El formulario del borrador si hay que recuperarlo, o `null`. */
export function borradorParaRecuperar<F>(borrador: BorradorPlan<F> | null | undefined, servidorAt: string | null | undefined): F | null {
  if (!borrador?.formulario || typeof borrador.at !== "string") return null;
  const b = Date.parse(borrador.at);
  if (!Number.isFinite(b)) return null;
  const s = Date.parse(servidorAt ?? "");
  return !Number.isFinite(s) || b > s ? borrador.formulario : null;
}

/** Lee un borrador guardado como texto, o `null` si no hay o está roto. */
export function leerBorrador<F>(texto: string | null): BorradorPlan<F> | null {
  if (!texto) return null;
  try {
    const b = JSON.parse(texto);
    return b && typeof b === "object" && "formulario" in b && typeof b.at === "string" ? (b as BorradorPlan<F>) : null;
  } catch {
    return null;
  }
}

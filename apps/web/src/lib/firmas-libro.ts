/**
 * Las firmas de quienes certifican los vuelos (migración 047) y el dorso de cada hoja:
 * a quién le corresponde cada vuelo y cómo entra la imagen en su lugar. Puro y testeado.
 *
 * **Certificar es del certificante.** Vector guarda la imagen de su firma sólo si el piloto
 * dice que tiene su autorización, la usa **únicamente** en el PDF de ese piloto y **sólo
 * si él pide "Con las firmas de los certificantes"** (apagado por defecto). Un vuelo sin
 * certificante, o cuyo certificante no tiene firma guardada, queda en blanco en la columna:
 * no se inventa ni se reparte una firma "parecida".
 */

export interface FirmaCertificante {
  id: string;
  nombre: string;
  licencia?: string | null;
  /** El id de `AUTORIDADES_CAD`, si la firma corresponde a un cargo de la lista del CAD. */
  autoridad_id?: number | null;
  png: string;
}

export interface DorsoHoja {
  id: string;
  logbook_id: string;
  hoja: number;
  png?: string | null;
  aclaracion?: string | null;
  fecha?: string | null;
}

/** "  Pérez,  JUAN " y "juan perez" son la misma persona: sin acentos, en mayúsculas, sin puntuación. */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las mismas palabras en cualquier orden: "PÉREZ JUAN" y "JUAN PÉREZ". */
function clavePalabras(nombre: string): string {
  return normalizarNombre(nombre).split(" ").filter(Boolean).sort().join(" ");
}

/**
 * La firma que le toca a un vuelo.
 *
 * 1. **Por nombre**, que es lo que identifica a una persona (`cad_autoridad_nombre`): igual
 *    una vez normalizado, o con las mismas palabras en otro orden ("PÉREZ, JUAN").
 * 2. **Por cargo (`cad_autoridad_id`), sólo si el vuelo no trae nombre** y una única firma
 *    guardada corresponde a ese cargo: el id es "instructor de vuelo", no una persona, así
 *    que con dos instructores guardados no se elige a ninguno.
 * 3. Si no, `null`: la celda queda en blanco.
 */
export function firmaParaVuelo(
  certificante: { autoridadId: number | null; nombre: string } | null | undefined,
  firmas: FirmaCertificante[]
): FirmaCertificante | null {
  if (!certificante || !firmas.length) return null;
  const nombre = normalizarNombre(certificante.nombre);
  if (nombre) {
    const exacta = firmas.find((f) => normalizarNombre(f.nombre) === nombre);
    if (exacta) return exacta;
    const clave = clavePalabras(certificante.nombre);
    return firmas.find((f) => clavePalabras(f.nombre) === clave) ?? null;
  }
  if (certificante.autoridadId) {
    const delCargo = firmas.filter((f) => f.autoridad_id === certificante.autoridadId);
    return delCargo.length === 1 ? delCargo[0] : null;
  }
  return null;
}

/** El tamaño de una imagen ajustada a una caja, sin deformarla ni agrandarla de más. */
export function ajustarEnCaja(
  ancho: number,
  alto: number,
  cajaW: number,
  cajaH: number,
  agrandar = false
): { w: number; h: number } {
  if (ancho <= 0 || alto <= 0 || cajaW <= 0 || cajaH <= 0) return { w: 0, h: 0 };
  let escala = Math.min(cajaW / ancho, cajaH / alto);
  if (!agrandar) escala = Math.min(1, escala);
  return { w: ancho * escala, h: alto * escala };
}

/** Los dorsos de un libro por número de hoja, sólo los que tienen algo cargado. */
export function dorsosPorHoja(dorsos: DorsoHoja[], libroId: string | null | undefined): Map<number, DorsoHoja> {
  const m = new Map<number, DorsoHoja>();
  for (const d of dorsos) {
    if (libroId && d.logbook_id !== libroId) continue;
    if (!d.png && !d.aclaracion?.trim() && !d.fecha) continue;
    m.set(d.hoja, d);
  }
  return m;
}

/** "2026-11-02" → "02/11/2026", sin pasar por `Date` (invariante 1). */
export function fechaDelDorso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * El píxel de Meta: dónde se carga, y el consentimiento.
 *
 * Federico lo pidió el 2026-10-06 para medir los anuncios de Meta: sin píxel, Meta no
 * sabe quién se registró después de tocar un anuncio. El píxel le manda a Meta datos de
 * quien visita la página, así que se carga con tres límites:
 *
 * 1. **Sólo con consentimiento.** Un cartel pregunta; sin un "sí", no se carga nada. La
 *    elección queda en el navegador (`localStorage`) y se cambia desde la política de
 *    privacidad.
 * 2. **Sólo en las páginas públicas sin datos de nadie** (`pixelPermitidoEn`): la portada y
 *    las guías. Nunca adentro de la app (ahí está el CMA, un dato de salud), ni en el perfil
 *    público de un piloto (es de otra persona), ni en el login, ni en las pantallas que
 *    llevan tokens en la URL (`/update-password`, `/auth/callback`, `/mail/…`).
 * 3. **En el registro, sólo después de enviarlo** (`registroCompleto`): con el formulario
 *    en pantalla, la "coincidencia avanzada" de Meta puede leer el mail que se está
 *    escribiendo. Además, la configuración automática (que lee botones y metadatos de la
 *    página) va apagada: `fbq('set', 'autoConfig', false, id)`.
 *
 * El ID sale de `NEXT_PUBLIC_META_PIXEL_ID`, que Next mete en el build: sin la variable no
 * se carga nada, ni el cartel.
 */

export const PIXEL_META_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;

/** Las páginas donde se puede cargar. Todo lo demás, no. */
export function pixelPermitidoEn(ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return limpia === "/" || limpia === "/guias" || limpia.startsWith("/guias/");
}

export type Consentimiento = "si" | "no";
const CLAVE = "vector:consentimiento-meta";

/** La elección guardada en este navegador, o `null` si todavía no eligió. */
export function leerConsentimiento(almacen: Pick<Storage, "getItem"> | null | undefined): Consentimiento | null {
  try {
    const v = almacen?.getItem(CLAVE);
    return v === "si" || v === "no" ? v : null;
  } catch {
    // Navegación privada o almacenamiento bloqueado: se pregunta de nuevo.
    return null;
  }
}

export function guardarConsentimiento(almacen: Pick<Storage, "setItem" | "removeItem"> | null | undefined, valor: Consentimiento | null): void {
  try {
    if (valor) almacen?.setItem(CLAVE, valor);
    else almacen?.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento, la elección dura lo que la pestaña.
  }
}

/** Aviso entre componentes: cambió la elección o terminó un registro. */
export const EVENTO_CONSENTIMIENTO = "vector:consentimiento-meta";
export const EVENTO_REGISTRO = "vector:registro-completo";

/**
 * Lo llama el registro cuando salió bien. Si hay consentimiento, el componente del píxel
 * lo carga (si no estaba) y manda `CompleteRegistration`.
 */
export function registroCompleto(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_REGISTRO));
}

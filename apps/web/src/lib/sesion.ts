/**
 * Cuándo hay que renovar la sesión.
 *
 * Vive acá y no adentro de `src/proxy.ts` por una razón práctica: `vitest` corre con
 * `include: ["src/**\/*.test.ts"]` y no puede montar un proxy de Next, así que lo que
 * quede en ese archivo **no se testea nunca**. La decisión de renovar es la parte con
 * aritmética —y con un caso límite peligroso, el token ilegible— así que sale de ahí.
 */

/**
 * Cuánto antes del vencimiento se renueva.
 *
 * No es cero a propósito: una página que empieza a renderizar con un token al que le
 * quedan tres segundos hace sus llamadas a la API con el token ya vencido. Cinco
 * minutos alcanzan para cualquier render y son chicos frente a la hora que dura el
 * token de Supabase.
 */
export const MARGEN_MS = 5 * 60 * 1000;

/**
 * Milisegundos que le quedan de vida al JWT, o `null` si no se puede saber.
 *
 * **No verifica la firma, y no tiene por qué**: de eso se ocupa el backend en cada
 * request. Acá el `exp` se usa sólo para decidir *cuándo* renovar. Un token
 * falsificado con un `exp` mentiroso no gana nada: la API lo rechaza igual.
 *
 * Devuelve `null` ante cualquier cosa rara —y no "vencido"— porque son dos cosas
 * distintas. Si no se entiende el token, lo correcto es no tocarlo y dejar que la API
 * decida, que es exactamente lo que pasaba antes de que esto existiera.
 */
export function vidaRestante(jwt: string | undefined, ahora: number = Date.now()): number | null {
  if (!jwt) return null;
  const partes = jwt.split(".");
  if (partes.length !== 3) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="));
    /*
      El payload trae nombre y apellido del piloto, así que puede tener UTF-8
      multibyte. `atob` devuelve bytes crudos: sin este decode, un apellido con acento
      llegaría a `JSON.parse` como caracteres sueltos. Es el tipo de bug que aparece
      sólo en algunas cuentas y parece embrujado.
    */
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000 - ahora;
  } catch {
    return null;
  }
}

/**
 * Si corresponde canjear el refresh token antes de servir esta navegación.
 *
 * Sin `refresh_token` no hay nada que canjear, por más vencido que esté el otro.
 * Con token ilegible (`vidaRestante === null`) tampoco: **no se renueva lo que no se
 * entiende**. Sin `session_token` sí, que es el caso de volver después de un día.
 */
export function necesitaRenovar(
  sessionToken: string | undefined,
  refreshToken: string | undefined,
  ahora: number = Date.now()
): boolean {
  if (!refreshToken) return false;
  if (!sessionToken) return true;
  const vida = vidaRestante(sessionToken, ahora);
  if (vida === null) return false;
  return vida < MARGEN_MS;
}

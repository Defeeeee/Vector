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

/**
 * Cuánto dura la sesión sin usar la app (3.13.0, Federico: "que sea cada 2 días").
 * Es la vida de la cookie del refresh token, y **se corre con cada uso**: cada renovación (una
 * por hora de uso, en `src/proxy.ts`) la vuelve a poner en dos días. Hasta la 3.12.0 eran 30.
 */
export const DURACION_SESION_S = 60 * 60 * 24 * 2;

/**
 * Una marca de que en este navegador hubo una sesión, sin nada adentro. Sirve para distinguir
 * "tu sesión expiró" de "nunca entraste": cuando la cookie del refresh token vence, el navegador
 * la borra y del otro lado no queda rastro. La borra sólo "Cerrar sesión", que no es expirar.
 */
export const COOKIE_HUBO_SESION = "vector_hubo_sesion";
export const DURACION_MARCA_S = 60 * 60 * 24 * 365;

/** A dónde va quien llega al dashboard sin sesión: al login, avisando si la suya expiró. */
export function destinoSinSesion(huboSesion: boolean): string {
  return huboSesion ? "/login?expirada=1" : "/login";
}

/**
 * Volver a la pantalla de antes al ingresar (3.15.0). El destino viaja en `?volver=` y sólo se
 * acepta una ruta del dashboard: nada que empiece con `//` o traiga un esquema (un link armado
 * por otro llevaría a quien ingresa a otro sitio), ni las rutas de la API.
 */
export function volverSeguro(volver: string | null | undefined): string | null {
  if (!volver) return null;
  let v: string;
  try {
    v = decodeURIComponent(volver);
  } catch {
    return null;
  }
  if (!/^\/dashboard(?:[/?#]|$)/.test(v)) return null;
  if (v.includes("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return null;
  return v;
}

/** Donde el login deja el destino para la vuelta de Google (`/auth/callback`). */
export const CLAVE_VOLVER = "vector-volver";

/** El login con el destino, si hay uno que valga la pena (al inicio no hace falta decirlo). */
export function loginCon(base: string, volver: string | null | undefined): string {
  const v = volverSeguro(volver);
  if (!v || v === "/dashboard") return base;
  return `${base}${base.includes("?") ? "&" : "?"}volver=${encodeURIComponent(v)}`;
}

/**
 * El `domain` de las cookies de sesión, según el host con el que entró el pedido (mudanza a
 * `vectoraero.ar`, 2026-11): durante la transición los dos dominios andan a la vez y cada uno
 * necesita su cookie, porque el navegador descarta una cookie de un dominio que no es el suyo.
 * Los subdominios comparten la del dominio raíz. Localhost, previews y cualquier otro host
 * van sin `domain` (host-only), como en desarrollo.
 *
 * Tiene que usarse igual al poner y al borrar la cookie: borrar con otro `domain` no borra nada.
 */
export function dominioDeCookie(host: string | null | undefined): string | undefined {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (h === "vectoraero.ar" || h.endsWith(".vectoraero.ar")) return ".vectoraero.ar";
  if (h === "fdiaznem.com.ar" || h.endsWith(".fdiaznem.com.ar")) return ".fdiaznem.com.ar";
  return undefined;
}

/** El host del pedido, como lo ve el navegador: el que reenvía el proxy o, si no, `host`. */
export function hostDelPedido(headers: { get(nombre: string): string | null }): string | null {
  return headers.get("x-forwarded-host") || headers.get("host");
}

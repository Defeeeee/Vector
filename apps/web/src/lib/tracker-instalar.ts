/**
 * Vector Tracker: instalar la app antes de entrar. En el teléfono, el tracker sólo funciona instalado
 * (los avisos de despegue y aterrizaje en iPhone sólo llegan con la página en el inicio). La decisión
 * "¿instalada o no?" la toma CSS (`globals.css`, `tracker-app`); esto es lo puro: qué sistema es, si es
 * un navegador adentro de otra app, y los links de invitación que no se pueden perder al instalar.
 */

export type SistemaInstalar = "ios" | "android" | "otro";

export type DetalleSistema = {
  sistema: SistemaInstalar;
  /** Un navegador metido en otra app (WhatsApp, Instagram…) o, en iOS, uno que no es Safari. */
  enOtraApp: boolean;
  /** Cómo se llama el navegador que hay que abrir: "Safari" o "Chrome". */
  navegadorSugerido: "Safari" | "Chrome" | null;
};

const OTRA_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Twitter|GSA\/|Gmail|; wv\)|\bwv\b|MicroMessenger|TikTok|musical_ly|Messenger/i;
const IOS_NO_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/i;

export function detectarSistema(userAgent: string, plataforma = "", puntosDeToque = 0): DetalleSistema {
  const ua = userAgent ?? "";
  // Android primero: un user agent de Android nunca es un iPhone, aunque la plataforma diga otra cosa
  // (pasa al emular un teléfono desde una Mac).
  if (/Android/i.test(ua)) {
    return { sistema: "android", enOtraApp: OTRA_APP.test(ua), navegadorSugerido: "Chrome" };
  }
  // El iPad con Safari "de escritorio" se presenta como una Mac: Macintosh en el user agent, con pantalla táctil.
  const esIOS = /iPad|iPhone|iPod/.test(ua) || (plataforma === "MacIntel" && puntosDeToque > 1 && /Macintosh/.test(ua));
  if (esIOS) {
    const enOtraApp = OTRA_APP.test(ua) || IOS_NO_SAFARI.test(ua) || !/Safari\//.test(ua);
    return { sistema: "ios", enOtraApp, navegadorSugerido: "Safari" };
  }
  return { sistema: "otro", enOtraApp: false, navegadorSugerido: null };
}

const TOKEN_INVITACION = "[A-Za-z0-9_-]{32,128}";
const RUTA_INVITACION = new RegExp(`^/invitacion/${TOKEN_INVITACION}$`);

/** El `desde` del manifest: sólo la ruta de una invitación, nada más (sin redirecciones abiertas). */
export function desdeValido(desde: string | null | undefined): string | null {
  if (!desde) return null;
  return RUTA_INVITACION.test(desde) ? desde : null;
}

const HOSTS_TRACKER = ["tracker.vectoraero.ar"];

/**
 * Lo que la persona pega en "¿Te mandaron un link de invitación?": el link entero del tracker o sólo la
 * ruta. Devuelve la ruta interna `/invitacion/<token>` o null. Nunca otro host.
 */
export function rutaDeInvitacionPegada(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 300) return null;
  if (RUTA_INVITACION.test(t)) return t;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS_TRACKER.includes(url.hostname.toLowerCase()) || url.port) return null;
  return RUTA_INVITACION.test(url.pathname) ? url.pathname : null;
}

/** La invitación en la que está la persona (`/invitacion/<token>`), o null. */
export function invitacionDeLaRuta(pathname: string | null | undefined): string | null {
  return desdeValido(pathname ?? null);
}

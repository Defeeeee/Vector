import { estadoDeAvisos, type EstadoAvisos } from "@/lib/push";

/**
 * "Avisarme cuando despegue y cuando aterrice" en el link público del vuelo (`/seguir/[token]`,
 * migración 046 del backend): lo que se puede decidir sin navegador. El componente
 * (`components/seguimiento/AvisarVuelo.tsx`) es plomería; el criterio vive acá, con tests.
 *
 * Es el mismo push web de la red (`lib/push.ts`, el service worker de `sw/sw.ts`), pero **sin
 * cuenta**: la suscripción del navegador se guarda sólo para ese link y se borra con él.
 */

/** Dónde este navegador recuerda que pidió avisos de ese vuelo (el `endpoint` con que lo pidió). */
export function claveDeAvisoVuelo(token: string): string {
  return `vector-avisos-vuelo:${token}`;
}

/**
 * Qué se le ofrece a quien mira. Prendidos es sólo si **este link** lo pidió además de tener
 * permiso y suscripción: un navegador puede estar suscripto a la red (o a otro vuelo) sin haber
 * pedido avisos de éste.
 */
export function estadoDeAvisosVuelo(e: {
  soportaPush: boolean;
  esIOS: boolean;
  instalada: boolean;
  permiso: "default" | "granted" | "denied";
  suscripto: boolean;
  pidioEsteVuelo: boolean;
}): EstadoAvisos {
  return estadoDeAvisos({ ...e, suscripto: e.suscripto && e.pidioEsteVuelo });
}

const HOSTS_EXACTOS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const HOSTS_SUFIJOS = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];

/**
 * ¿Es la URL de un servicio de push conocido? Lo mismo que exige el backend
 * (`endpoint_de_push_valido`): https, sin usuario, puerto 443 y host de la lista. Acá se mira antes
 * de reenviar, para no pasar al backend lo que él igual rechazaría.
 */
export function endpointDePushValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000 || endpoint !== endpoint.trim()) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  if (url.pathname.replace(/\//g, "") === "") return false;
  const host = url.hostname.toLowerCase();
  return HOSTS_EXACTOS.has(host) || HOSTS_SUFIJOS.some((s) => host.endsWith(s));
}

export interface SuscripcionVuelo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** La suscripción como la manda el navegador (`toJSON()`), o `null` si no sirve. Sólo lo que se guarda. */
export function leerSuscripcionVuelo(j: unknown): SuscripcionVuelo | null {
  const d = j as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const clave = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_=-]{1,200}$/.test(v);
  if (!d || !endpointDePushValido(d.endpoint) || !clave(d.keys?.p256dh) || !clave(d.keys?.auth)) return null;
  return { endpoint: d.endpoint, keys: { p256dh: d.keys.p256dh, auth: d.keys.auth } };
}

/** Los textos de cada estado. En el iPhone sin instalar, cómo se hace. */
export const TEXTOS_AVISOS_VUELO: Record<Exclude<EstadoAvisos, "sin-soporte">, { titulo: string; detalle: string }> = {
  apagados: {
    titulo: "Avisarme cuando despegue y cuando aterrice",
    detalle: "Te llega una notificación a este dispositivo, aunque cierres esta página. Sin cuenta ni datos tuyos.",
  },
  prendidos: {
    titulo: "Te avisamos cuando despegue y aterrice",
    detalle: "Llega a este dispositivo, aunque cierres la página. Se apaga solo cuando termina el vuelo.",
  },
  bloqueados: {
    titulo: "Las notificaciones están bloqueadas",
    detalle: "Para recibir el aviso, permitilas para este sitio en la configuración del navegador y volvé a esta página.",
  },
  "instalar-app": {
    titulo: "Avisos en el iPhone",
    detalle: "El iPhone sólo avisa desde una página agregada a la pantalla de inicio: en Safari tocá Compartir, después “Agregar a inicio”, y abrí el link desde ahí.",
  },
};

import { avanceSobreRuta, estadoMostrado, horaArgentinaConDia, llegadaEstimada, normalizar } from "@/lib/seguimiento-calculos";
import { tokenValido, type SeguimientoPublico } from "@/lib/seguimiento";
import { estadoDeAvisos, type EstadoAvisos } from "@/lib/push";

/**
 * Vector Tracker (tracker.vectoraero.ar, migración 056 del backend): lo puro de la lista de vuelos de
 * quien sigue. El backend manda, de cada vuelo **que el piloto le asignó**, lo mismo que ve el link
 * público (`vista_publica`) más `token` y `piloto` (nombre de pila y @).
 *
 * Acá se arma lo que dibuja la pantalla, **ya con los textos escritos** y las horas en hora argentina
 * (invariante 1: el server escribe, el navegador no formatea fechas). El lenguaje es el de un familiar
 * que no es piloto: "En el aire", "Todavía no salió", "Aterrizó"; nada de jerga sin explicar.
 */

export interface PilotoTracker {
  nombre: string;
  handle: string | null;
}

export type VueloDelBackend = SeguimientoPublico & { token: string; piloto: PilotoTracker };

/** Cómo se agrupa en la pantalla: lo que está pasando, lo que viene y lo que terminó. */
export type GrupoDeVuelo = "aire" | "proximo" | "termino";

export interface TarjetaDeVuelo {
  token: string;
  piloto: string;
  handle: string | null;
  /** "SADM → SAZS" (por código o nombre), o "" si no hay ruta. */
  trayecto: string;
  grupo: GrupoDeVuelo;
  /** Lo que se está haciendo, en palabras simples. */
  titulo: string;
  /** Una línea con lo más útil: hora de salida, llegada estimada o cuándo terminó. */
  detalle: string;
  /** La posición del avión, para el mapa de todos a la vez (sólo si está en el aire). */
  posicion: { lat: number; lon: number; rumbo: number | null } | null;
  /** La ruta prevista, [lat, lon][]. */
  ruta: [number, number][];
}

const FILTRAR = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";

/** De la respuesta de `GET /tracker/vuelos` a los vuelos que se pueden dibujar; lo que no tiene la forma se descarta. */
export function vuelosDeRespuesta(json: unknown): VueloDelBackend[] {
  if (!Array.isArray(json)) return [];
  const salida: VueloDelBackend[] = [];
  for (const v of json) {
    if (!FILTRAR(v) || typeof v.token !== "string" || !tokenValido(v.token) || typeof v.estado !== "string" || typeof v.ahora !== "string") continue;
    const p = FILTRAR(v.piloto) ? v.piloto : {};
    salida.push({
      ...normalizar(v as unknown as SeguimientoPublico),
      token: v.token,
      piloto: { nombre: typeof p.nombre === "string" && p.nombre ? p.nombre : typeof v.nombre === "string" ? v.nombre : "Un piloto", handle: typeof p.handle === "string" ? p.handle : null },
    });
  }
  return salida;
}

/** "SADM → SAZS" de los extremos de la ruta. */
export function trayectoDe(puntos: SeguimientoPublico["puntos"]): string {
  if (puntos.length === 0) return "";
  const nombre = (p: SeguimientoPublico["puntos"][number]) => p[2] || p[3] || "";
  const o = nombre(puntos[0]);
  const d = puntos.length > 1 ? nombre(puntos[puntos.length - 1]) : "";
  return o && d ? `${o} → ${d}` : o || d;
}

/** La tarjeta de un vuelo, con todo escrito. `ahora` es la hora del servidor al contestar (la del vuelo). */
export function tarjetaDeVuelo(v: VueloDelBackend): TarjetaDeVuelo {
  const ahora = v.ahora;
  const estado = estadoMostrado(v, ahora);
  const u = v.ultima;
  const ruta = v.puntos.map((p) => [p[0], p[1]] as [number, number]);
  let grupo: GrupoDeVuelo;
  let titulo: string;
  let detalle = "";

  switch (estado.clave) {
    case "volando":
    case "en_seguimiento": {
      grupo = "aire";
      titulo = "En el aire";
      const avance = u ? avanceSobreRuta(v.puntos, u) : null;
      const llegada = llegadaEstimada({ faltaNm: avance?.faltaNm ?? null, gsKt: u?.gs_kt ?? null, horaUltima: u?.hora ?? null, ahora });
      const h = horaArgentinaConDia(llegada, ahora);
      detalle = h ? `Llega aproximadamente a las ${h}` : "Todavía no se puede estimar la llegada.";
      break;
    }
    case "en_tierra":
      grupo = "aire";
      titulo = "En tierra";
      detalle = "El avión está detenido o rodando; todavía no despegó o ya aterrizó.";
      break;
    case "sin_datos":
      grupo = "aire";
      titulo = "Sin señal por ahora";
      detalle = "No llegó una posición nueva. Es normal un rato; aparece sola cuando vuelve.";
      break;
    case "antes_de_salir":
    case "esperando": {
      grupo = "proximo";
      titulo = estado.clave === "esperando" ? "Esperando la primera posición" : "Todavía no salió";
      const h = horaArgentinaConDia(v.salida_prevista ?? null, ahora);
      detalle = h ? `Sale a las ${h}` : "";
      break;
    }
    case "aterrizo":
      grupo = "termino";
      titulo = "Aterrizó";
      detalle = "El vuelo terminó.";
      break;
    default:
      grupo = "termino";
      titulo = "El vuelo terminó";
      detalle = "";
  }

  const enAire = grupo === "aire" && estado.clave !== "en_tierra";
  return {
    token: v.token,
    piloto: v.piloto.nombre,
    handle: v.piloto.handle,
    trayecto: trayectoDe(v.puntos),
    grupo,
    titulo,
    detalle,
    posicion: enAire && u ? { lat: u.lat, lon: u.lon, rumbo: u.track } : null,
    ruta,
  };
}

/** Las tarjetas de la lista, ya agrupadas en el orden de la pantalla (en el aire, lo que viene, lo que terminó). */
export function tarjetasDeVuelos(vuelos: VueloDelBackend[]): TarjetaDeVuelo[] {
  const orden: Record<GrupoDeVuelo, number> = { aire: 0, proximo: 1, termino: 2 };
  return vuelos
    .map(tarjetaDeVuelo)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => orden[a.t.grupo] - orden[b.t.grupo] || a.i - b.i)
    .map((x) => x.t);
}

export interface PilotoSeguido {
  nombre: string;
  handle: string | null;
  activo: boolean;
}

/** De `GET /tracker/pilotos`; lo que no tiene la forma se descarta. */
export function pilotosDeRespuesta(json: unknown): PilotoSeguido[] {
  if (!Array.isArray(json)) return [];
  return json.filter(FILTRAR).map((p) => ({ nombre: typeof p.nombre === "string" && p.nombre ? p.nombre : "Un piloto", handle: typeof p.handle === "string" ? p.handle : null, activo: p.activo === true }));
}

/** "Seguís a Federico (@fede)": el nombre con el @ si tiene. */
export function nombreConHandle(p: { nombre: string; handle: string | null }): string {
  return p.handle ? `${p.nombre} (@${p.handle})` : p.nombre;
}

/** Cuántos están en el aire, para el título de la pantalla: "1 vuelo en el aire". */
export function resumenDeLista(t: TarjetaDeVuelo[]): string {
  const aire = t.filter((x) => x.grupo === "aire").length;
  const prox = t.filter((x) => x.grupo === "proximo").length;
  if (aire > 0) return aire === 1 ? "1 vuelo en el aire" : `${aire} vuelos en el aire`;
  if (prox > 0) return prox === 1 ? "1 vuelo por salir" : `${prox} vuelos por salir`;
  return t.length > 0 ? "Sin vuelos en el aire" : "Sin vuelos por ahora";
}

/** Cada cuánto la lista vuelve a preguntar mientras está a la vista. */
export const CADA_ACTUALIZAR_MS = 30_000;

/** A dónde vuelve quien entra con Google (sólo rutas del tracker, nunca otra cosa). */
export function volverSeguroTracker(volver: string | null | undefined): string | null {
  if (!volver) return null;
  let v: string;
  try {
    v = decodeURIComponent(volver);
  } catch {
    return null;
  }
  if (v.includes("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return null;
  return /^\/(?:invitacion|vuelo)\/[A-Za-z0-9_-]{32,64}$/.test(v) ? v : null;
}

/** Dónde el tracker deja a dónde volver mientras la persona pasa por Google. */
export const CLAVE_VOLVER_TRACKER = "vector-tracker-volver";

/** Dónde este navegador recuerda que pidió los avisos del tracker (el `endpoint` con que los pidió). */
export const CLAVE_AVISOS_TRACKER = "vector-tracker-avisos";

/**
 * Qué se le ofrece a quien sigue. Es por **cuenta y dispositivo**, no por vuelo: prendidos es que este
 * navegador los pidió, tiene permiso y tiene suscripción (puede estar suscripto a otra cosa de Vector).
 */
export function estadoDeAvisosTracker(e: {
  soportaPush: boolean;
  esIOS: boolean;
  instalada: boolean;
  permiso: "default" | "granted" | "denied";
  suscripto: boolean;
  pidioAvisos: boolean;
}): EstadoAvisos {
  return estadoDeAvisos({ ...e, suscripto: e.suscripto && e.pidioAvisos });
}

export const TEXTOS_AVISOS_TRACKER: Record<Exclude<EstadoAvisos, "sin-soporte">, { titulo: string; detalle: string }> = {
  apagados: {
    titulo: "Avisarme cuando despegue y aterrice",
    detalle: "Te llega una notificación a este dispositivo cuando un piloto te comparte un vuelo, cuando despega y cuando aterriza, aunque cierres esta página.",
  },
  prendidos: {
    titulo: "Te avisamos cuando despegue y aterrice",
    detalle: "Llega a este dispositivo, aunque cierres la página. Lo podés apagar cuando quieras.",
  },
  bloqueados: {
    titulo: "Las notificaciones están bloqueadas",
    detalle: "Para recibir los avisos, permitilas para este sitio en la configuración del navegador y volvé a esta página.",
  },
  "instalar-app": {
    titulo: "Avisos en el iPhone",
    detalle: "El iPhone sólo avisa desde una página agregada a la pantalla de inicio: en Safari tocá Compartir, después “Agregar a inicio”, y abrí Vector Tracker desde ahí.",
  },
};

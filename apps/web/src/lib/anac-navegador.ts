import { CACHE_METEO, HEADER_CAPTURA, capturaVigente, topeMeteo } from "./pwa";
import type { FichaAnac } from "./ficha-anac";

/**
 * La ficha de MADHEL y los NOTAM de un aeródromo, **preguntándole el navegador del piloto
 * a ANAC**. Sólo navegador.
 *
 * ## Por qué desde el navegador
 *
 * ANAC bloquea las IPs que le hacen pedidos desde nuestros servidores: el VPS y DefeServer
 * desde el 2026-10-28 (el CAD), oraclex64 a los 45 minutos de usarla como proxy, el
 * 2026-11-02. No depende de cuántos pedidos sean, y esquivar su protección contra bots se
 * descartó. Desde el navegador de un piloto, con su IP, contesta. MADHEL y el servicio de
 * NOTAM aceptan pedidos de cualquier origen (`Access-Control-Allow-Origin: *`), así que no
 * hace falta extensión, como sí para el CAD.
 *
 * ## El camino
 *
 * 1. El navegador le pide a ANAC la ficha y los NOTAM, a la vez y con tope.
 * 2. `POST /api/notams` los completa con el AIP (que vive en el disco del servidor) y
 *    devuelve lo mismo que siempre devolvió el GET.
 * 3. Se guarda en la cache del service worker bajo la URL del GET, con la fecha: así, sin
 *    señal, se sirve como antes (`RUTAS_METEO`, 12 h).
 *
 * Si el navegador no llega a ANAC (sin señal, o ANAC caído de verdad), se usa lo guardado
 * si es reciente, y si no, "no se pudo consultar" enseguida: **no** se le pregunta al
 * servidor, que está bloqueado y sólo agregaría 6 s de espera.
 */

/** Lo que se espera a ANAC desde el navegador. Por el teléfono contesta en menos de 1 s. */
export const ESPERA_NAVEGADOR_MS = 6_000;

const URL_MADHEL = (indicador: string) => `https://datos.anac.gob.ar/madhel/api/v2/airports/${encodeURIComponent(indicador)}/`;
const URL_NOTAM = "https://ais.anac.gob.ar/notam/json";

/** Lo que contestó ANAC, tal cual, o `null` si no contestó. Nunca tira. */
async function preguntar(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_NAVEGADOR_MS);
  const alCortar = () => corte.abort();
  signal?.addEventListener("abort", alCortar);
  try {
    const res = await fetch(url, { ...init, signal: corte.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener("abort", alCortar);
  }
}

/** Lo que el navegador le trae a ANAC para un aeródromo (designador ANAC: "FDO", "MOR"). */
export async function crudoDeAnac(indicador: string, signal?: AbortSignal): Promise<{ madhel: unknown; notams: unknown }> {
  const [madhel, notams] = await Promise.all([
    preguntar(URL_MADHEL(indicador), { method: "GET" }, signal),
    preguntar(
      URL_NOTAM,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
        body: `indicador=${encodeURIComponent(indicador)}`,
      },
      signal,
    ),
  ]);
  return { madhel, notams };
}

const urlDelGet = (icao: string) => new URL(`/api/notams?icao=${encodeURIComponent(icao)}`, window.location.origin).toString();

async function guardarParaSinSenal(icao: string, ficha: unknown) {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(CACHE_METEO);
    await cache.put(
      urlDelGet(icao),
      new Response(JSON.stringify(ficha), {
        headers: { "Content-Type": "application/json", [HEADER_CAPTURA]: new Date().toISOString() },
      }),
    );
  } catch {
    // Sin cache (modo privado, sin espacio): la ficha igual se muestra.
  }
}

async function guardadaReciente(icao: string): Promise<FichaAnac | null> {
  try {
    if (!("caches" in window)) return null;
    const guardada = await (await caches.open(CACHE_METEO)).match(urlDelGet(icao));
    if (!guardada || !capturaVigente(guardada.headers.get(HEADER_CAPTURA), topeMeteo("/api/notams") ?? 0, new Date())) return null;
    return (await guardada.json()) as FichaAnac;
  } catch {
    return null;
  }
}

/** El designador ANAC ("SADF" → "FDO"), del directorio: MADHEL y los NOTAM se piden por él. */
async function designador(icao: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`/api/airports/search?icao=${encodeURIComponent(icao)}`, { signal });
    const aeropuerto = res.ok ? await res.json() : null;
    return typeof aeropuerto?.local === "string" && aeropuerto.local ? aeropuerto.local : icao;
  } catch {
    return icao;
  }
}

/**
 * La ficha de un aeródromo con lo que dice ANAC ahora: la misma forma que devuelve
 * `/api/notams` (`FichaAnac`). `indicador` es el designador ANAC si ya se sabe
 * (`AirportRef.local`); si no, se busca en el directorio.
 */
export async function fichaDesdeElNavegador(icao: string, indicador?: string, signal?: AbortSignal): Promise<FichaAnac> {
  const crudo = await crudoDeAnac(indicador || (await designador(icao, signal)), signal);

  if (crudo.madhel === null && crudo.notams === null) {
    const guardada = await guardadaReciente(icao);
    if (guardada) return guardada;
  }

  const res = await fetch("/api/notams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icao, ...crudo }),
    signal,
  });
  if (!res.ok) throw new Error(`notams ${res.status}`);
  const ficha = (await res.json()) as FichaAnac;
  // Sólo lo que trajo algo: "no se pudo consultar" no pisa una ficha buena guardada.
  if (crudo.madhel !== null || crudo.notams !== null) void guardarParaSinSenal(icao, ficha);
  return ficha;
}

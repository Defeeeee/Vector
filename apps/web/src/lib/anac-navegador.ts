import { CACHE_METEO, HEADER_CAPTURA, capturaVigente, topeMeteo } from "./pwa";
import type { FichaAnac } from "./ficha-anac";
import { VIGENCIA_MADHEL_MIN, VIGENCIA_NOTAM_MIN, hayQuePreguntar } from "./anac-vigencia";

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
 *    señal, se sirve la última copia (`RUTAS_METEO`, hasta 48 h).
 *
 * Si el navegador no llega a ANAC (sin señal, o ANAC caído de verdad), se usa **lo último que
 * se guardó, de hasta 48 h, y la ficha lo dice** (`notamsGuardados`: la pantalla pone la franja
 * con la edad, 3.46.0); sin copia, "no se pudo consultar" enseguida: **no** se le pregunta al
 * servidor, que está bloqueado y sólo agregaría 6 s de espera.
 *
 * **Se le pregunta lo menos posible** (`lib/anac-vigencia.ts`): lo que ya trajo se reusa
 * (MADHEL 24 h, NOTAM 15 min) y un mismo aeródromo pedido dos veces a la vez sale en un solo
 * pedido. ANAC bloquea IPs, y un piloto bloqueado se queda también sin el CAD.
 */

/** Lo que se espera a ANAC desde el navegador. Por el teléfono contesta en menos de 1 s. */
export const ESPERA_NAVEGADOR_MS = 6_000;

const URL_MADHEL = (indicador: string) => `https://datos.anac.gob.ar/madhel/api/v2/airports/${encodeURIComponent(indicador)}/`;
const URL_NOTAM = "https://ais.anac.gob.ar/notam/json";

type Tipo = "madhel" | "notams";

/** Lo que el navegador tiene de ANAC para un aeródromo: la respuesta tal cual, o `null`. */
interface Crudo {
  valor: unknown;
  capturadoEn: string | null;
  /** Es la última copia guardada porque ANAC no contestó (no la que alcanzaba por vigente). */
  deRespaldo?: boolean;
}

/** Lo que contestó ANAC, tal cual, o `null` si no contestó. Nunca tira. */
async function preguntar(url: string, init: RequestInit): Promise<unknown> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_NAVEGADOR_MS);
  try {
    const res = await fetch(url, { ...init, signal: corte.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

function preguntarAnac(tipo: Tipo, indicador: string): Promise<unknown> {
  return tipo === "madhel"
    ? preguntar(URL_MADHEL(indicador), { method: "GET" })
    : preguntar(URL_NOTAM, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
        body: `indicador=${encodeURIComponent(indicador)}`,
      });
}

/*
  Lo crudo de ANAC se guarda aparte, por aeródromo, en la misma cache del service worker
  (`vector-meteo`, que se borra al salir de la cuenta). Las claves no son rutas reales:
  nadie las pide por la red.
*/
const claveCruda = (tipo: Tipo, indicador: string) =>
  new URL(`/__anac/${tipo}/${encodeURIComponent(indicador)}`, window.location.origin).toString();

async function leerCrudo(tipo: Tipo, indicador: string): Promise<Crudo | null> {
  try {
    if (!("caches" in window)) return null;
    const guardado = await (await caches.open(CACHE_METEO)).match(claveCruda(tipo, indicador));
    return guardado ? { valor: await guardado.json(), capturadoEn: guardado.headers.get(HEADER_CAPTURA) } : null;
  } catch {
    return null;
  }
}

async function guardarCrudo(tipo: Tipo, indicador: string, crudo: Crudo) {
  try {
    if (!("caches" in window) || !crudo.capturadoEn) return;
    await (await caches.open(CACHE_METEO)).put(
      claveCruda(tipo, indicador),
      new Response(JSON.stringify(crudo.valor), {
        headers: { "Content-Type": "application/json", [HEADER_CAPTURA]: crudo.capturadoEn },
      }),
    );
  } catch {
    // Sin cache (modo privado, sin espacio): la próxima vez se pregunta de nuevo.
  }
}

/** Un mismo aeródromo pedido dos veces a la vez (la ficha y el briefing) sale en un pedido. */
const enCurso = new Map<string, Promise<unknown>>();

/**
 * Lo que dice ANAC de un aeródromo, **preguntando sólo si lo guardado venció**
 * (`lib/anac-vigencia.ts`). Si ANAC no contesta, sirve lo último guardado de hasta 48 h,
 * marcado `deRespaldo` (la pantalla lo dice y dice de cuándo es), y si no hay, `null`: "no se
 * pudo consultar".
 */
async function obtener(tipo: Tipo, indicador: string, vigenciaMin: number): Promise<Crudo> {
  const guardado = await leerCrudo(tipo, indicador);
  if (guardado && !hayQuePreguntar(guardado.capturadoEn, vigenciaMin, new Date())) return guardado;

  const clave = `${tipo}:${indicador}`;
  let pedido = enCurso.get(clave);
  if (!pedido) {
    pedido = preguntarAnac(tipo, indicador).finally(() => enCurso.delete(clave));
    enCurso.set(clave, pedido);
  }
  const valor = await pedido;
  if (valor !== null) {
    const nuevo = { valor, capturadoEn: new Date().toISOString() };
    void guardarCrudo(tipo, indicador, nuevo);
    return nuevo;
  }
  const respaldoMin = topeMeteo("/api/notams") ?? 0;
  return guardado && !hayQuePreguntar(guardado.capturadoEn, respaldoMin, new Date())
    ? { ...guardado, deRespaldo: true }
    : { valor: null, capturadoEn: null };
}

const urlDelGet = (icao: string) => new URL(`/api/notams?icao=${encodeURIComponent(icao)}`, window.location.origin).toString();

async function guardarParaSinSenal(icao: string, ficha: FichaAnac) {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(CACHE_METEO);
    await cache.put(
      urlDelGet(icao),
      new Response(JSON.stringify(ficha), {
        // La fecha de los NOTAM de adentro, no la de hoy: si eran de la última copia (ANAC no contestó),
        // guardarla "ahora" le daría otras 48 h de vida a un dato que ya venía viejo.
        headers: { "Content-Type": "application/json", [HEADER_CAPTURA]: fechaDeCaptura(ficha) },
      }),
    );
  } catch {
    // Sin cache (modo privado, sin espacio): la ficha igual se muestra.
  }
}

function fechaDeCaptura(ficha: FichaAnac): string {
  const t = ficha.notamsCapturadosEn ? Date.parse(ficha.notamsCapturadosEn) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

/** La última ficha armada (de hasta 48 h), o `null`. Sin fecha de captura no se usa. */
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

/**
 * La ficha armada con el paquete de datos del teléfono (pistas, frecuencias, canal de llamada,
 * combustible, cartas; sin NOTAM, teléfonos ni normas), o `null`. **Sólo se acepta lo que marca
 * `fichaDelPaquete`**: la respuesta real de un servidor sin esa ruta no se confunde con una ficha.
 */
async function fichaDelPaquete(icao: string, signal?: AbortSignal): Promise<FichaAnac | null> {
  try {
    const res = await fetch(`/api/airports/ficha?icao=${encodeURIComponent(icao)}`, { signal });
    if (!res.ok) return null;
    const ficha = (await res.json()) as FichaAnac | null;
    return ficha?.fichaDelPaquete ? ficha : null;
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
 * ¿El servidor tiene los NOTAM del país al día (`/api/notams/estado`)? Si los tiene, el
 * navegador no le pregunta los NOTAM a ANAC: la descarga es la fuente principal. Se
 * recuerda 5 minutos.
 */
let estadoDescarga: { notams: boolean; madhel: boolean; hasta: number } | null = null;

async function descargasAlDia(signal?: AbortSignal): Promise<{ notams: boolean; madhel: boolean }> {
  if (estadoDescarga && Date.now() < estadoDescarga.hasta) return estadoDescarga;
  try {
    const res = await fetch("/api/notams/estado", { signal });
    const e = res.ok ? await res.json() : null;
    estadoDescarga = { notams: Boolean(e?.alDia), madhel: Boolean(e?.madhelAlDia), hasta: Date.now() + 5 * 60000 };
    return estadoDescarga;
  } catch {
    return { notams: false, madhel: false };
  }
}

/**
 * La ficha de un aeródromo con lo que dice ANAC: la misma forma que devuelve `/api/notams`
 * (`FichaAnac`), más `notamsCapturadosEn`, para que la pantalla diga de cuándo son.
 * `indicador` es el designador ANAC si ya se sabe (`AirportRef.local`); si no, se busca.
 */
export async function fichaDesdeElNavegador(icao: string, indicador?: string, signal?: AbortSignal): Promise<FichaAnac> {
  const ind = indicador || (await designador(icao, signal));
  const sinPreguntar: Crudo = { valor: null, capturadoEn: null };
  // Lo que el servidor tiene descargado y al día, no se le pregunta a ANAC: lo pone el servidor.
  const alDia = await descargasAlDia(signal);
  const [madhel, notams] = await Promise.all([
    alDia.madhel ? sinPreguntar : obtener("madhel", ind, VIGENCIA_MADHEL_MIN),
    alDia.notams ? sinPreguntar : obtener("notams", ind, VIGENCIA_NOTAM_MIN),
  ]);

  try {
    const res = await fetch("/api/notams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icao, madhel: madhel.valor, notams: notams.valor }),
      signal,
    });
    if (!res.ok) throw new Error(`notams ${res.status}`);
    const compuesta = (await res.json()) as FichaAnac;
    const ficha: FichaAnac = {
      ...compuesta,
      notamsCapturadosEn: compuesta.notamsCapturadosEn ?? notams.capturadoEn,
      // Hay red pero ANAC no contestó: son los NOTAM de la última vez. Se guarda **sin** la marca (la marca es de este momento).
      notamsGuardados: notams.deRespaldo && notams.valor !== null ? "sin-anac" : null,
    };
    // Sólo lo que trajo algo: "no se pudo consultar" no pisa una ficha buena guardada.
    if (madhel.valor !== null || notams.valor !== null) void guardarParaSinSenal(icao, { ...ficha, notamsGuardados: null });
    return ficha;
  } catch (err) {
    // Sin señal no se puede componer: la última ficha armada, si es de las últimas 48 h, y se dice.
    const guardada = await guardadaReciente(icao);
    if (guardada) return { ...guardada, notamsGuardados: "sin-senal" };
    // Nunca se abrió esa ficha (o hace más de 48 h): la que arma el paquete de datos guardado, **sin
    // NOTAM** (`lib/ficha-paquete.ts`). Sólo la contesta el service worker; con señal el pedido da 404.
    const delPaquete = await fichaDelPaquete(icao, signal);
    if (delPaquete) return delPaquete;
    throw err;
  }
}

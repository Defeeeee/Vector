import { CACHE_PAGINAS, HEADER_CAPTURA, MENSAJES, PREFIJO_SHELL, claveDeLoServido } from "./pwa";
import {
  CLAVE_ESTADO_APP,
  CLAVE_ESTADO_PANTALLAS,
  type Conexion,
  type EstadoApp,
  type EstadoPantallas,
} from "./sin-senal";

/**
 * Lo que la página le pregunta y le pide al service worker para "Vector sin señal" (3.44.0).
 * **Sólo en el navegador** (usa `caches` y `navigator`); lo que se decide está en `sin-senal.ts`.
 *
 * Lo guardado se lee directo del Cache API, que está disponible en `window`, y no preguntándole al
 * worker: el worker se duerme entre eventos y "no contestó" no es "no hay nada guardado" (es la misma
 * razón de `VistoPorUltimaVez`).
 */

export function conexionActual(): Conexion {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return { online: navigator.onLine, saveData: c?.saveData, effectiveType: c?.effectiveType };
}

export interface ResultadoGuardado {
  motivo?: string;
  hizo?: boolean;
  app?: EstadoApp | null;
  pantallas?: number;
  error?: boolean;
}

/**
 * Le pide al service worker que guarde (o complete) la app, los datos y las pantallas. Contesta
 * cuando terminó, o `null` si no hay service worker o no contestó a tiempo (una pasada completa en
 * una conexión lenta puede tardar minutos: el tope es generoso y igual no corta el trabajo).
 */
export async function pedirGuardado(o: { usuario: string | null; forzar: boolean }, esperaMs = 5 * 60_000): Promise<ResultadoGuardado | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const registro = await navigator.serviceWorker.ready;
    const worker = registro.active;
    if (!worker) return null;
    return await new Promise<ResultadoGuardado | null>((listo) => {
      const canal = new MessageChannel();
      const reloj = setTimeout(() => listo(null), esperaMs);
      canal.port1.onmessage = (e) => {
        clearTimeout(reloj);
        listo(e.data as ResultadoGuardado);
      };
      worker.postMessage({ tipo: MENSAJES.guardarParaVolar, usuario: o.usuario, forzar: o.forzar, conexion: conexionActual() }, [canal.port2]);
    });
  } catch {
    return null;
  }
}

async function leerJson<T>(cache: Cache, clave: string): Promise<T | null> {
  try {
    const r = await cache.match(new URL(clave, location.origin).toString());
    return r ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface Guardado {
  app: EstadoApp | null;
  /** Pantallas distintas del dashboard que hay guardadas. */
  pantallas: number;
  precalentadoEn: string | null;
}

/** Lo que hay guardado ahora en este teléfono. Nunca tira: sin Cache API es "nada". */
export async function leerGuardado(): Promise<Guardado> {
  const vacio: Guardado = { app: null, pantallas: 0, precalentadoEn: null };
  try {
    if (typeof caches === "undefined") return vacio;

    let app: EstadoApp | null = null;
    for (const nombre of (await caches.keys()).filter((n) => n.startsWith(PREFIJO_SHELL))) {
      const e = await leerJson<EstadoApp>(await caches.open(nombre), CLAVE_ESTADO_APP);
      if (e && (!app || (e.guardadoEn ?? "") > (app.guardadoEn ?? ""))) app = e;
    }

    const paginas = await caches.open(CACHE_PAGINAS);
    const estado = await leerJson<EstadoPantallas>(paginas, CLAVE_ESTADO_PANTALLAS);
    const rutas = new Set<string>();
    for (const pedido of await paginas.keys()) {
      const { pathname } = new URL(pedido.url);
      if (/^\/dashboard(\/|$)/.test(pathname)) rutas.add(pathname.replace(/\/+$/, "") || "/dashboard");
    }
    return { app, pantallas: rutas.size, precalentadoEn: estado?.precalentadoEn ?? null };
  } catch {
    return vacio;
  }
}

/**
 * De cuándo es la pantalla que se está mirando, si se sirvió de lo guardado: el sello que el service
 * worker escribió antes de contestar (`claveDeLoServido`). `null` si no se sabe.
 */
export async function guardadoDeEstaPantalla(pathname: string): Promise<string | null> {
  try {
    if (typeof caches === "undefined") return null;
    const paginas = await caches.open(CACHE_PAGINAS);
    const marca = await paginas.match(claveDeLoServido(pathname));
    return marca?.headers.get(HEADER_CAPTURA) ?? null;
  } catch {
    return null;
  }
}

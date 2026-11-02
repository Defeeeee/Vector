import { ProxyAgent, fetch as fetchUndici } from "undici";

/**
 * Pedirle algo a ANAC (MADHEL en `datos.anac.gob.ar`, los NOTAM en `ais.anac.gob.ar`) desde
 * el servidor. Sólo servidor.
 *
 * **ANAC no acepta conexiones del VPS.** Bloqueó su IP para el CAD el 2026-10-28, y el
 * 2026-11-02 tampoco contestaban MADHEL ni los NOTAM: las fichas salían sin datos y los
 * NOTAM, "no se pudo consultar". Por eso, con `ANAC_PROXY` en el `.env`, sale por el proxy
 * CONNECT de oraclex64 (`infra/proxy-anac/`, sólo Tailscale, sólo esos dos hosts). Sin la
 * variable —en desarrollo y en el CI— es el `fetch` de siempre.
 *
 * Por el proxy va con el `fetch` de `undici` y no con el de Node. El `ProxyAgent` tiene que
 * ser del mismo paquete que el `fetch` que lo usa: el de Node trae su propio undici, de otra
 * versión. El costo es que ese `fetch` no pasa por la cache de datos de Next, así que
 * `next.revalidate` se respeta acá, en memoria. Además cuida la IP de oraclex64: si ANAC
 * bloquea por exceso de pedidos, como hizo con el CAD, no hay otra.
 */
type Opciones = RequestInit & { next?: { revalidate?: number } };

interface Guardado {
  expira: number;
  status: number;
  tipo: string;
  cuerpo: string;
}

const MAX_GUARDADOS = 500;
const guardados = new Map<string, Guardado>();
let agente: ProxyAgent | null = null;

function respuesta(g: Pick<Guardado, "status" | "tipo" | "cuerpo">): Response {
  return new Response(g.cuerpo, { status: g.status, headers: g.tipo ? { "content-type": g.tipo } : {} });
}

export async function fetchAnac(url: string, init: Opciones = {}): Promise<Response> {
  const proxy = process.env.ANAC_PROXY?.trim();
  if (!proxy) return fetch(url, init);

  const segundos = init.next?.revalidate ?? 0;
  const clave = segundos > 0 ? `${init.method ?? "GET"} ${url} ${typeof init.body === "string" ? init.body : ""}` : null;
  const guardado = clave ? guardados.get(clave) : undefined;
  if (guardado && guardado.expira > Date.now()) return respuesta(guardado);

  agente ??= new ProxyAgent(proxy);
  const { next: _next, cache: _cache, ...resto } = init;
  const res = await fetchUndici(url, { ...resto, dispatcher: agente } as Parameters<typeof fetchUndici>[1]);
  const nuevo = { status: res.status, tipo: res.headers.get("content-type") ?? "", cuerpo: await res.text() };

  if (clave && res.ok) {
    guardados.delete(clave);
    guardados.set(clave, { ...nuevo, expira: Date.now() + segundos * 1000 });
    if (guardados.size > MAX_GUARDADOS) guardados.delete(guardados.keys().next().value as string);
  }
  return respuesta(nuevo);
}

/** Para los tests. */
export function olvidarGuardadosAnac() {
  guardados.clear();
  agente = null;
}

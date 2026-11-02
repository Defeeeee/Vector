/**
 * El lado del CAD del puente con Vector (2.36.0): lo usan el marcador (`enlace.ts`) y la
 * extensión (`extension-cad.ts`). Vector arma el panel en su pestaña y le pide al CAD sólo lo
 * que necesita, de a un pedido; acá se hace cada pedido con la sesión del piloto en esta
 * pestaña, como lo haría el formulario del CAD.
 *
 * **Lista blanca:** las lecturas del panel y "Crear". Nada de la declaración jurada: ésa la hace
 * el piloto en el CAD. Es la misma lista que tenía el backend (`RUTAS_GET` de `cad_anac.py`).
 */

export const API_CAD = "/foliadoweb/api/VueloTripulante/";

const LECTURAS = new Set([
  "GetPagedList",
  "Get",
  "GetFinalidadListItem",
  "GetAutoridadesListItem",
  "GetLugarAterrizajeListItem",
  "GetSimuladoresListItem",
  "GetModelosPorSimuladorListItem",
]);

export interface PedidoCad {
  tipo: "vector-cad:pedido";
  id: string;
  accion: "ping" | "leer" | "crear";
  ruta?: string;
  params?: Record<string, string>;
  vuelo?: Record<string, unknown>;
}

export interface RespuestaCad {
  tipo: "vector-cad:respuesta";
  id: string;
  ok: boolean;
  datos?: unknown;
  /** "sesion" si el CAD pide entrar de nuevo, "sin_cad" si no hay pestaña del CAD. */
  error?: string;
}

export function esPedido(d: unknown): d is PedidoCad {
  const p = d as PedidoCad;
  return !!p && p.tipo === "vector-cad:pedido" && typeof p.id === "string" && ["ping", "leer", "crear"].includes(p.accion);
}

/** Hace un pedido de Vector en esta pestaña del CAD. Nunca lanza: todo vuelve como respuesta. */
export async function atender(p: PedidoCad): Promise<RespuestaCad> {
  const r = (ok: boolean, extra: { datos?: unknown; error?: string } = {}): RespuestaCad => ({ tipo: "vector-cad:respuesta", id: p.id, ok, ...extra });
  try {
    if (p.accion === "ping") return r(true, { datos: { cad: location.origin } });

    if (p.accion === "leer") {
      if (!p.ruta || !LECTURAS.has(p.ruta)) return r(false, { error: "Ese pedido no está permitido." });
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(p.params ?? {})) if (typeof v === "string") q.set(k, v);
      const res = await fetch(`${API_CAD}${p.ruta}${q.size ? `?${q}` : ""}`, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.status === 401 || res.status === 403 || res.redirected) return r(false, { error: "sesion" });
      if (!res.ok) return r(false, { error: `El CAD contestó ${res.status}.` });
      try {
        return r(true, { datos: await res.json() });
      } catch {
        // Sin sesión, el CAD a veces contesta la página de login con 200.
        return r(false, { error: "sesion" });
      }
    }

    // "Crear": el vuelo ya viene armado y revisado por Vector (`armarVueloParaElCad`).
    if (!p.vuelo || typeof p.vuelo !== "object" || "ddjj" in p.vuelo) return r(false, { error: "El vuelo no tiene la forma esperada." });
    const res = await fetch(`${API_CAD}Create`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(p.vuelo),
    });
    if (res.status === 401 || res.status === 403) return r(false, { error: "sesion" });
    if (res.ok) return r(true, { datos: { aceptado: true, mensaje: "Cargado en el CAD" } });
    const c = (await res.json().catch(() => ({}))) as Record<string, string>;
    return r(true, { datos: { aceptado: false, mensaje: `El CAD no lo aceptó: ${c.message || c.exceptionMessage || `error ${res.status}`}` } });
  } catch (e) {
    return r(false, { error: e instanceof Error ? e.message : "El CAD no contestó." });
  }
}

/**
 * El aviso que queda en la pestaña del CAD: el panel está en Vector. `abrir`, si se pasa, es el
 * botón para abrir Vector (el marcador lo necesita cuando el navegador bloquea la ventana).
 */
export function mostrarAviso(texto: string, vector: string, abrir?: () => void): (texto: string) => void {
  let caja = document.getElementById("vector-cad-aviso");
  if (!caja) {
    caja = document.createElement("div");
    caja.id = "vector-cad-aviso";
    document.body.appendChild(caja);
  }
  const sombra = caja.shadowRoot ?? caja.attachShadow({ mode: "open" });
  sombra.innerHTML = `<style>
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; }
    .a { display: flex; align-items: center; gap: 12px; max-width: min(420px, calc(100vw - 40px)); padding: 12px 14px 12px 12px; border-radius: 18px;
      background: #18181b; color: #fff; box-shadow: 0 12px 32px rgba(0,0,0,.28); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .l { width: 30px; height: 30px; border-radius: 9px; background: #fff; display: grid; place-items: center; flex: none; }
    .t { flex: 1; } .t b { display: block; font-size: 14px; }
    a, button { flex: none; border: 0; border-radius: 999px; padding: 8px 12px; background: #fff; color: #18181b; font: 600 13px/1 inherit; cursor: pointer; text-decoration: none; }
  </style>
  <div class="a" role="status">
    <span class="l"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#18181b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/></svg></span>
    <span class="t"></span>
    ${abrir ? `<button type="button">Abrir Vector</button>` : `<a href="${vector}/dashboard/history/cad" target="_blank" rel="noopener">Ir a Vector</a>`}
  </div>`;
  const t = sombra.querySelector(".t") as HTMLElement;
  const poner = (x: string) => {
    t.innerHTML = x;
  };
  poner(texto);
  if (abrir) (sombra.querySelector("button") as HTMLButtonElement).onclick = abrir;
  return poner;
}

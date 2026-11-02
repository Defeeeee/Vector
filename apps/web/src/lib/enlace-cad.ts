/**
 * El lado de Vector del puente con el CAD (2.36.0): "Pasar al CAD" le pide al CAD lo que
 * necesita por la extensión "Vector → CAD" o por la pestaña del CAD que abrió esta con el
 * marcador. Del otro lado contesta `src/cad/enlace-comun.ts`, con la sesión del piloto.
 *
 * Sólo corre en el navegador.
 */
import type { PedidoCad, RespuestaCad } from "@/cad/enlace-comun";
import { estadoExtension } from "@/lib/extension-cad";

export type TransporteCad = "extension" | "marcador";

const CAD_ORIGEN = process.env.NEXT_PUBLIC_CAD_ORIGEN || "https://cad.anac.gob.ar";

/**
 * Por dónde se habla con el CAD, o `null`. El marcador gana: si esta pestaña la abrió el CAD,
 * es ésa la pestaña con la que el piloto quiere trabajar.
 */
export function transporteCad(): TransporteCad | null {
  if (typeof window === "undefined") return null;
  if (window.opener && new URLSearchParams(location.search).has("enlace")) return "marcador";
  // Las anteriores a la 1.1.0 no son un puente: la pantalla pide bajar la nueva (`ExtensionCad`).
  const e = estadoExtension(document.documentElement.dataset.vectorCadExtension);
  if (e === "vieja" || e === "al-dia") return "extension";
  return null;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; sinCad?: boolean };

let siguiente = 0;

function enviar(t: TransporteCad, p: Omit<PedidoCad, "tipo" | "id">, ms: number): Promise<RespuestaCad> {
  const id = `${Date.now().toString(36)}-${(siguiente++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const pedido: PedidoCad = { tipo: "vector-cad:pedido", id, ...p };
  return new Promise((resolver) => {
    const fin = (r: RespuestaCad) => {
      clearTimeout(reloj);
      window.removeEventListener("message", escuchar);
      resolver(r);
    };
    const escuchar = (e: MessageEvent) => {
      const d = e.data as RespuestaCad & { desde?: string };
      if (!d || d.tipo !== "vector-cad:respuesta" || d.id !== id) return;
      if (t === "marcador" ? e.origin !== CAD_ORIGEN || e.source !== window.opener : e.source !== window || d.desde !== "extension") return;
      fin(d);
    };
    const reloj = setTimeout(() => fin({ tipo: "vector-cad:respuesta", id, ok: false, error: "sin_cad" }), ms);
    window.addEventListener("message", escuchar);
    try {
      if (t === "marcador") {
        if (!window.opener || window.opener.closed) return fin({ tipo: "vector-cad:respuesta", id, ok: false, error: "sin_cad" });
        window.opener.postMessage(pedido, CAD_ORIGEN);
      } else window.postMessage(pedido, location.origin);
    } catch {
      fin({ tipo: "vector-cad:respuesta", id, ok: false, error: "sin_cad" });
    }
  });
}

function traducir<T>(r: RespuestaCad, t: TransporteCad): Resultado<T> {
  if (r.ok) return { ok: true, datos: r.datos as T };
  if (r.error === "sin_cad")
    return {
      ok: false,
      sinCad: true,
      error:
        t === "marcador"
          ? "Se cerró la pestaña del CAD. Abrí el CAD y tocá el marcador de nuevo."
          : 'Abrí el CAD en otra pestaña, entrá a "Registro horas vuelo" y volvé acá.',
    };
  if (r.error === "sesion") return { ok: false, sinCad: true, error: "Tu sesión del CAD se cerró. Entrá de nuevo al CAD y volvé acá." };
  return { ok: false, error: r.error || "El CAD no contestó." };
}

/** ¿Hay una pestaña del CAD del otro lado? */
export async function hayCad(t: TransporteCad): Promise<boolean> {
  return (await enviar(t, { accion: "ping" }, 3000)).ok;
}

/** Una lectura de la lista blanca, hecha en la pestaña del CAD. */
export async function leerDelCad<T>(t: TransporteCad, ruta: string, params: Record<string, string> = {}): Promise<Resultado<T>> {
  return traducir<T>(await enviar(t, { accion: "leer", ruta, params }, 60_000), t);
}

/** "Crear" del CAD con un vuelo ya armado por Vector (`armarVueloParaElCad`). */
export async function crearEnElCad(t: TransporteCad, vuelo: Record<string, unknown>): Promise<Resultado<{ aceptado: boolean; mensaje: string }>> {
  return traducir(await enviar(t, { accion: "crear", vuelo }, 60_000), t);
}

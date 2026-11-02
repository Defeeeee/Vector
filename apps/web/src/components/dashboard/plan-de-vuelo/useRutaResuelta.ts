"use client";

import { useEffect, useRef, useState } from "react";
import { nodosDeRuta, sugerirEetConocidos, tasDeVelocidad, type FormularioPlan, type NodoRuta, type Sugerencia } from "@/lib/formulario-plan";
import { distanciaNmPrecisa } from "@/lib/distance";

/**
 * La ruta escrita, buscada nodo por nodo en el directorio del planificador
 * (`/api/puntos`, que anda sin señal), para dibujarla y para sugerir la duración.
 */

export type EstadoNodo = "buscando" | "ubicado" | "sin-ubicar";

export interface NodoResuelto extends NodoRuta {
  estado: EstadoNodo;
  lat?: number;
  lon?: number;
  /** Cómo lo nombra el directorio: "VOR-DME Atalaya". */
  etiqueta?: string;
  /** Los puntos de una aerovía, de la entrada a la salida (sin la entrada). */
  tramo?: { lat: number; lon: number }[];
}

interface PuntoApi {
  lat: number;
  lon: number;
  label?: string;
  tramo?: { lat: number; lon: number }[];
}

export interface RutaResuelta {
  nodos: NodoResuelto[];
  sugerencia: Sugerencia | null;
  nota: string | null;
}

const distancia = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);

/** Busca un token en el directorio. `null` = no está. Cachea por token y vecinos. */
export async function buscarPunto(
  cache: Map<string, PuntoApi | null>,
  token: string,
  desde = "",
  hasta = ""
): Promise<PuntoApi | null> {
  const k = `${token}|${desde}|${hasta}`;
  if (cache.has(k)) return cache.get(k) ?? null;
  let p: PuntoApi | null = null;
  try {
    const res = await fetch(`/api/puntos?${new URLSearchParams({ q: token, desde, hasta })}`);
    const data = (await res.json()) as { punto: PuntoApi | null };
    p = data.punto && Number.isFinite(data.punto.lat) ? data.punto : null;
  } catch {
    p = null;
  }
  cache.set(k, p);
  return p;
}

export function useRutaResuelta(f: FormularioPlan, tasAvion: number | null): RutaResuelta & { cache: Map<string, PuntoApi | null> } {
  const cache = useRef(new Map<string, PuntoApi | null>());
  const [r, setR] = useState<RutaResuelta>(() => ({
    nodos: nodosDeRuta(f.ruta).map((n) => ({ ...n, estado: n.tipo === "desconocido" ? "sin-ubicar" : "buscando" })),
    sugerencia: null,
    nota: null,
  }));

  const clave = JSON.stringify([f.ruta, f.salida?.codigo, f.destino?.codigo, f.velocidad, f.sugerencias.eet?.ruta]);
  useEffect(() => {
    let vigente = true;
    const base = nodosDeRuta(f.ruta);
    // Lo ya ubicado se queda como está mientras se vuelve a buscar: si no, "Buscando…" cambia
    // el ancho de los nodos, la fila se reacomoda y todo lo de abajo salta.
    setR((prev) => ({
      ...prev,
      nodos: base.map((n) => {
        const antes = prev.nodos.find((v) => v.texto === n.texto && v.tipo === n.tipo && v.estado !== "buscando");
        return antes ?? { ...n, estado: n.tipo === "desconocido" ? "sin-ubicar" : "buscando" };
      }),
    }));

    const correr = async () => {
      // Los vecinos de una aerovía son los puntos de antes y de después.
      const vecino = (i: number, paso: -1 | 1) => {
        const n = base[i + paso];
        if (n && n.tipo === "punto") return n.token ?? "";
        return paso === -1 ? f.salida?.codigo ?? "" : f.destino?.codigo ?? "";
      };
      const nodos: NodoResuelto[] = await Promise.all(
        base.map(async (n, i): Promise<NodoResuelto> => {
          if (n.tipo === "desconocido" || !n.token) return { ...n, estado: "sin-ubicar" };
          const p =
            n.tipo === "aerovia"
              ? await buscarPunto(cache.current, n.token, vecino(i, -1), vecino(i, 1))
              : await buscarPunto(cache.current, n.token);
          if (!p) return { ...n, estado: "sin-ubicar" };
          return { ...n, estado: "ubicado", lat: p.lat, lon: p.lon, etiqueta: p.label, tramo: p.tramo };
        })
      );
      if (!vigente) return;

      // La sugerencia: la del planificador si la ruta no cambió (tiene el viento); si no, con lo ubicado.
      let sugerencia: Sugerencia | null = null;
      let nota: string | null = null;
      const delPlanificador = f.sugerencias.eet;
      const tas = tasDeVelocidad(f.velocidad) ?? tasAvion;
      if (delPlanificador && delPlanificador.ruta === f.ruta.trim().toUpperCase()) {
        sugerencia = delPlanificador;
      } else if (!f.salida || !f.destino || f.salida.lat === undefined || f.destino.lat === undefined) {
        nota = null;
      } else if (!tas) {
        nota = "Con la velocidad de la casilla 15 te sugiero la duración.";
      } else {
        const puntos: { lat: number; lon: number }[] = [{ lat: f.salida.lat, lon: f.salida.lon! }];
        const sinUbicar: string[] = [];
        for (const n of nodos) {
          if (n.estado !== "ubicado") {
            sinUbicar.push(n.texto);
            continue;
          }
          if (n.tipo === "aerovia") puntos.push(...(n.tramo ?? []));
          else puntos.push({ lat: n.lat!, lon: n.lon! });
        }
        puntos.push({ lat: f.destino.lat, lon: f.destino.lon! });
        sugerencia = sugerirEetConocidos(puntos, sinUbicar, tas, distancia);
        if (!sugerencia) {
          nota = sinUbicar.length
            ? `Vuelo local: la duración depende de lo que hagas en ${sinUbicar.join(" y ")}.`
            : "Vuelo local: la duración depende de lo que vayas a hacer.";
        }
      }
      setR({ nodos, sugerencia, nota });
    };
    const t = setTimeout(correr, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, tasAvion]);

  return { ...r, cache: cache.current };
}

/** La distancia de un tramo entre dos nodos dibujados, por la aerovía si la hay. */
export function distanciaTramo(
  desde: { lat?: number; lon?: number } | null,
  hasta: { lat?: number; lon?: number } | null,
  aerovia: NodoResuelto | null
): number | null {
  if (!desde || !hasta || desde.lat === undefined || hasta.lat === undefined) return null;
  const puntos = [{ lat: desde.lat, lon: desde.lon! }, ...(aerovia?.estado === "ubicado" ? aerovia.tramo ?? [] : []), { lat: hasta.lat, lon: hasta.lon! }];
  let nm = 0;
  for (let i = 1; i < puntos.length; i++) nm += distancia(puntos[i - 1], puntos[i]);
  return nm;
}

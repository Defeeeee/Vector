import { cache } from "react";
import { apiFetch } from "@/lib/api";
import type { Profile, ResumenSocial } from "@/types";

export interface ResumenSocialLeido extends ResumenSocial {
  /**
   * Si se pudo preguntar. **"No sé" no es "no hay"** (invariante 2): sin esto, un corte
   * de red le diría "elegí tu @" a un piloto que ya lo tiene.
   */
  disponible: boolean;
}

const VACIO: ResumenSocial = { handle: null, avatar_url: null, solicitudes_pendientes: 0, actividad_nueva: 0 };

/**
 * Si el piloto tiene @, su foto, y el punto rojo de Pilotos: solicitudes más actividad
 * nueva.
 *
 * Lo piden el layout y casi todas las pantallas de la red. `cache` de React hace que
 * sea **un solo pedido por render**, por más que lo llamen cinco componentes; antes cada
 * pantalla hacía el suyo con opciones distintas y no se compartían.
 *
 * Nunca tira: un punto rojo no vale tirar abajo el dashboard.
 */
export const leerResumenSocial = cache(async (): Promise<ResumenSocialLeido> => {
  try {
    const res = await apiFetch("/social/resumen");
    if (!res.ok) return { ...VACIO, disponible: false };
    return { ...VACIO, ...((await res.json()) as ResumenSocial), disponible: true };
  } catch {
    return { ...VACIO, disponible: false };
  }
});

/**
 * Con qué proponer el @ a quien todavía no tiene: su nombre y su licencia, del perfil de
 * la cuenta. `/profiles` ya lo pide el layout con las mismas opciones, así que Next lo
 * resuelve con ese mismo pedido.
 */
export async function leerDatosParaElHandle(): Promise<{ nombre: string; licencia: string | null }> {
  try {
    const res = await apiFetch("/profiles");
    const perfiles = res.ok ? ((await res.json()) as Profile[]) : [];
    const p = perfiles[0];
    return {
      nombre: [p?.first_name, p?.last_name].filter(Boolean).join(" "),
      licencia: p?.license_type && p.license_type !== "-" ? p.license_type : null,
    };
  } catch {
    return { nombre: "", licencia: null };
  }
}

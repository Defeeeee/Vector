"use server";

import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { armarResumenPiloto, type ResumenPiloto } from "@/lib/briefing-pdf-datos";
import type { Aircraft, Flight, PilotDocument, Profile } from "@/types";

/**
 * "¿Puedo volar hoy?" para el briefing en PDF: la misma lógica del inicio (`pilotStatus`), ya
 * escrita en el server —las fechas incluidas, invariante 1— para que el navegador sólo la dibuje.
 *
 * Lee, no escribe (invariante 15). Si no puede leer algo, **no responde "podés volar"**: devuelve
 * qué no pudo leer y el PDF lo dice (invariante 2). Por eso no tira: un error acá no puede
 * convertirse en una hoja sin esta sección.
 */
export async function resumenDelPiloto(): Promise<ResumenPiloto> {
  const ahora = new Date();
  const todoSinLeer = armarResumenPiloto(
    { profile: null, documents: [], flights: [], aircraft: [], unavailable: ["profile", "documents", "flights", "aircraft"] },
    ahora
  );
  try {
    const res = await apiFetch("/dashboard");
    if (!res.ok) return todoSinLeer;
    const data = await res.json();
    return armarResumenPiloto(
      {
        profile: (data.profile as Profile) || null,
        documents: (data.documents as PilotDocument[]) || [],
        flights: (data.flights as Flight[]) || [],
        aircraft: (data.aircraft as Aircraft[]) || [],
        unavailable: (data.unavailable as string[]) || [],
      },
      ahora
    );
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return todoSinLeer;
  }
}

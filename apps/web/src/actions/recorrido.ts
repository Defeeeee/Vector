"use server";

import { apiFetch } from "@/lib/api";
import { allAirports } from "@/lib/airports";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { aerodromoCercano, hhmmArgentina, hhmmUtc, type RecorridoCompacto, type ResumenRecorrido } from "@/lib/recorrido";

export interface RecorridoDelVuelo {
  recorrido: RecorridoCompacto;
  resumen: ResumenRecorrido;
  /** Ya escritas acá, en hora argentina: el cliente no formatea horas (invariante 1). */
  despegueTexto: string;
  aterrizajeTexto: string;
  origen: string | null;
  destino: string | null;
}

export interface VueloDetectado {
  /** Para el formulario, que guarda la hora en UTC: el despegue para abajo, el aterrizaje para arriba. */
  takeoffUtc: string;
  landingUtc: string;
  despegueTexto: string;
  aterrizajeTexto: string;
  minutos: number;
  aterrizajes: number;
  origen: string | null;
  destino: string | null;
}

let argentinos: { icao: string; lat?: number | null; lon?: number | null }[] | null = null;
const aerodromos = () => (argentinos ??= allAirports().filter((a) => a.country === "AR"));

/**
 * El recorrido real de un vuelo (`GET /adsb/vuelos/{id}`), o `null` si no hay: el avión no
 * transmite ADS-B, voló fuera de la zona que se graba, o es de antes del 23/10. Es una
 * lectura; el backend guarda el recorrido con el vuelo la primera vez, eso no es de esta
 * pantalla (invariante 15: lo pide el navegador al abrir la tarjeta, no el render).
 */
export async function recorridoDelVuelo(flightId: string): Promise<RecorridoDelVuelo | null> {
  if (!/^[\w-]{1,64}$/.test(flightId)) return null;
  try {
    const r = await apiFetch(`/adsb/vuelos/${flightId}`, { cache: "no-store" });
    if (!r.ok) return null;
    const { recorrido, resumen } = (await r.json()) as { recorrido: RecorridoCompacto | null; resumen?: ResumenRecorrido };
    if (!recorrido || !resumen) return null;
    return {
      recorrido,
      resumen,
      despegueTexto: hhmmArgentina(resumen.despegue),
      aterrizajeTexto: hhmmArgentina(resumen.aterrizaje),
      origen: aerodromoCercano(resumen.inicio, aerodromos()),
      destino: aerodromoCercano(resumen.fin, aerodromos()),
    };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return null;
  }
}

/** Los vuelos que hizo ese avión ese día, para sugerir los horarios al registrar uno. */
export async function vuelosDetectados(aircraftId: string, fecha: string): Promise<VueloDetectado[]> {
  if (!/^[\w-]{1,64}$/.test(aircraftId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  try {
    const q = new URLSearchParams({ aircraft_id: aircraftId, fecha });
    const r = await apiFetch(`/adsb/detectados?${q}`, { cache: "no-store" });
    if (!r.ok) return [];
    const { vuelos } = (await r.json()) as { vuelos: ResumenRecorrido[] };
    return vuelos.map((v) => ({
      takeoffUtc: hhmmUtc(v.despegue, "abajo"),
      landingUtc: hhmmUtc(v.aterrizaje, "arriba"),
      despegueTexto: hhmmArgentina(v.despegue),
      aterrizajeTexto: hhmmArgentina(v.aterrizaje),
      minutos: v.minutos,
      aterrizajes: v.aterrizajes,
      origen: aerodromoCercano(v.inicio, aerodromos()),
      destino: aerodromoCercano(v.fin, aerodromos()),
    }));
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return [];
  }
}

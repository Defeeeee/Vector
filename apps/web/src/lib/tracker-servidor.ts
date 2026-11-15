import { apiFetch } from "@/lib/api";
import { pilotosDeRespuesta, tarjetasDeVuelos, vuelosDeRespuesta, type PilotoSeguido, type TarjetaDeVuelo } from "@/lib/tracker";

/**
 * Lo que el tracker lee del backend (`GET /tracker/vuelos` y `/tracker/pilotos`, migración 056), siempre
 * **sin cache**: el estado de un vuelo cambia cada pocos segundos y una lista vieja diría "en el aire"
 * de un avión que ya aterrizó. Lo usan la pantalla de inicio (server) y `/api/tracker/vuelos` (el
 * refresco cada 30 s), así las dos escriben las horas con el mismo código, en el server (invariante 1).
 *
 * Una lectura que falla es `no-disponible`, nunca "no te asignaron nada" (invariante 2).
 */
export type LecturaDelTracker =
  | { estado: "ok"; tarjetas: TarjetaDeVuelo[]; pilotos: PilotoSeguido[] }
  | { estado: "sin-sesion" }
  | { estado: "no-disponible" };

export async function leerTracker(): Promise<LecturaDelTracker> {
  const [vuelos, pilotos] = await Promise.all([apiFetch("/tracker/vuelos", { cache: "no-store" }), apiFetch("/tracker/pilotos", { cache: "no-store" })]);
  if (vuelos.status === 401 || pilotos.status === 401) return { estado: "sin-sesion" };
  if (!vuelos.ok || !pilotos.ok) return { estado: "no-disponible" };
  try {
    return {
      estado: "ok",
      tarjetas: tarjetasDeVuelos(vuelosDeRespuesta(await vuelos.json())),
      pilotos: pilotosDeRespuesta(await pilotos.json()),
    };
  } catch {
    return { estado: "no-disponible" };
  }
}

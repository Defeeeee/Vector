import { NextRequest, NextResponse } from "next/server";
import { aerodromosParaFiltrar, getAirport } from "@/lib/airports";
import { responderFiltrar } from "@/lib/filtro-aerodromos";

/**
 * GET /api/airports/filtrar?desde=SADF&nm=100&largo=800&sup=dura&comb=100LL…
 *
 * Los aeródromos que cumplen los filtros de la pestaña Aeropuertos
 * (`lib/filtro-aerodromos.ts`). Vive en el servidor por lo mismo que `/near`: el
 * directorio se lee del disco y la lista que vuelve es chica.
 *
 * `desde` se resuelve contra el directorio, por ICAO o por designador ANAC. Si no existe
 * o no tiene coordenadas se avisa en `desdeError`, y la distancia no entra en el filtro.
 *
 * **Sin señal lo contesta el service worker con el paquete de datos** (3.46.0,
 * `contestarSinSenal`), con la misma `responderFiltrar`.
 */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    responderFiltrar(new URL(req.url).searchParams, { candidatos: aerodromosParaFiltrar(), resolverDesde: getAirport }),
    // El directorio sólo cambia cuando se regeneran los TSV.
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

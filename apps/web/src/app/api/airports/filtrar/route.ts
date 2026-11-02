import { NextRequest, NextResponse } from "next/server";
import { aerodromosParaFiltrar, getAirport, provinciasArgentinas } from "@/lib/airports";
import { filtrarAerodromos, filtrosDeParams } from "@/lib/filtro-aerodromos";

/**
 * GET /api/airports/filtrar?desde=SADF&nm=100&largo=800&sup=dura&comb=100LL…
 *
 * Los aeródromos que cumplen los filtros de la pestaña Aeropuertos
 * (`lib/filtro-aerodromos.ts`). Vive en el servidor por lo mismo que `/near`: el
 * directorio se lee del disco y la lista que vuelve es chica.
 *
 * `desde` se resuelve contra el directorio, por ICAO o por designador ANAC. Si no existe
 * o no tiene coordenadas se avisa en `desdeError`, y la distancia no entra en el filtro.
 */
export async function GET(req: NextRequest) {
  const filtros = filtrosDeParams(new URL(req.url).searchParams);

  let desde: { icao: string; label: string; lat: number; lon: number } | null = null;
  let desdeError: string | null = null;
  if (filtros.desde) {
    const a = getAirport(filtros.desde);
    if (!a) desdeError = `No encuentro el aeródromo ${filtros.desde}.`;
    else if (a.lat === undefined || a.lon === undefined) desdeError = `No tengo la ubicación de ${a.icao}.`;
    else desde = { icao: a.icao, label: a.label, lat: a.lat, lon: a.lon };
  }

  const resultado = filtrarAerodromos(
    aerodromosParaFiltrar(),
    desde ? filtros : { ...filtros, desde: undefined, radioNm: undefined },
    desde,
  );

  return NextResponse.json(
    {
      ...resultado,
      desde: desde ? { icao: desde.icao, label: desde.label } : null,
      desdeError,
      provincias: provinciasArgentinas(),
    },
    // El directorio sólo cambia cuando se regeneran los TSV.
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { allAirports } from "@/lib/airports";
import { alternativasDesdeDirectorio } from "@/lib/alternativas";

/**
 * GET /api/airports/near?lat=-34.68&lon=-58.64[&nm=40][&gs=110]
 *
 * Aeródromos cerca de un punto, del más cercano al más lejano.
 *
 * Vive en el servidor porque el directorio se lee del disco: mandarle al navegador las
 * 711 entradas para que filtre sería tirar medio megabyte por una lista de seis.
 *
 * Sólo devuelve los que tienen coordenadas —no todos las tienen— porque sin posición no
 * hay distancia que medir ni punto que dibujar.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat y lon son obligatorios" }, { status: 400 });
  }

  const nm = Number(searchParams.get("nm"));
  const gs = Number(searchParams.get("gs"));

  const resultados = alternativasDesdeDirectorio(allAirports(), { lat, lon }, { nm, gs });

  return NextResponse.json(
    { resultados },
    // El directorio sólo cambia cuando se regeneran los TSV.
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

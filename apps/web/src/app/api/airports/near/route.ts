import { NextRequest, NextResponse } from "next/server";
import { allAirports } from "@/lib/airports";
import { alternativasCerca, MAX_ALTERNATIVAS, RADIO_POR_DEFECTO_NM } from "@/lib/alternativas";

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

  const candidatos = allAirports()
    .filter((a) => a.lat !== undefined && a.lon !== undefined)
    /*
      **Sin helipuertos.** El directorio los incluye —`size: "H"`, o `kind: "HEL"` en
      MADHEL— y en el conurbano son muchos: la primera prueba de esto devolvió tres
      helipuertos entre los cinco más cercanos a Morón. Un helipuerto no es una
      alternativa para un avión, y ofrecerlo es peor que no ofrecer nada.
    */
    .filter((a) => a.size !== "H" && a.madhel?.kind !== "HEL")
    .map((a) => ({
      icao: a.icao,
      label: a.label,
      lat: a.lat as number,
      lon: a.lon as number,
      local: a.local,
      pistas: a.pistas,
    }));

  const resultados = alternativasCerca({ lat, lon }, candidatos, {
    radioNm: Number.isFinite(nm) && nm > 0 ? Math.min(nm, 300) : RADIO_POR_DEFECTO_NM,
    limite: MAX_ALTERNATIVAS,
    groundSpeedKt: Number.isFinite(gs) && gs > 0 ? gs : null,
  });

  return NextResponse.json(
    { resultados },
    // El directorio sólo cambia cuando se regeneran los TSV.
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

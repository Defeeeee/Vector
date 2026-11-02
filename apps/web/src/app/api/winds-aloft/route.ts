import { NextRequest, NextResponse } from "next/server";
import { NIVELES_HPA, indiceDeHora, nivelesDesdeOpenMeteo } from "@/lib/vientos-altura";

/**
 * GET /api/winds-aloft?lat=-34.68&lon=-58.64[&hora=2026-08-19T14:00:00Z]
 *
 * Viento en altura para el planificador, del modelo GFS vía Open-Meteo.
 *
 * **Sin API key y sin registro.** Verificado con un request real antes de escribir esto:
 * 200, viento en nudos si se pide `wind_speed_unit=kn`, dirección en grados verdaderos
 * —el mismo marco que usa todo `navegacion.ts`— y `geopotential_height` con la altura
 * real de cada nivel.
 *
 * Pasa por acá y no por el cliente por dos motivos: la clave del caché es del servidor
 * (`revalidate`), así que dos pilotos planificando la misma zona hacen un solo request
 * upstream; y si mañana la fuente cambia o exige clave, cambia un archivo y no la
 * pantalla.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat y lon son obligatorios" }, { status: 400 });
  }

  const cuando = searchParams.get("hora");
  const momento = cuando && !Number.isNaN(Date.parse(cuando)) ? new Date(cuando) : new Date();

  const campos = NIVELES_HPA.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]).join(",");

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=${campos}&wind_speed_unit=kn&forecast_days=2&timezone=UTC`;

  try {
    const res = await fetch(url, {
      // El modelo se actualiza cada seis horas: pedirlo más seguido es gastar por nada.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "El servicio de vientos en altura no respondió", niveles: [] },
        { status: 502 }
      );
    }

    const datos = await res.json();
    const tiempos: string[] = datos?.hourly?.time ?? [];
    const i = indiceDeHora(tiempos, momento);

    return NextResponse.json({
      niveles: nivelesDesdeOpenMeteo(datos, i),
      // Se devuelve la hora que efectivamente se usó, no la pedida: si el modelo no
      // llega hasta ahí, el piloto tiene que poder ver que le contestaron por otra hora.
      hora: tiempos[i] ?? null,
      modelo: "GFS vía Open-Meteo",
    });
  } catch {
    /*
      Sin viento en altura se planifica igual con el de superficie, que es lo que se
      venía haciendo. Un 502 con `niveles: []` deja que la pantalla lo diga en vez de
      romperse — la misma disciplina que el 503 sintético de `apiFetch`.
    */
    return NextResponse.json(
      { error: "No se pudo contactar el servicio de vientos en altura", niveles: [] },
      { status: 502 }
    );
  }
}

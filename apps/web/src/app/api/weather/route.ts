import { NextRequest, NextResponse } from "next/server";
import { getAirport } from "@/lib/airports";
import { distanceNm } from "@/lib/distance";
import { METAR_STATIONS } from "@/lib/estaciones-meteo";

/**
 * La hora de observación del upstream, en ISO.
 *
 * `reportTime` ya viene en ISO; `obsTime` viene en **segundos** desde epoch, y
 * pasárselo a `new Date()` sin multiplicar da enero de 1970. Se prefiere el primero
 * justamente para no depender de esa distinción en dos lugares.
 */
function horaUpstream(dato: { reportTime?: unknown; obsTime?: unknown }): string | null {
  if (typeof dato.reportTime === "string" && dato.reportTime.trim() !== "") return dato.reportTime;
  if (typeof dato.obsTime === "number" && Number.isFinite(dato.obsTime) && dato.obsTime > 0) {
    return new Date(dato.obsTime * 1000).toISOString();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase();

  if (!icao || icao.length < 3) {
    return NextResponse.json({ error: "ICAO code is required" }, { status: 400 });
  }

  try {
    // 1. Fetch METAR in JSON format
    const metarJsonUrl = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    const metarRes = await fetch(metarJsonUrl, {
      headers: { "User-Agent": "Vector-Flight-Log-App" },
      next: { revalidate: 300 } // cache for 5 minutes
    });

    let metarData: any = null;
    let rawMetar = "No disponible";
    let category = "UNK";
    let temp: number | null = null;
    let windSpeed: number | null = null;
    let windDir: string | number | null = null;
    /*
      El upstream manda mucho más de lo que esta ruta leía: `altim` (QNH en hPa, el
      mismo número que el `Q1024` del METAR crudo), `dewp`, `visib`, `clouds`, `elev`.
      Se descartaban todos.

      `altim` y `dewp` alimentan `computeAltitude` y `computeCloudBase` de `aviation.ts`
      —que existen, están testeados y hoy piden el dato **tipeado a mano** en las
      calculadoras—. Tomarlos del origen es más barato y más confiable que escribir un
      parser de METAR.

      ⚠️ `visib` viene como **string** (`"6+"`), no como número. Por eso no está acá:
      exponerlo invitaría a un `Number()` que daría `NaN` los días de buena visibilidad.
    */
    let altimHpa: number | null = null;
    let dewpointC: number | null = null;
    let nearestStation: { icao: string; name: string; distanceNm: number } | null = null;
    /*
      **Cuándo se observó.** El upstream lo manda y esta ruta lo tiraba, que es la misma
      omisión que el comentario de arriba cuenta haber corregido con `altim` y `dewp`.

      Sin esto no hay nada honesto que mostrar: un METAR de cinco minutos y uno de dos
      horas se renderizan idénticos. Hoy eso es tolerable porque el `revalidate: 300`
      acota la edad; **con un service worker guardando respuestas deja de serlo**.

      ⚠️ `obsTime` viene en **segundos**; `reportTime` ya viene en ISO. Se manda el ISO
      para que nadie tenga que acordarse de la escala. Ver `lib/frescura.ts`, que
      igual sabe leer las dos y prioriza el grupo `DDHHMMZ` del METAR crudo.
    */
    let observadoEn: string | null = null;

    if (metarRes.ok) {
      const text = await metarRes.text();
      if (text.trim().length > 0) {
        try {
          const json = JSON.parse(text);
          if (json && Array.isArray(json) && json.length > 0) {
            metarData = json[0];
            rawMetar = metarData.rawText || metarData.rawOb || "No disponible";
            category = metarData.fltCat || metarData.fltcat || "UNK";
            temp = metarData.temp !== undefined ? metarData.temp : null;
            windSpeed = metarData.wspd !== undefined ? metarData.wspd : null;
            windDir = metarData.wdir !== undefined ? metarData.wdir : null;
            altimHpa = typeof metarData.altim === "number" ? metarData.altim : null;
            dewpointC = typeof metarData.dewp === "number" ? metarData.dewp : null;
            observadoEn = horaUpstream(metarData);
          }
        } catch (parseErr) {
          console.error("Error parsing weather JSON:", parseErr);
        }
      }
    }

    // If no direct METAR was found, search for the nearest station
    if (rawMetar === "No disponible") {
      const targetAirport = getAirport(icao);
      if (targetAirport && targetAirport.lat !== undefined && targetAirport.lon !== undefined) {
        const sorted = METAR_STATIONS.map((st) => ({
          ...st,
          dist: distanceNm(targetAirport.lat!, targetAirport.lon!, st.lat, st.lon),
        })).sort((a, b) => a.dist - b.dist);

        const candidates = sorted.slice(0, 4);
        const candIds = candidates.map((c) => c.icao).join(",");

        try {
          const candRes = await fetch(`https://aviationweather.gov/api/data/metar?ids=${candIds}&format=json`, {
            headers: { "User-Agent": "Vector-Flight-Log-App" },
            next: { revalidate: 300 },
          });

          if (candRes.ok) {
            const candText = await candRes.text();
            if (candText.trim().length > 0) {
              const candJson = JSON.parse(candText);
              if (Array.isArray(candJson) && candJson.length > 0) {
                // Pick the first available candidate METAR
                for (const candidate of candidates) {
                  const match = candJson.find((item: any) => item.icaoId === candidate.icao);
                  if (match) {
                    rawMetar = match.rawText || match.rawOb || "No disponible";
                    category = match.fltCat || match.fltcat || "UNK";
                    temp = match.temp !== undefined ? match.temp : null;
                    windSpeed = match.wspd !== undefined ? match.wspd : null;
                    windDir = match.wdir !== undefined ? match.wdir : null;
                    altimHpa = typeof match.altim === "number" ? match.altim : null;
                    dewpointC = typeof match.dewp === "number" ? match.dewp : null;
                    observadoEn = horaUpstream(match);
                    nearestStation = {
                      icao: candidate.icao,
                      name: candidate.name,
                      distanceNm: candidate.dist,
                    };
                    break;
                  }
                }
              }
            }
          }
        } catch (candErr) {
          console.error("Error fetching nearest METAR candidate:", candErr);
        }
      }
    }

    // 2. Fetch TAF in raw format
    const tafRes = await fetch(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=raw`, {
      headers: { "User-Agent": "Vector-Flight-Log-App" },
      next: { revalidate: 300 }
    });
    const rawTaf = tafRes.ok ? await tafRes.text() : "No disponible";

    return NextResponse.json({
      icao,
      metar: rawMetar.trim(),
      taf: rawTaf.trim() || "No disponible",
      category,
      temp,
      windSpeed,
      windDir,
      altimHpa,
      dewpointC,
      nearestStation,
      observadoEn,
    });
  } catch (err: any) {
    console.error("Error fetching weather in api route:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch weather data" }, { status: 500 });
  }
}

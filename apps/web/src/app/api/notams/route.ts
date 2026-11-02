import { NextRequest, NextResponse } from "next/server";
import { anacIndicator } from "@/lib/madhel-reference";
import { componerFicha, datosAip } from "@/lib/aip";



interface NotamItem {
  code: string;
  from: string;
  to: string;
  textRaw: string;
  textEsp: string;
}

interface MadhelData {
  name: string;
  fullName: string;
  state: string;
  fir: string;
  elevation: number;
  condition: string;
  control: string;
  traffic: string;
  status: string;
  runways: string[];
  radio: string[];
  localization: string;
  fuel: string;
  telephone: string[];
  particularNorms: string;
  generalNorms: string;
  /** De dónde salió lo de arriba, y de cuándo es. `null` cuando todo vino de MADHEL. */
  aip: { edicion: string; vigenteDesde: string; url: string } | null;
  /** Las cartas oficiales del AIP, con su edición. Vacío si el aeródromo no tiene. */
  cartas: { letra: string; titulo: string; edicion: string; vigenteDesde: string; url: string }[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase();

  if (!icao || icao.length < 3) {
    return NextResponse.json({ error: "Código ICAO inválido" }, { status: 400 });
  }

  const indicator = anacIndicator(icao);

  let madhel: MadhelData | null = null;
  let notams: NotamItem[] = [];

  // 1. Fetch MADHEL General Info
  try {
    const madhelRes = await fetch(`https://datos.anac.gob.ar/madhel/api/v2/airports/${indicator}/`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      next: { revalidate: 3600 } // Cache MADHEL details for 1 hour
    });

    if (madhelRes.ok) {
      const mJson = await madhelRes.json();
      if (mJson && mJson.metadata) {
        const particularContent = mJson.data?.norms?.particular?.content || "";
        const generalContent = mJson.data?.norms?.general?.content || "";

        // Parse radio frequencies from norms or helpers
        let radioList: string[] = [];
        if (mJson.data?.helpers_system?.radio && mJson.data.helpers_system.radio.length > 0) {
          radioList = mJson.data.helpers_system.radio;
        } else if (particularContent) {
          const freqMatch = particularContent.match(/(?:Frecuencia|canal de llamada|Frec)[^0-9]*(\d+[\,\.]\d+)\s*MHz/i);
          if (freqMatch) {
            radioList = [`Frecuencia común: ${freqMatch[1]} MHz`];
          }
        }

        let locStr = mJson.data?.human_readable_localization || "";
        if (locStr.includes("***Consultar en el sitio web")) {
          locStr = ""; // Clear the useless AIP reference string
        }

        /*
          **El AIP rellena, nunca pisa.** Para un aeródromo controlado MADHEL devuelve
          `rwy: []`, `radio: []`, `fuel: ""` y `telephone: []` —ANAC publica eso en el AIP
          y no acá—, así que el hueco es real y hay que llenarlo. Lo que no se puede es
          llenarlo cuando MADHEL sí contestó: la versión anterior de esto hacía
          `fallback ? fallback.rwy : ...`, y con eso La Plata mostraba una pista de tierra
          escrita a mano en vez de la de asfalto que ANAC publica.

          Se elige por campo y no por aeródromo, que es lo que hace que la regla se sostenga
          sola cuando MADHEL empiece a publicar alguno de estos datos.
        */
        const datosDelAip = datosAip(icao);
        const ficha = componerFicha(
          {
            runways: mJson.data?.rwy || [],
            radio: radioList,
            localization: locStr,
            fuel: mJson.data?.fuel || "",
            telephone: mJson.data?.telephone || [],
          },
          datosDelAip
        );

        madhel = {
          name: mJson.metadata.identifiers?.icao || icao,
          fullName: mJson.human_readable_identifier || mJson.the_geom?.properties?.name || "",
          state: mJson.metadata.localization?.state || "",
          fir: mJson.metadata.localization?.fir || "",
          elevation: mJson.metadata.localization?.elevation || 0,
          condition: mJson.metadata.condition || "",
          control: mJson.metadata.control || "",
          traffic: mJson.metadata.traffic || "",
          status: mJson.metadata.status || "OK",
          
          // Detail fields
          runways: ficha.runways,
          radio: ficha.radio,
          localization: ficha.localization,
          fuel: ficha.fuel || "No especificado",
          telephone: ficha.telephone,
          particularNorms: particularContent,
          generalNorms: generalContent,
          aip: ficha.aip,
          cartas: datosDelAip?.cartas ?? []
        };
      }
    }
  } catch (err) {
    console.error("Error fetching MADHEL data:", err);
  }

  // 2. Fetch NOTAMs from official ANAC JSON service
  try {
    const notamRes = await fetch("https://ais.anac.gob.ar/notam/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://ais.anac.gob.ar/notam",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: `indicador=${encodeURIComponent(indicator)}`,
      cache: "no-store"
    });

    if (notamRes.ok) {
      const nJson = await notamRes.json();
      if (Array.isArray(nJson)) {
        notams = nJson.map((item: any) => {
          const rawBody = (item.novedad || "").replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML tags
          let textRaw = rawBody.trim();
          let textEsp = rawBody.trim();

          if (rawBody.includes("Versión en Español:")) {
            const parts = rawBody.split("Versión en Español:");
            textRaw = parts[0].trim();
            textEsp = parts[1].trim();
          }

          const toVal = item.hasta === "0000-00-00 00:00:00" ? "PERMANENTE" : item.hasta;

          return {
            code: item.notam || "NOTAM",
            from: item.desde || "",
            to: toVal,
            textRaw,
            textEsp
          };
        });
      }
    }
  } catch (err) {
    console.error("Error fetching NOTAMs:", err);
  }

  return NextResponse.json({
    icao,
    indicator,
    madhel,
    notams
  });
}

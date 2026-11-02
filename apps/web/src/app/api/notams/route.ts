import { NextRequest, NextResponse } from "next/server";
import { anacIndicator } from "@/lib/madhel-reference";
import { datosAip } from "@/lib/aip";
import { fetchAnac } from "@/lib/anac";
import { leerMadhel, leerNotams, type FichaAnac } from "@/lib/ficha-anac";

/** El tope del cuerpo del POST: una ficha de MADHEL y sus NOTAM pesan unos KB. */
const MAX_CUERPO = 512 * 1024;

function icaoValido(valor: unknown): string | null {
  const icao = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return /^[A-Z0-9]{3,4}$/.test(icao) ? icao : null;
}

function componer(icao: string, madhel: unknown, notams: unknown): FichaAnac {
  return {
    icao,
    indicator: anacIndicator(icao),
    madhel: leerMadhel(madhel, icao, datosAip(icao)),
    notams: leerNotams(notams),
  };
}

/**
 * GET /api/notams?icao=SADF — la ficha y los NOTAM, **preguntándole el servidor a ANAC**.
 *
 * ANAC bloquea las IPs de nuestros servidores (el VPS y DefeServer desde el 2026-10-28,
 * oraclex64 desde el 2026-11-02), así que desde acá casi siempre vuelve `madhel: null` y
 * `notams: null`, "no se pudo consultar". Queda para el mail del briefing, que corre en el
 * servidor, y como respaldo del service worker. Las pantallas usan el POST.
 */
export async function GET(req: NextRequest) {
  const icao = icaoValido(new URL(req.url).searchParams.get("icao"));
  if (!icao) return NextResponse.json({ error: "Código ICAO inválido" }, { status: 400 });
  const indicator = anacIndicator(icao);

  // MADHEL y los NOTAM a la vez: con ANAC caído, cada uno espera su tope (`fetchAnac`), y
  // uno detrás del otro eran el doble.
  const [madhel, notams] = await Promise.all([
    fetchAnac(`https://datos.anac.gob.ar/madhel/api/v2/airports/${indicator}/`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 3600 }, // Cache MADHEL details for 1 hour
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch((err) => {
        console.error("Error fetching MADHEL data:", err);
        return null;
      }),
    fetchAnac("https://ais.anac.gob.ar/notam/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://ais.anac.gob.ar/notam",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: `indicador=${encodeURIComponent(indicator)}`,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch((err) => {
        console.error("Error fetching NOTAMs:", err);
        return null;
      }),
  ]);

  return NextResponse.json(componer(icao, madhel, notams));
}

/**
 * POST /api/notams  { icao, madhel, notams } — la misma respuesta que el GET, armada con
 * lo que **el navegador del piloto** le trajo a ANAC (`lib/anac-navegador.ts`).
 *
 * ANAC no bloquea al navegador de un piloto, que pregunta con su IP, y sus dos servicios
 * aceptan pedidos de cualquier origen (`Access-Control-Allow-Origin: *`). Acá sólo se
 * completa con el AIP, que vive en el disco del servidor. `madhel` y `notams` son las
 * respuestas tal cual, o `null` si el navegador no pudo preguntar.
 */
export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > MAX_CUERPO) {
    return NextResponse.json({ error: "Demasiado grande" }, { status: 413 });
  }
  const cuerpo = await req.json().catch(() => null);
  const icao = icaoValido(cuerpo?.icao);
  if (!icao) return NextResponse.json({ error: "Código ICAO inválido" }, { status: 400 });
  return NextResponse.json(componer(icao, cuerpo.madhel ?? null, cuerpo.notams ?? null));
}

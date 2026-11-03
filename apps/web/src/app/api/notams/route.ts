import { NextRequest, NextResponse } from "next/server";
import { anacIndicator } from "@/lib/madhel-reference";
import { datosAip } from "@/lib/aip";
import { fetchAnac } from "@/lib/anac";
import { leerMadhel, leerNotams, type FichaAnac } from "@/lib/ficha-anac";
import { USER_AGENT_VECTOR, deIndicador, notamsCrudos, notamsDelPais } from "@/lib/notams-descargados";

/** El tope del cuerpo del POST: una ficha de MADHEL y sus NOTAM pesan unos KB. */
const MAX_CUERPO = 512 * 1024;

function icaoValido(valor: unknown): string | null {
  const icao = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  return /^[A-Z0-9]{3,4}$/.test(icao) ? icao : null;
}

function componer(
  icao: string,
  madhel: unknown,
  notams: unknown,
  deDonde: Pick<FichaAnac, "notamsFuente" | "notamsActualizacion" | "notamsCapturadosEn"> = {},
): FichaAnac {
  return {
    icao,
    indicator: anacIndicator(icao),
    madhel: leerMadhel(madhel, icao, datosAip(icao)),
    notams: leerNotams(notams),
    ...deDonde,
  };
}

/**
 * GET /api/notams?icao=SADF — la ficha y los NOTAM, desde el servidor.
 *
 * Los NOTAM salen de **la descarga del país** si está al día (`lib/notams-descargados.ts`).
 * La ficha de MADHEL se le pide a ANAC, que bloquea las IPs de nuestros servidores, así que
 * casi siempre vuelve `madhel: null`. Lo usan el mail del briefing y el service worker; las
 * pantallas usan el POST, con la ficha de MADHEL que trae el navegador.
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
      headers: { "User-Agent": USER_AGENT_VECTOR },
      next: { revalidate: 3600 }, // Cache MADHEL details for 1 hour
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch((err) => {
        console.error("Error fetching MADHEL data:", err);
        return null;
      }),
    notamsCrudos(indicator),
  ]);

  return NextResponse.json(
    componer(icao, madhel, notams.items, {
      notamsFuente: notams.fuente,
      notamsActualizacion: notams.actualizacion,
      notamsCapturadosEn: notams.capturadoEn,
    }),
  );
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
  // Los NOTAM de la descarga ganan si están al día: son de ANAC, del país entero.
  const pais = notamsDelPais();
  if (pais) {
    return NextResponse.json(
      componer(icao, cuerpo.madhel ?? null, deIndicador(pais.items, anacIndicator(icao)), {
        notamsFuente: "descarga",
        notamsActualizacion: pais.actualizacion,
        notamsCapturadosEn: pais.verificado,
      }),
    );
  }
  return NextResponse.json(componer(icao, cuerpo.madhel ?? null, cuerpo.notams ?? null, { notamsFuente: cuerpo.notams ? "navegador" : null }));
}

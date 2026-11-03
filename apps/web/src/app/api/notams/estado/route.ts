import { NextResponse } from "next/server";
import { notamsDelPais } from "@/lib/notams-descargados";

/**
 * GET /api/notams/estado — ¿la descarga de los NOTAM del país está al día?
 *
 * Lo pregunta el navegador antes de pedirle los NOTAM a ANAC (`lib/anac-navegador.ts`): si
 * está al día, no le pregunta nada, y ANAC recibe un pedido menos por piloto.
 */
export async function GET() {
  const pais = notamsDelPais();
  return NextResponse.json(
    pais ? { alDia: true, actualizacion: pais.actualizacion, verificado: pais.verificado } : { alDia: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}

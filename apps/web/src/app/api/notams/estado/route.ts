import { NextResponse } from "next/server";
import { notamsDelPais } from "@/lib/notams-descargados";
import { madhelAlDia } from "@/lib/madhel-descargado";

/**
 * GET /api/notams/estado — ¿están al día la descarga de los NOTAM del país y la copia de las
 * fichas de MADHEL?
 *
 * Lo pregunta el navegador antes de pedirle algo a ANAC (`lib/anac-navegador.ts`): lo que
 * está al día no se lo pregunta, y ANAC recibe menos pedidos por piloto.
 */
export async function GET() {
  const pais = notamsDelPais();
  const madhel = madhelAlDia();
  return NextResponse.json(
    {
      ...(pais ? { alDia: true, actualizacion: pais.actualizacion, verificado: pais.verificado } : { alDia: false }),
      madhelAlDia: Boolean(madhel),
      madhelDescargado: madhel?.descargado ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

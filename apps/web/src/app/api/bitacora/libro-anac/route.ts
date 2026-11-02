import { NextResponse, type NextRequest } from "next/server";
import { getSessionToken } from "@/actions/auth";
import { apiFetch } from "@/lib/api";
import { armarPdfDelLibro } from "@/lib/libro-anac-armar";

export const runtime = "nodejs";

/**
 * El libro de vuelo en PDF, con la hoja de siempre: un "libro de vuelo en formato digital
 * impreso", como lo admite la Res. ANAC 470/2025 (Anexo I, 9(b)). Ver `lib/libro-anac.ts`
 * para qué va en cada casillero.
 *
 * - **Pide sesión**: es la bitácora entera de una persona.
 * - **Un libro por PDF.** Quien lleva más de uno en Vector elige cuál con `?libro=<id>`;
 *   sin elegir, el principal. Un vuelo sin libro asignado es del principal. Las horas de
 *   apertura de ese libro son los "Totales página anterior" de la primera hoja.
 * - Se arma con lo que el backend ya devuelve (`/flights`, `/aircraft`, `/logbooks`,
 *   `/profiles`): el PDF no inventa nada que Vector no tenga, y lo que falta —la potencia
 *   de un avión, el legajo— queda en blanco para completar a mano.
 *
 * - `?firma=1` estampa la firma que el piloto guardó al firmar un plan de vuelo en cada hoja.
 *
 * El armado está en `lib/libro-anac-armar.ts`, compartido con el copiloto de WhatsApp.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  const r = await armarPdfDelLibro((ruta) => apiFetch(ruta, { cache: "no-store" }), {
    libroId: req.nextUrl.searchParams.get("libro"),
    // `?firma=1`: con la firma guardada en cada hoja ("PDF firmado").
    conFirma: req.nextUrl.searchParams.get("firma") === "1",
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return new NextResponse(Buffer.from(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.archivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

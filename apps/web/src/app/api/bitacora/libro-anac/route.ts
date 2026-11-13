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
 * - `?certificaciones=1` estampa, en la celda de cada vuelo, la firma guardada de quien lo
 *   certificó (con su aclaración). Apagado por defecto: certificar es del certificante.
 * - `?dorsos=1` agrega, después de cada hoja, su dorso (firma con sello) para la doble faz.
 * - `?hoja=N&vista=1` (3.38.0): la vista previa de «Firmas del libro». Sólo esa hoja con su
 *   dorso y todas las firmas que haya, para mirar en la pantalla (`inline`), sin cortar si falta
 *   alguna. Dice cuántas hojas tiene el libro en `X-Hojas`.
 *
 * El armado está en `lib/libro-anac-armar.ts`, compartido con el copiloto de WhatsApp.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  }
  const q = req.nextUrl.searchParams;
  const vista = q.get("vista") === "1";
  const hoja = q.get("hoja");
  const r = await armarPdfDelLibro((ruta) => apiFetch(ruta, { cache: "no-store" }), {
    libroId: q.get("libro"),
    // `?firma=1`: con la firma guardada en cada hoja ("PDF firmado"). La vista previa lleva todo lo que haya.
    conFirma: vista || q.get("firma") === "1",
    conCertificaciones: vista || q.get("certificaciones") === "1",
    conDorsos: vista || q.get("dorsos") === "1",
    hoja: hoja ? Number(hoja) : undefined,
    vistaPrevia: vista,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return new NextResponse(Buffer.from(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${vista ? "inline" : "attachment"}; filename="${r.archivo}"`,
      "Cache-Control": "private, no-store",
      ...(r.hojas ? { "X-Hojas": String(r.hojas) } : {}),
    },
  });
}

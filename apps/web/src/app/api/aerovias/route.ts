import { NextRequest, NextResponse } from "next/server";
import { aeroviasPorPunto, puntosDeAerovia } from "@/lib/aerovias";
import { salidasDesde } from "@/lib/ruta-planificada";
import { fuenteAip } from "@/lib/aip";

/**
 * GET /api/aerovias?punto=BCA
 *
 * Las aerovías que pasan por un punto, cada una con **hasta dónde se puede ir por ella**.
 *
 * ## Para qué existe
 *
 * Para que una aerovía se **elija** en vez de escribirse. La primera versión de esta
 * feature sólo aceptaba `BCA W67 OSA` tipeado en el campo de pegar la ruta, y eso obliga a
 * saber de memoria —o tener la carta al lado— que `W67` pasa por BCA y que del otro lado
 * está OSA. La pantalla existe para no tener que hacer eso.
 *
 * Devuelve las dos listas de una: qué aerovías salen de ese punto y, por cada una, los
 * puntos a los que llega. Con eso los dos desplegables del selector se llenan sin más
 * viajes.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const punto = (searchParams.get("punto") ?? "").trim().toUpperCase();
  if (!punto) return NextResponse.json({ aerovias: [], vigencia: null });

  const aerovias = aeroviasPorPunto(punto).map((a) => ({
    designador: a.designador,
    puntos: a.puntos,
    // Todos menos aquel del que se sale: la aerovía se vuela en los dos sentidos.
    salidas: salidasDesde(a.puntos, punto),
  }));

  const fuente = fuenteAip("ENR3.1");

  return NextResponse.json(
    {
      aerovias,
      vigencia: fuente
        ? { documento: "ENR 3", edicion: fuente.edicion, vigenteDesde: fuente.vigenteDesde, url: fuente.url }
        : null,
    },
    // El catálogo sólo cambia cuando se regenera el TSV.
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}

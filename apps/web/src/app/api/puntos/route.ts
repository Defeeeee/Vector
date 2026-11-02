import { NextRequest, NextResponse } from "next/server";
import { catalogoServidor } from "@/lib/catalogo-servidor";
import { resolverPunto } from "@/lib/resolucion-puntos";
import type { ClasePunto, PuntoResuelto } from "@/lib/resolucion-puntos";

/**
 * GET /api/puntos?q=SADM · ?q=BAR/045/25 · ?q=S34.68/W58.64 · ?q=W67&desde=BCA&hasta=OSA
 *
 * Resuelve **un punto de una ruta**, que ya no es sólo un aeródromo.
 *
 * ## Este archivo ya no resuelve nada
 *
 * Toda la lógica —la precedencia aeródromo → radioayuda → fix, el caso de aerovía con
 * sus vecinos, las sugerencias por prefijo— vive en `lib/resolucion-puntos.ts`, que es
 * pura y recibe el catálogo por parámetro. Acá quedan las tres cosas que sí son de
 * HTTP: leer la query, elegir el catálogo y poner los headers.
 *
 * No fue una prolijidad. El planificador tiene que poder resolver puntos **sin señal**,
 * y para eso el mismo algoritmo tiene que correr en el navegador contra un catálogo
 * precacheado. Escribirlo dos veces era garantizar que la ruta que planificás sin red
 * dejara de ser la que planificás con red — el error que este repo ya cometió cinco
 * veces con `splitRoute`.
 *
 * Los tipos se reexportan porque los importan `PuntoResolver` y `PlanificadorClient`.
 */
export type { ClasePunto, PuntoResuelto };

/**
 * Un día. Es lo que dura un dato del AIP entre enmiendas —el ciclo es de 28 días— y
 * lo mismo que ya mandan `/api/airports/search` y `/api/aerovias`.
 *
 * Va en **todas** las respuestas, incluida la de consulta vacía. Antes faltaba ahí, y
 * el resultado era que unas respuestas se cacheaban y otras no, sin ningún criterio
 * que alguien pudiera reconstruir mirando el código.
 */
const CACHE = { headers: { "Cache-Control": "public, max-age=86400" } };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const resolucion = resolverPunto(
    searchParams.get("q") ?? "",
    { desde: searchParams.get("desde") ?? "", hasta: searchParams.get("hasta") ?? "" },
    catalogoServidor
  );

  return NextResponse.json(resolucion, CACHE);
}

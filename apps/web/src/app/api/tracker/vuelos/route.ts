import { NextResponse } from "next/server";
import { leerTracker } from "@/lib/tracker-servidor";
import { resumenDeLista } from "@/lib/tracker";

/** La lista de vuelos del tracker, ya con los textos escritos, para el refresco de cada ~30 s. Sin cache. */
export async function GET() {
  const l = await leerTracker();
  const cabeceras = { "Cache-Control": "no-store" };
  if (l.estado === "sin-sesion") return NextResponse.json({ detail: "Sin sesión." }, { status: 401, headers: cabeceras });
  if (l.estado === "no-disponible") return NextResponse.json({ detail: "No se pudo leer." }, { status: 503, headers: cabeceras });
  return NextResponse.json({ tarjetas: l.tarjetas, resumen: resumenDeLista(l.tarjetas) }, { headers: cabeceras });
}

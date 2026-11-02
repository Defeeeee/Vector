import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";

/**
 * GET /api/charts?icao=SADF -> [{ categoria, archivo }, …]
 *
 * Proxy fino sobre `GET /charts/{icao}` del backend, que es el único lugar donde
 * vive de verdad el gate de `jeppesen_access`. Acá no se decide nada — se pide con
 * la sesión del piloto y se devuelve lo que conteste.
 *
 * **Sin sesión y sin acceso se contesta lo mismo: `[]`.** No es el mismo patrón que
 * `/api/export`, que sí corta con 401 — ahí faltar la sesión es un error porque el
 * piloto pidió sus propios datos a propósito. Acá la sección de cartas Jeppesen es
 * un agregado que la pantalla de aeródromos intenta para *cualquier* piloto
 * logueado, y la mayoría no tiene el flag: `[]` hace que la sección simplemente no
 * se dibuje, en vez de mostrar un error de permisos a alguien para quien no hay
 * ningún permiso que dar.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionToken())) return NextResponse.json([]);

  const icao = new URL(req.url).searchParams.get("icao")?.trim().toUpperCase();
  if (!icao) return NextResponse.json({ error: "Falta el ICAO" }, { status: 400 });

  try {
    const res = await apiFetch(`/charts/${encodeURIComponent(icao)}`);
    if (!res.ok) return NextResponse.json([]);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json([]);
  }
}

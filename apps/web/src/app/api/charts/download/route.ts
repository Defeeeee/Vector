import { NextRequest, NextResponse } from "next/server";
import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";

/**
 * GET /api/charts/download?icao=SADF&categoria=IACs&archivo=ILS+RWY+05.pdf
 *
 * Streamea el PDF que sirve `GET /charts/{icao}/{categoria}/{archivo}` del backend.
 * Existe **sólo** porque un `<a href>` lo abre el navegador directo, sin pasar por
 * `apiFetch` — así que el token que vive en la cookie `httpOnly` tiene que salir
 * acá, del lado del servidor, y no en el cliente.
 *
 * El backend ya decide todo lo que importa —`jeppesen_access`, que la ruta no se
 * escape de la carpeta configurada—; esto no repite ninguna de esas reglas, sólo
 * las cruza para el navegador.
 *
 * `TIMEOUT_IMAGEN_MS` y no el default: un PDF de Jeppesen pesa más que una
 * respuesta JSON típica, y cortar a los 15 s cortaría descargas que iban a
 * terminar bien.
 *
 * Se reenvía `Range` en las dos direcciones — lo que le permite a un visor de PDF
 * pedir de a partes en vez de bajar el archivo entero antes de mostrar la primera
 * página.
 */
export async function GET(req: NextRequest) {
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Necesitás iniciar sesión" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase();
  const categoria = searchParams.get("categoria");
  const archivo = searchParams.get("archivo");
  if (!icao || !categoria || !archivo) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const rango = req.headers.get("range");
  const ruta = `/charts/${encodeURIComponent(icao)}/${encodeURIComponent(categoria)}/${encodeURIComponent(archivo)}`;

  let res: Response;
  try {
    res = await apiFetch(
      ruta,
      /*
        `next: { revalidate: 0 }` pisa el `next: { revalidate: 20 }` por defecto de
        `apiFetch` entero, en vez de mezclar `cache: "no-store"` en el mismo objeto
        — las dos formas juntas son justo la combinación que Next marca como
        conflictiva. Hace falta pisarlo: Next cachea por URL sin distinguir el
        header `Range`, así que una respuesta parcial guardada en caché podría
        servirse después como si fuera el archivo entero.
      */
      { headers: rango ? { Range: rango } : {}, next: { revalidate: 0 } },
      { timeoutMs: TIMEOUT_IMAGEN_MS }
    );
  } catch {
    return NextResponse.json({ error: "No se pudo obtener la carta" }, { status: 502 });
  }

  if (res.status === 401 || res.status === 403) {
    return NextResponse.json({ error: "No tenés acceso a las cartas Jeppesen" }, { status: 403 });
  }
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "Carta no encontrada" }, { status: res.status === 404 ? 404 : 502 });
  }

  // Sólo el subconjunto de cabeceras que hace falta para servir un PDF y para que
  // el rango funcione — copiar todo lo que mande el backend traería de paso cosas
  // que acá no aplican, como el `Vary` de CORS que Litestar agrega para su propio
  // origen y que en el proxy del frontend sería ruido.
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") || "application/pdf",
    "Content-Disposition": res.headers.get("content-disposition") || `inline; filename="${archivo}"`,
    // Es contenido pago y por-piloto: nada de caches compartidas en el medio.
    "Cache-Control": "private, max-age=3600",
  });
  for (const clave of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const valor = res.headers.get(clave);
    if (valor) headers.set(clave, valor);
  }

  return new NextResponse(res.body, { status: res.status, headers });
}

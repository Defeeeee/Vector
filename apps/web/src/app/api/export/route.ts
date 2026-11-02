import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";

/**
 * D1 — "Descargá todo lo que Vector tiene tuyo".
 *
 * La contrapartida del borrado de cuentas, que ya funciona. Cuando la política
 * de privacidad esté publicada, un piloto puede pedir sus datos y esto es la
 * respuesta: un JSON con todo, no un PDF para imprimir. El libro en PDF sigue
 * existiendo aparte, con otro propósito.
 *
 * Sale por la sesión del propio piloto, no con service role: lo que se exporta
 * es exactamente lo que ese usuario puede ver, ni un registro más. Si mañana
 * cambia una policy de RLS, la exportación cambia con ella sola.
 */

/** Cada recurso se pide por separado; uno que falle no debe vaciar el resto. */
const RECURSOS: Array<[clave: string, ruta: string]> = [
  ["perfil", "/profiles"],
  ["aeronaves", "/aircraft"],
  ["libros", "/logbooks"],
  ["vuelos", "/flights"],
  ["documentos", "/documents"],
  ["paquetes", "/flight-packs"],
  ["transacciones", "/transactions"],
  // La red social: el @, a quién seguís, quién te sigue, lo que publicaste y lo que
  // comentaste. Las URLs de las fotos son firmadas y vencen a las pocas horas: bajalas
  // si las querés guardar.
  ["perfil_publico", "/perfil-publico"],
  ["siguiendo", "/social/siguiendo"],
  ["seguidores", "/social/seguidores"],
  ["publicaciones", "/red/mis-publicaciones"],
  ["comentarios", "/red/mis-comentarios"],
  // A quiénes bloqueaste. Los reportes no: se escriben y no se leen, ni el propio.
  ["bloqueados", "/social/bloqueados"],
];

export async function GET() {
  // Corte propio y no delegado al backend. Sin esto, un backend caído hace que
  // todas las llamadas fallen por red y la ruta devuelva un archivo vacío con
  // 200, sin haber comprobado nunca quién pregunta.
  if (!(await getSessionToken())) {
    return NextResponse.json({ error: "Necesitás iniciar sesión" }, { status: 401 });
  }

  const datos: Record<string, unknown> = {};
  const incompletos: string[] = [];

  for (const [clave, ruta] of RECURSOS) {
    try {
      const res = await apiFetch(ruta);
      if (res.status === 401) {
        return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
      }
      if (!res.ok) {
        incompletos.push(clave);
        continue;
      }
      datos[clave] = await res.json();
    } catch {
      incompletos.push(clave);
    }
  }

  // Si no se pudo traer **nada**, no se entrega un archivo vacío: el piloto se
  // llevaría un JSON de dos líneas creyendo que eso es todo lo que Vector tiene
  // suyo. Mejor fallar fuerte y que lo reintente.
  if (Object.keys(datos).length === 0) {
    return NextResponse.json(
      { error: "No se pudo exportar ningún dato. Probá de nuevo en un momento." },
      { status: 502 }
    );
  }

  // Una exportación a la que le falta una parte y no lo dice es peor que una que
  // falla entera: el piloto se lleva un archivo creyendo que está completo.
  const cuerpo = {
    exportado_el: new Date().toISOString(),
    aplicacion: "Vector",
    ...datos,
    ...(incompletos.length ? { _no_se_pudieron_exportar: incompletos } : {}),
  };

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(cuerpo, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="vector-mis-datos-${fecha}.json"`,
      // Datos personales: que no queden en ninguna caché intermedia.
      "Cache-Control": "no-store, private",
    },
  });
}

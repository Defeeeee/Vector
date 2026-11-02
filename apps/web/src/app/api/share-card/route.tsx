import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";
import { datosTarjeta, parseTiles } from "@/lib/share-card";
import { COLOR, MarcaVector, RESPLANDOR, cargarFuentes } from "@/lib/imagen-tarjeta";
import type { Aircraft, Flight, Logbook } from "@/types";

/**
 * La tarjeta de estadísticas, como PNG.
 *
 * ---------------------------------------------------------------------------
 * De dónde salen los números
 * ---------------------------------------------------------------------------
 * **De la sesión, en el servidor. Nunca del query string.** La URL sólo dice *qué
 * fichas* mostrar. Dos motivos: un número en la URL es falsificable —y esta imagen
 * se comparte como si fuera un dato— y una tarjeta parametrizada por id de piloto
 * sería una fuga de datos de cualquiera que adivine un id.
 *
 * Por lo mismo, acá **no se agrega nunca un parámetro `user_id`** "por si algún día
 * queremos una tarjeta pública". Una tarjeta pública necesita su propio modelo de
 * amenaza; colgarle una identidad a la ruta autenticada es exactamente cómo se filtra.
 * La que existe es otra ruta con otro modelo: `/u/[handle]/opengraph-image`, que sólo
 * lee los agregados que el backend decide mostrarle a un anónimo.
 *
 * ---------------------------------------------------------------------------
 * Contra qué hay que pelear acá adentro
 * ---------------------------------------------------------------------------
 * Satori entiende **un subconjunto de CSS**. Nada de lo que hay en `globals.css`
 * sirve: no hay variables CSS, no hay clases de Tailwind, no hay grid, no hay
 * `filter: blur()`. **No se puede importar ningún componente de la app.**
 *
 * Así que esto es un archivo aislado que *imita* el sistema de diseño con estilos
 * en línea y hex literales. Esa duplicación es inevitable y está asumida: no
 * intentes reusar `Card` acá. Lo que sí se comparte —colores, fuentes y la marca—
 * vive en `src/lib/imagen-tarjeta.tsx`, escrito para satori desde el principio.
 *
 * Y la trampa número uno: **todo contenedor con más de un hijo necesita
 * `display: "flex"` explícito**, o satori tira "Expected <div> to have explicit
 * display" — en runtime, no en el build.
 */

export const runtime = "nodejs";

const TAMANO = 1080;

export async function GET(req: NextRequest) {
  // Primero la sesión y después el trabajo, igual que `/api/export`: sin esto un
  // backend caído devolvería un 200 con una tarjeta vacía sin haber comprobado
  // nunca quién estaba preguntando.
  const token = await getSessionToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  // `cache: "no-store"` y no el `revalidate: 20` que `apiFetch` pone por defecto en
  // los GET. Un piloto que registra un vuelo y comparte enseguida se llevaría un
  // total viejo **en una imagen que ya no puede volver atrás**. `apiFetch` esparce
  // las opciones después del default, así que esto gana.
  // Presupuesto propio, más largo que el de una página: con `no-store` estas dos van
  // siempre al backend en frío, y el camino completo se midió en **12,6 s** contra
  // producción. Con el timeout de página quedaban abortadas y la tarjeta salía 502.
  const [dashRes, lbRes] = await Promise.all([
    apiFetch("/dashboard", { cache: "no-store" }, { timeoutMs: TIMEOUT_IMAGEN_MS }),
    apiFetch("/logbooks", { cache: "no-store" }, { timeoutMs: TIMEOUT_IMAGEN_MS }),
  ]);
  if (dashRes.status === 401 || lbRes.status === 401) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!dashRes.ok) return new Response("Backend error", { status: 502 });

  const data = await dashRes.json();
  const flights: Flight[] = data.flights || [];
  const aircraft: Aircraft[] = data.aircraft || [];
  const logbooks: Logbook[] = lbRes.ok ? await lbRes.json() : [];
  const nombre = (data.profile?.first_name || "").trim();

  const ids = parseTiles(req.nextUrl.searchParams.get("tiles"));
  const { horas, tiles } = datosTarjeta({ ids, flights, logbooks, aircraft });

  // Falla ruidosa y no una tarjeta en la tipografía que venga: una imagen que no se
  // parece a Vector se comparte igual y nadie se entera de que está mal. El smoke
  // le pega a esta ruta justamente para que un `.ttf` faltante no llegue a producción.
  let fonts;
  try {
    fonts = await cargarFuentes();
  } catch (err) {
    console.error("No se pudieron leer las fuentes de la tarjeta:", err);
    return new Response("Font assets missing", { status: 500 });
  }

  // El entero grande y los decimales apagados, misma lectura que el odómetro del
  // resumen.
  const [entero, decimal = "0"] = horas.split(".");

  return new ImageResponse(
    (
      <div
        style={{
          width: TAMANO,
          height: TAMANO,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: COLOR.fondo,
          backgroundImage: RESPLANDOR,
          fontFamily: "Nunito",
        }}
      >
        {/* Marca ------------------------------------------------------------- */}
        <MarcaVector />

        {/* El número ---------------------------------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontFamily: "PlexMono",
              fontSize: 26,
              letterSpacing: 3,
              color: COLOR.tenue,
              marginBottom: 12,
            }}
          >
            TOTAL DE HORAS
          </span>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: 230, fontWeight: 800, color: COLOR.acento, lineHeight: 1 }}>
              {entero}
            </span>
            <span style={{ fontSize: 230, fontWeight: 800, color: COLOR.masTenue, lineHeight: 1 }}>
              .{decimal}
            </span>
            <span style={{ fontSize: 56, fontWeight: 800, color: COLOR.masTenue, marginLeft: 16 }}>
              hs
            </span>
          </div>
        </div>

        {/* Las fichas --------------------------------------------------------- */}
        <div style={{ display: "flex", gap: 16 }}>
          {tiles.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                border: `1px solid ${COLOR.borde}`,
                borderRadius: 28,
                padding: "26px 22px",
              }}
            >
              <span
                style={{
                  fontFamily: "PlexMono",
                  fontSize: 19,
                  letterSpacing: 2,
                  color: COLOR.tenue,
                  marginBottom: 10,
                }}
              >
                {t.label.toUpperCase()}
              </span>
              <span style={{ fontFamily: "PlexMono", fontSize: 52, color: COLOR.texto }}>
                {t.value}
              </span>
            </div>
          ))}
        </div>

        {/* Pie ---------------------------------------------------------------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Sólo el nombre de pila: la tarjeta va a un grupo, y un apellido no
              suma nada y no se puede des-compartir. */}
          <span style={{ fontFamily: "PlexMono", fontSize: 24, color: COLOR.masTenue }}>
            {nombre || "Piloto"}
          </span>
          <span style={{ fontFamily: "PlexMono", fontSize: 24, color: COLOR.masTenue }}>
            vector.fdiaznem.com.ar
          </span>
        </div>
      </div>
    ),
    {
      width: TAMANO,
      height: TAMANO,
      fonts,
      headers: {
        // Datos personales: que no queden en ninguna caché intermedia. Mismo
        // criterio que `/api/export`.
        "Cache-Control": "private, no-store",
      },
    }
  );
}

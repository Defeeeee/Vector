import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSessionToken } from "@/actions/auth";
import { cargarFuentes } from "@/lib/imagen-tarjeta";
import { MARCA_FLECHA, MARCA_PROPORCION, MARCA_TEXTO, MARCA_VIEWBOX } from "@/lib/marca-svg";
import { SITIO_HOST } from "@/lib/sitio";
import { anioDeLaUrl, cargarTuAno } from "@/lib/tu-ano-servidor";
import { formatearNumero, proyectarPuntos } from "@/lib/tu-ano";
import { ESQUEMAS, esquemaDe, type Esquema } from "@/lib/tu-ano-esquemas";

/**
 * "Mi año en vuelo" como PNG de 1080 × 1920 (historia de Instagram).
 *
 * De dónde salen los números: **de la sesión, en el servidor** (invariante 10, mismo criterio
 * que `/api/share-card`). La URL dice sólo `anio` —un entero que además tiene que ser uno de
 * los años con vuelos del piloto— y `esquema`, de una lista blanca. Nada de `user_id`.
 *
 * Lo compartible no lleva matrícula, nombre completo ni mail (invariante 14): las cifras, el
 * vuelo más largo como ruta y horas, el tipo de avión y el mapa de puntos de aeródromos.
 *
 * Satori: estilos en línea, sin clases ni variables CSS, sin grid, y `display: flex` explícito
 * en todo contenedor con más de un hijo (ver `/api/share-card`).
 */

export const runtime = "nodejs";

const ANCHO = 1080;
const ALTO = 1920;
const PAD = 84;
const MAPA_W = ANCHO - 2 * PAD;
/** El alto del mapa cuando no hay nada más abajo; se achica con la segunda fila de cifras y cada avión. */
const MAPA_H_MAX = 470;

function Marca({ e, tamano }: { e: Esquema; tamano: number }) {
  const alto = Math.round(tamano * 0.8);
  return (
    <svg width={Math.round(alto * MARCA_PROPORCION)} height={alto} viewBox={MARCA_VIEWBOX}>
      <polygon points={MARCA_FLECHA[0]} fill={e.texto} />
      <polygon points={MARCA_FLECHA[1]} fill={e.acento} />
      <path transform={MARCA_TEXTO.transform} d={MARCA_TEXTO.d} fill={e.texto} />
    </svg>
  );
}

const recortar = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

export async function GET(req: NextRequest) {
  const token = await getSessionToken();
  if (!token) return new Response("Unauthorized", { status: 401 });

  const anioPedido = anioDeLaUrl(req.nextUrl.searchParams.get("anio"));
  if (req.nextUrl.searchParams.has("anio") && anioPedido === null) {
    return new Response("Año inválido", { status: 400 });
  }
  const esquema = ESQUEMAS[esquemaDe(req.nextUrl.searchParams.get("esquema"))];

  const r = await cargarTuAno(anioPedido, true);
  if (r.estado === "sin-sesion") return new Response("Unauthorized", { status: 401 });
  if (r.estado === "error") return new Response("Backend error", { status: 502 });
  // Sólo un año con vuelos: no hay "tu año" que compartir si no hubo año.
  if (!r.anios.includes(r.datos.anio)) return new Response("Sin vuelos en ese año", { status: 404 });
  const t = r.datos;

  let fonts;
  try {
    fonts = await cargarFuentes();
  } catch (err) {
    console.error("No se pudieron leer las fuentes de la imagen del año:", err);
    return new Response("Font assets missing", { status: 500 });
  }

  const [entero, decimal = "0"] = formatearNumero(t.horas, 1).split(",");
  // El mapa ocupa lo que sobra: cada fila de cifras y cada avión de más le sacan alto (satori no
  // achica un <svg> para que entre, así que se calcula acá).
  // Sin "vuelo más largo" (Federico, 2026-11-15: "en vez de vuelo más largo, un mapa bien simple
  // con todos los vuelos"), el mapa se queda con ese lugar.
  const MAPA_H = Math.max(220, MAPA_H_MAX - 60 - 62 * Math.max(0, t.aviones.length - 1));
  const xy = proyectarPuntos(t.mapa.puntos, MAPA_W, MAPA_H, 56);
  // Los códigos de los aeródromos, del más visitado al menos, sólo si no pisan a uno ya rotulado.
  const rotulados: number[] = [];
  for (const i of t.mapa.puntos.map((_, i) => i).sort((a, b) => t.mapa.puntos[b].visitas - t.mapa.puntos[a].visitas)) {
    if (rotulados.length >= 8) break;
    if (rotulados.every((j) => Math.abs(xy[i].x - xy[j].x) > 120 || Math.abs(xy[i].y - xy[j].y) > 40)) rotulados.push(i);
  }
  const iBase = t.base ? t.mapa.puntos.findIndex((p) => p.codigo === t.base!.codigo) : -1;
  const rotulo = { fontFamily: "PlexMono", fontSize: 24, letterSpacing: 3, color: esquema.tenue } as const;

  // Dos filas de cifras (Federico, 2026-11-15: "tiene pocas cosas").
  const filas = [
    [
      { etiqueta: "VUELOS", valor: formatearNumero(t.vuelos) },
      { etiqueta: "AERÓDROMOS", valor: formatearNumero(t.aerodromos) },
      t.distanciaNm > 0 ? { etiqueta: "MILLAS NÁUTICAS", valor: formatearNumero(t.distanciaNm) } : { etiqueta: "DÍAS VOLANDO", valor: formatearNumero(t.dias) },
    ],
    [
      { etiqueta: "ATERRIZAJES", valor: formatearNumero(t.aterrizajes) },
      ...(t.distanciaNm > 0 ? [{ etiqueta: "DÍAS VOLANDO", valor: formatearNumero(t.dias) }] : []),
      ...(t.mesTop ? [{ etiqueta: "MEJOR MES", valor: t.mesTop.nombre.charAt(0).toUpperCase() + t.mesTop.nombre.slice(1, 3) }] : []),
    ],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: ANCHO,
          height: ALTO,
          display: "flex",
          flexDirection: "column",
          gap: 48,
          padding: PAD,
          backgroundColor: esquema.fondo,
          backgroundImage: esquema.degrade,
          fontFamily: "Display",
          color: esquema.texto,
        }}
      >
        {/* Título ------------------------------------------------------------ */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...rotulo, color: esquema.acento, marginBottom: 20 }}>TU AÑO EN VUELO</span>
          <span style={{ fontSize: 120, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }}>{`Mi ${t.anio}`}</span>
          <span style={{ fontSize: 120, fontWeight: 800, letterSpacing: -5, lineHeight: 1, color: esquema.acento }}>en vuelo</span>
        </div>

        {/* Las horas ---------------------------------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...rotulo, marginBottom: 6 }}>HORAS VOLADAS</span>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: 250, fontWeight: 800, letterSpacing: -12, lineHeight: 1.08, color: esquema.texto }}>{entero}</span>
            <span style={{ fontSize: 250, fontWeight: 800, letterSpacing: -12, lineHeight: 1.08, color: esquema.acento }}>{`,${decimal}`}</span>
            <span style={{ fontSize: 64, fontWeight: 800, marginLeft: 20, color: esquema.tenue }}>hs</span>
          </div>
        </div>

        {/* Las cifras, en dos filas de tres --------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {filas.map((fila, k) => (
            <div key={k} style={{ display: "flex", gap: 36 }}>
              {[0, 1, 2].map((i) => {
                const f = fila[i];
                return f ? (
                  <div key={f.etiqueta} style={{ display: "flex", flexDirection: "column", flex: 1, borderTop: `3px solid ${esquema.linea}`, paddingTop: 22 }}>
                    <span style={{ ...rotulo, fontSize: 20, marginBottom: 8 }}>{f.etiqueta}</span>
                    <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{f.valor}</span>
                  </div>
                ) : (
                  <div key={`vacio-${i}`} style={{ display: "flex", flex: 1 }} />
                );
              })}
            </div>
          ))}
        </div>

        {/* El mapa ------------------------------------------------------------ */}
        {t.mapa.puntos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", borderTop: `3px solid ${esquema.linea}`, paddingTop: 22, paddingBottom: 30 }}>
            <div style={{ display: "flex", position: "relative", width: MAPA_W, height: MAPA_H }}>
            <svg width={MAPA_W} height={MAPA_H} viewBox={`0 0 ${MAPA_W} ${MAPA_H}`} style={{ position: "absolute", left: 0, top: 0 }}>
              {t.mapa.tramos.map(([a, b], i) => (
                <line key={i} x1={xy[a].x} y1={xy[a].y} x2={xy[b].x} y2={xy[b].y} stroke={esquema.acento2} strokeWidth={4} strokeLinecap="round" opacity={0.85} />
              ))}
              {xy.map((p, i) => (
                <circle key={`c${i}`} cx={p.x} cy={p.y} r={i === iBase ? 15 : 9} fill={i === iBase ? esquema.acento : esquema.texto} />
              ))}
              {iBase >= 0 && <circle cx={xy[iBase].x} cy={xy[iBase].y} r={30} fill="none" stroke={esquema.acento} strokeWidth={3} />}
            </svg>
            {/* Los códigos van como texto encima: satori no dibuja <text> adentro de un <svg>. */}
            {rotulados.map((i) => {
              const derecha = xy[i].x < MAPA_W - 160;
              const separacion = i === iBase ? 40 : 18;
              return (
                <span
                  key={`t${i}`}
                  style={{
                    position: "absolute",
                    top: xy[i].y - 16,
                    ...(derecha ? { left: xy[i].x + separacion } : { right: MAPA_W - xy[i].x + separacion }),
                    fontFamily: "PlexMono",
                    fontSize: 24,
                    color: i === iBase ? esquema.acento : esquema.tenue,
                  }}
                >
                  {t.mapa.puntos[i].codigo}
                </span>
              );
            })}
            </div>
            {t.base && (
              <span style={{ ...rotulo, fontSize: 22, marginTop: 14 }}>{`TU BASE · ${t.base.codigo}`}</span>
            )}
          </div>
        )}

        {/* Los aviones ------------------------------------------------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Los aviones más volados, con matrícula (Federico, 2026-11-15). */}
          {t.aviones.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ ...rotulo, fontSize: 20, marginBottom: 10 }}>{t.aviones.length === 1 ? "TU AVIÓN" : "TUS AVIONES"}</span>
              {t.aviones.map((a, i) => (
                <div key={a.matricula} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginTop: i ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                    <span style={{ fontSize: i === 0 ? 52 : 40, fontWeight: 800, letterSpacing: -1.5, color: i === 0 ? esquema.acento : esquema.texto }}>{a.matricula}</span>
                    <span style={{ fontFamily: "PlexMono", fontSize: 24, color: esquema.tenue }}>{recortar(a.tipo, 22)}</span>
                  </div>
                  <span style={{ fontSize: i === 0 ? 44 : 36, fontWeight: 800, letterSpacing: -1 }}>{`${formatearNumero(a.horas, 1)} h`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie ---------------------------------------------------------------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Marca e={esquema} tamano={72} />
          <span style={{ fontFamily: "PlexMono", fontSize: 28, color: esquema.tenue }}>{SITIO_HOST}</span>
        </div>
      </div>
    ),
    {
      width: ANCHO,
      height: ALTO,
      fonts,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

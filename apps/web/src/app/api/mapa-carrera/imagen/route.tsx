import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getSessionToken } from "@/actions/auth";
import { cargarFuentes } from "@/lib/imagen-tarjeta";
import { MARCA_FLECHA, MARCA_PROPORCION, MARCA_TEXTO, MARCA_VIEWBOX } from "@/lib/marca-svg";
import { SITIO_HOST } from "@/lib/sitio";
import { cargarMapaCarrera } from "@/lib/mapa-carrera-servidor";
import { crearProyeccion, grosorDePierna, radioDeAerodromo } from "@/lib/mapa-carrera";
import { CONTORNO_ARGENTINA } from "@/lib/contorno-argentina";
import { formatearNumero } from "@/lib/tu-ano";
import { ESQUEMAS, esquemaDe, type Esquema } from "@/lib/tu-ano-esquemas";

/**
 * "Mi mapa de vuelo" como PNG: 1080 × 1350 (post) o 1080 × 1920 (historia).
 *
 * De dónde salen los números: **de la sesión, en el servidor** (invariante 10, mismo criterio
 * que `/api/tu-ano/imagen`). La URL trae sólo filtros —`anio` y `avion`, que además tienen que ser
 * un año y un avión del piloto—, `formato` y `esquema`, de listas blancas. Nada de `user_id`.
 *
 * Lleva las matrículas de los aviones más volados (Federico lo aceptó para "Tu año") pero no el
 * nombre. Sin teselas: un contorno esquemático de la Argentina con los puntos y las líneas
 * proyectados, y los códigos como texto encima (satori no dibuja `<text>` adentro de un `<svg>`).
 *
 * Satori: estilos en línea, sin clases ni variables CSS, sin grid, y `display: flex` explícito en
 * todo contenedor con más de un hijo.
 */

export const runtime = "nodejs";

const ANCHO = 1080;
const PAD = 84;
const MAPA_W = ANCHO - 2 * PAD;
const ALTOS = { post: 1350, historia: 1920 } as const;

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

  const p = req.nextUrl.searchParams;
  const formatoPedido = p.get("formato");
  if (formatoPedido && formatoPedido !== "post" && formatoPedido !== "historia") return new Response("Formato inválido", { status: 400 });
  const formato: keyof typeof ALTOS = formatoPedido === "historia" ? "historia" : "post";
  const ALTO = ALTOS[formato];
  const esquema = ESQUEMAS[esquemaDe(p.get("esquema"))];

  const r = await cargarMapaCarrera(p.get("anio"), p.get("avion"), true);
  if (r.estado === "sin-sesion") return new Response("Unauthorized", { status: 401 });
  if (r.estado === "error") return new Response("Backend error", { status: 502 });
  // Un año o un avión que no son del piloto no se dibujan (y no se ignoran en silencio).
  if (r.invalido) return new Response("Filtro inválido", { status: 400 });
  const t = r.datos;
  if (t.aerodromos.length === 0) return new Response("Sin vuelos para dibujar", { status: 404 });

  let fonts;
  try {
    fonts = await cargarFuentes();
  } catch (err) {
    console.error("No se pudieron leer las fuentes de la imagen del mapa:", err);
    return new Response("Font assets missing", { status: 500 });
  }

  // Qué filtro dice la imagen: el año, el avión o "toda mi carrera".
  const avionFiltrado = t.filtros.avionId ? r.opciones.aviones.find((a) => a.id === t.filtros.avionId) : null;
  const subtitulo = [t.filtros.anio !== null ? String(t.filtros.anio) : "Toda mi carrera", avionFiltrado ? avionFiltrado.matricula || avionFiltrado.tipo : null]
    .filter(Boolean)
    .join(" · ");

  const cifras = [
    { etiqueta: "VUELOS", valor: formatearNumero(t.cifras.vuelos) },
    { etiqueta: "AERÓDROMOS", valor: formatearNumero(t.cifras.aerodromos) },
    ...(t.cifras.distanciaNm > 0 ? [{ etiqueta: "MILLAS", valor: formatearNumero(t.cifras.distanciaNm) }] : []),
    ...(t.cifras.provincias.length > 0 ? [{ etiqueta: "PROVINCIAS", valor: formatearNumero(t.cifras.provincias.length) }] : []),
  ];
  // Los aviones más volados, sólo si no se filtró por uno (sería repetir el subtítulo).
  const aviones = avionFiltrado ? [] : t.aviones;

  // El alto del mapa es lo que sobra: título, cifras, aviones y pie le sacan lugar (satori no
  // achica un <svg> para que entre, así que se calcula acá).
  const FIJO = 270 + 120 + 80 + 40 * (aviones.length ? 4 : 3);
  const MAPA_H = Math.max(300, ALTO - 2 * PAD - FIJO - (aviones.length ? 40 + 56 * aviones.length : 0));

  const proyeccion = crearProyeccion(t.aerodromos, MAPA_W, MAPA_H, 64);
  const xy = t.aerodromos.map((a) => proyeccion(a.lat, a.lon));
  const contorno = CONTORNO_ARGENTINA.map((poli) => poli.map(([lat, lon]) => proyeccion(lat, lon)).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "));
  const maxV = t.aerodromos[0].visitas;
  const radio = (i: number) => radioDeAerodromo(t.aerodromos[i].visitas, maxV, 7, 22);

  // Los códigos, del más visitado al menos, sólo si no pisan a uno ya rotulado ni se salen del mapa.
  const rotulados: number[] = [];
  for (let i = 0; i < t.aerodromos.length && rotulados.length < 10; i++) {
    if (xy[i].x < 0 || xy[i].x > MAPA_W || xy[i].y < 0 || xy[i].y > MAPA_H) continue;
    if (rotulados.every((j) => Math.abs(xy[i].x - xy[j].x) > 130 || Math.abs(xy[i].y - xy[j].y) > 40)) rotulados.push(i);
  }
  const rotulo = { fontFamily: "PlexMono", fontSize: 24, letterSpacing: 3, color: esquema.tenue } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: ANCHO,
          height: ALTO,
          display: "flex",
          flexDirection: "column",
          gap: 40,
          padding: PAD,
          backgroundColor: esquema.fondo,
          backgroundImage: esquema.degrade,
          fontFamily: "Display",
          color: esquema.texto,
        }}
      >
        {/* Título ------------------------------------------------------------ */}
        <div style={{ display: "flex", flexDirection: "column", height: 270 - 40 }}>
          <span style={{ ...rotulo, color: esquema.acento, marginBottom: 18 }}>{recortar(subtitulo.toUpperCase(), 40)}</span>
          <span style={{ fontSize: 112, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }}>Mi mapa</span>
          <span style={{ fontSize: 112, fontWeight: 800, letterSpacing: -5, lineHeight: 1, color: esquema.acento }}>de vuelo</span>
        </div>

        {/* El mapa ------------------------------------------------------------ */}
        <div style={{ display: "flex", position: "relative", width: MAPA_W, height: MAPA_H }}>
          <svg width={MAPA_W} height={MAPA_H} viewBox={`0 0 ${MAPA_W} ${MAPA_H}`} style={{ position: "absolute", left: 0, top: 0 }}>
            {contorno.map((pts, i) => (
              <polygon key={`p${i}`} points={pts} fill={esquema.linea} fillOpacity={0.35} stroke={esquema.tenue} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {t.piernas.map((l, i) => (
              <line key={`l${i}`} x1={xy[l.a].x} y1={xy[l.a].y} x2={xy[l.b].x} y2={xy[l.b].y} stroke={esquema.acento2} strokeWidth={grosorDePierna(l.veces, 2.5, 11)} strokeLinecap="round" opacity={Math.min(0.9, 0.45 + l.veces * 0.07)} />
            ))}
            {xy.map((q, i) => (
              <circle key={`c${i}`} cx={q.x} cy={q.y} r={radio(i)} fill={i === 0 ? esquema.acento : esquema.texto} />
            ))}
            <circle cx={xy[0].x} cy={xy[0].y} r={radio(0) + 12} fill="none" stroke={esquema.acento} strokeWidth={3} />
          </svg>
          {rotulados.map((i) => {
            const derecha = xy[i].x < MAPA_W - 170;
            const separacion = radio(i) + (i === 0 ? 20 : 8);
            return (
              <span
                key={`t${i}`}
                style={{
                  position: "absolute",
                  top: xy[i].y - 16,
                  ...(derecha ? { left: xy[i].x + separacion } : { right: MAPA_W - xy[i].x + separacion }),
                  fontFamily: "PlexMono",
                  fontSize: 24,
                  color: i === 0 ? esquema.acento : esquema.texto,
                }}
              >
                {t.aerodromos[i].codigo}
              </span>
            );
          })}
        </div>

        {/* Las cifras --------------------------------------------------------- */}
        <div style={{ display: "flex", gap: 32 }}>
          {cifras.map((f) => (
            <div key={f.etiqueta} style={{ display: "flex", flexDirection: "column", flex: 1, borderTop: `3px solid ${esquema.linea}`, paddingTop: 20 }}>
              <span style={{ ...rotulo, fontSize: 19, marginBottom: 8 }}>{f.etiqueta}</span>
              <span style={{ fontSize: cifras.length > 3 ? 62 : 76, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{f.valor}</span>
            </div>
          ))}
        </div>

        {/* Los aviones, con matrícula ---------------------------------------- */}
        {aviones.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ ...rotulo, fontSize: 19, marginBottom: 10 }}>{aviones.length === 1 ? "TU AVIÓN" : "TUS AVIONES"}</span>
            {aviones.map((a, i) => (
              <div key={a.matricula} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginTop: i ? 8 : 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                  <span style={{ fontSize: i === 0 ? 46 : 38, fontWeight: 800, letterSpacing: -1.5, color: i === 0 ? esquema.acento : esquema.texto }}>{a.matricula}</span>
                  <span style={{ fontFamily: "PlexMono", fontSize: 22, color: esquema.tenue }}>{recortar(a.tipo, 22)}</span>
                </div>
                <span style={{ fontSize: i === 0 ? 40 : 34, fontWeight: 800, letterSpacing: -1 }}>{`${formatearNumero(a.horas, 1)} h`}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pie ---------------------------------------------------------------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
          <Marca e={esquema} tamano={72} />
          <span style={{ fontFamily: "PlexMono", fontSize: 28, color: esquema.tenue }}>{SITIO_HOST}</span>
        </div>
      </div>
    ),
    { width: ANCHO, height: ALTO, fonts, headers: { "Cache-Control": "private, no-store" } }
  );
}

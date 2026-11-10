import { ImageResponse } from "next/og";
import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { getSessionToken } from "@/actions/auth";
import { allAirports } from "@/lib/airports";
import { COLOR, MarcaVector, cargarFuentes } from "@/lib/imagen-tarjeta";
import { aerodromoCercano, hhmmArgentina, type RecorridoCompacto, type ResumenRecorrido } from "@/lib/recorrido";
import { ESCALA, TILE, encuadrar, proyectar, tramos } from "@/lib/recorrido-imagen";
import { fechaDeVuelo, rutaLegible } from "@/lib/social";
import type { Aircraft, Flight } from "@/types";

/**
 * El recorrido real de un vuelo como imagen para compartir (2.37.0), 1080 × 1350: el mapa de
 * fondo, el recorrido coloreado por altura y los números de la tarjeta del vuelo.
 *
 * Como `/api/share-card` (invariante 10): **todo sale de la sesión**. El id dice qué vuelo, y
 * el backend sólo devuelve el recorrido de un vuelo del piloto. **Nunca la matrícula**, como
 * en la red: la imagen se comparte, y matrícula, aeródromo y hora dicen dónde está un avión.
 *
 * Los tiles son los de OSM (`lib/mapa-tiles.ts`), pedidos desde el server con un User-Agent
 * que dice quién pide, guardados una semana por el cache de Next, y con la atribución en la
 * imagen, como pide su política. Si alguno no llega, ese pedazo queda del color del fondo.
 */

export const runtime = "nodejs";

const ANCHO = 1080;
const ALTO = 1350;
/** Donde entra el recorrido: arriba quedan la marca, abajo los números. */
const CAJA = { x: 90, y: 170, ancho: 900, alto: 690 };
const LADO = TILE * ESCALA;

const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

let argentinos: { icao: string; lat?: number | null; lon?: number | null }[] | null = null;
const aerodromos = () => (argentinos ??= allAirports().filter((a) => a.country === "AR"));

async function tile(z: number, x: number, y: number): Promise<string | null> {
  try {
    const r = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": "Vector/2 (+https://vector.fdiaznem.com.ar; bitacora de vuelo)" },
      next: { revalidate: 7 * 86400 },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getSessionToken();
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) return new Response("Not found", { status: 404 });

  const opciones = { timeoutMs: TIMEOUT_IMAGEN_MS };
  const [recRes, vueloRes, avionesRes] = await Promise.all([
    apiFetch(`/adsb/vuelos/${id}`, { cache: "no-store" }, opciones),
    apiFetch(`/flights/${id}`, { cache: "no-store" }, opciones),
    apiFetch("/aircraft", {}, opciones),
  ]);
  if ([recRes, vueloRes].some((r) => r.status === 401)) return new Response("Unauthorized", { status: 401 });
  if (!recRes.ok || !vueloRes.ok) return new Response("Not found", { status: 404 });
  const { recorrido, resumen } = (await recRes.json()) as { recorrido: RecorridoCompacto | null; resumen?: ResumenRecorrido };
  if (!recorrido || !resumen || recorrido.p.length < 2) return new Response("Not found", { status: 404 });
  const vuelo = (await vueloRes.json()) as Flight;
  const aviones: Aircraft[] = avionesRes.ok ? await avionesRes.json().catch(() => []) : [];
  const tipo = aviones.find((a) => a.id === vuelo.aircraft_id)?.type?.trim() || null;

  let fonts;
  try {
    fonts = await cargarFuentes();
  } catch (err) {
    console.error("No se pudieron leer las fuentes de la imagen del recorrido:", err);
    return new Response("Font assets missing", { status: 500 });
  }

  const puntos = recorrido.p.map(([, la, lo]) => [la, lo] as [number, number]);
  const e = encuadrar(puntos, ANCHO, ALTO, CAJA);
  const imagenes = await Promise.all(e.tiles.map((t) => tile(e.z, t.x, t.y)));
  const lineas = tramos(e, recorrido, resumen.altitud_max);
  const inicio = proyectar(e, ...puntos[0]);
  const fin = proyectar(e, ...puntos[puntos.length - 1]);

  const origen = aerodromoCercano(resumen.inicio, aerodromos());
  const destino = aerodromoCercano(resumen.fin, aerodromos());
  const ruta =
    rutaLegible(vuelo.route) ?? (origen && destino ? (origen === destino ? `${origen} · local` : `${origen} → ${destino}`) : "Vuelo");
  const detalle = [fechaDeVuelo(vuelo.date), tipo, `${hhmmArgentina(resumen.despegue)} → ${hhmmArgentina(resumen.aterrizaje)}`]
    .filter(Boolean)
    .join("  ·  ");
  const fichas: [string, string][] = [
    ["EN EL AIRE", `${resumen.minutos} min`],
    ["RECORRIDO", `${num(resumen.millas)} nm`],
    ["ALTURA MÁX.", resumen.altitud_max != null ? `${num(resumen.altitud_max)} ft` : "—"],
    ["VEL. MÁX.", resumen.velocidad_max != null ? `${resumen.velocidad_max} kt` : "—"],
  ];
  const fuente = recorrido.fuente === "adsb.lol" ? "adsb.lol (ODbL)" : "adsb.fi";

  return new ImageResponse(
    (
      <div style={{ width: ANCHO, height: ALTO, display: "flex", position: "relative", backgroundColor: COLOR.fondo, fontFamily: "Display" }}>
        {/* El mapa, apagado para que el recorrido sea lo que se ve. */}
        {e.tiles.map((t, i) =>
          imagenes[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={imagenes[i]!} width={LADO} height={LADO} style={{ position: "absolute", left: t.izq, top: t.arriba }} />
          ) : null
        )}
        <div style={{ position: "absolute", left: 0, top: 0, width: ANCHO, height: ALTO, backgroundColor: "rgba(10,10,12,0.58)" }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: ANCHO,
            height: ALTO,
            backgroundImage: "linear-gradient(to bottom, rgba(11,13,16,0.9) 0%, rgba(11,13,16,0) 13%, rgba(11,13,16,0) 60%, rgba(11,13,16,0.94) 74%, #0b0d10 100%)",
          }}
        />

        <svg width={ANCHO} height={ALTO} viewBox={`0 0 ${ANCHO} ${ALTO}`} style={{ position: "absolute", left: 0, top: 0 }}>
          {lineas.map((l, i) => (
            <path key={`h${i}`} d={l.d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {lineas.map((l, i) => (
            <path
              key={`l${i}`}
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={l.corte ? "3 14" : undefined}
            />
          ))}
          <circle cx={inicio[0]} cy={inicio[1]} r={12} fill="#22c55e" stroke="#ffffff" strokeWidth={4} />
          <circle cx={fin[0]} cy={fin[1]} r={12} fill="#ef4444" stroke="#ffffff" strokeWidth={4} />
        </svg>

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: ANCHO,
            height: ALTO,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px 64px 48px",
          }}
        >
          <MarcaVector tamano={56} />

          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "PlexMono", fontSize: 76, color: COLOR.texto, lineHeight: 1.05 }}>{ruta}</span>
            <span style={{ fontFamily: "PlexMono", fontSize: 26, color: COLOR.tenue, marginTop: 14 }}>{detalle}</span>

            <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
              {fichas.map(([t, v]) => (
                <div
                  key={t}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    border: `1px solid ${COLOR.borde}`,
                    borderRadius: 24,
                    padding: "20px 20px",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  <span style={{ fontFamily: "PlexMono", fontSize: 17, letterSpacing: 2, color: COLOR.tenue, marginBottom: 8 }}>{t}</span>
                  <span style={{ fontFamily: "PlexMono", fontSize: 36, color: COLOR.texto, whiteSpace: "nowrap" }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 34 }}>
              {/* OSM exige la atribución visible, y adsb.fi pide que se lo cite. */}
              <span style={{ fontFamily: "PlexMono", fontSize: 19, color: COLOR.masTenue }}>
                © OpenStreetMap · Recorrido: {fuente}
              </span>
              <span style={{ fontFamily: "PlexMono", fontSize: 21, color: COLOR.masTenue }}>vector.fdiaznem.com.ar</span>
            </div>
          </div>
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

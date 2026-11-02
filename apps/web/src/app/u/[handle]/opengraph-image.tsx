import { ImageResponse } from "next/og";
import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { COLOR, MarcaVector, RESPLANDOR, cargarFuentes } from "@/lib/imagen-tarjeta";
import { conArroba, normalizarHandle, problemaDelHandle } from "@/lib/handle";
import type { PilotoPublico } from "@/types";

/**
 * La vista previa del perfil: lo que aparece en WhatsApp cuando alguien pega el link
 * de `/u/<handle>`.
 *
 * **Siempre como anónimo** (`anonimo: true` en `apiFetch`), aunque la pida alguien con
 * sesión. Esta imagen la ve cualquiera que reciba el link, así que tiene que mostrar lo
 * que vería un desconocido: si el perfil es privado, sale sin horas, aunque quien la
 * generó sea un seguidor aceptado que sí las ve en la página.
 *
 * 1200×630, la proporción de las vistas previas grandes. La tarjeta cuadrada de
 * `/api/share-card` es otra cosa: la genera el piloto para su propia carrera, con
 * sesión.
 */

export const runtime = "nodejs";

/**
 * La foto de perfil, lista para la tarjeta, o `null` para seguir sin ella.
 *
 * **satori no lee WebP** —acepta PNG, JPEG, GIF y SVG—, y el backend guarda las fotos de
 * perfil en WebP. Se convierte con `sharp`, que ya está en el server porque Next lo usa
 * para las imágenes. Cualquier falla deja la tarjeta sin foto: una vista previa sin foto
 * es mucho mejor que ninguna.
 */
async function fotoParaTarjeta(url: string | null | undefined): Promise<string | null> {
  // En producción la URL es la del storage de Supabase, siempre https; `http` sólo
  // sirve para el backend falso de desarrollo.
  const esquemaValido = url?.startsWith("https://") || (process.env.NODE_ENV !== "production" && url?.startsWith("http://"));
  if (!url || !esquemaValido) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { default: sharp } = await import("sharp");
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(300, 300, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
export const alt = "Perfil de piloto en Vector";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const crudo = (await params).handle;
  let handle: string;
  try {
    handle = normalizarHandle(decodeURIComponent(crudo));
  } catch {
    handle = normalizarHandle(crudo);
  }

  let piloto: PilotoPublico | null = null;
  if (!problemaDelHandle(handle)) {
    const res = await apiFetch(
      `/publico/pilotos/${encodeURIComponent(handle)}`,
      { cache: "no-store" },
      { anonimo: true, timeoutMs: TIMEOUT_IMAGEN_MS }
    );
    piloto = res.ok ? await res.json() : null;
  }
  const [fonts, foto] = await Promise.all([cargarFuentes(), fotoParaTarjeta(piloto?.avatar_url)]);

  const horas = piloto?.horas ?? null;
  const [entero, decimal = "0"] = (horas?.total ?? 0).toFixed(1).split(".");

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: COLOR.fondo,
          backgroundImage: RESPLANDOR,
          fontFamily: "Nunito",
        }}
      >
        <MarcaVector tamano={52} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          {/* Quién es */}
          <div style={{ display: "flex", alignItems: "center", maxWidth: horas ? 640 : 860 }}>
            {foto && (
              <img
                src={foto}
                width={150}
                height={150}
                alt=""
                style={{ width: 150, height: 150, borderRadius: 75, marginRight: 32, border: `3px solid ${COLOR.borde}` }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
              <span style={{ fontSize: 56, fontWeight: 800, color: COLOR.texto, lineHeight: 1.1 }}>
                {piloto?.nombre_visible ?? "Piloto en Vector"}
              </span>
              {/* Un solo string y no dos expresiones: para satori, dos hijos de texto
                  son dos hijos, y un contenedor con más de uno exige `display: flex`. */}
              <span style={{ fontFamily: "PlexMono", fontSize: 30, color: COLOR.tenue, marginTop: 14 }}>
                {`${conArroba(piloto?.handle ?? handle)}${piloto?.licencia ? ` · ${piloto.licencia}` : ""}`}
              </span>
            </div>
          </div>

          {/* Sus horas, o que no se ven */}
          {horas ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontFamily: "PlexMono", fontSize: 22, letterSpacing: 3, color: COLOR.tenue, marginBottom: 6 }}>
                HORAS DE VUELO
              </span>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ fontSize: 160, fontWeight: 800, color: COLOR.acento, lineHeight: 1 }}>{entero}</span>
                <span style={{ fontSize: 160, fontWeight: 800, color: COLOR.masTenue, lineHeight: 1 }}>{`.${decimal}`}</span>
              </div>
            </div>
          ) : piloto ? (
            <div
              style={{
                display: "flex",
                border: `1px solid ${COLOR.borde}`,
                borderRadius: 28,
                padding: "22px 30px",
                fontFamily: "PlexMono",
                fontSize: 28,
                color: COLOR.tenue,
              }}
            >
              Perfil privado
            </div>
          ) : null}
        </div>

        <span style={{ fontFamily: "PlexMono", fontSize: 24, color: COLOR.masTenue }}>
          {`vector.fdiaznem.com.ar/u/${piloto?.handle ?? handle}`}
        </span>
      </div>
    ),
    { ...size, fonts }
  );
}

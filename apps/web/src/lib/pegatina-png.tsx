import { ImageResponse } from "next/og";
import { cargarFuentes } from "@/lib/imagen-tarjeta";
import { NUMEROS_DE_LA_ROSA, qrSvg, rosa } from "@/lib/pegatinas-hoja";

/**
 * Una pegatina con QR como PNG, para mandarla a hacer (2026-10-23). La imprenta de Federico
 * pide un archivo por sticker y toma el tamaño del lado más largo (4, 6, 8 o 10 cm): con 8 cm
 * sale justo la placa de 80 × 50 mm de la hoja (`pegatinas-hoja.ts`), que es el mismo diseño.
 *
 * - **600 dpi**: 1890 × 1181 px, para que el QR no se pixele en ningún tamaño de los cuatro.
 * - **Fondo transparente** afuera de las esquinas redondeadas: con "Sin fondo" la imprenta
 *   recorta por la forma de la placa y le deja su borde blanco.
 *
 * Con satori (`next/og`), como las imágenes para compartir: estilos en línea y sólo las dos
 * fuentes que hay en disco (Nunito 800 y Plex Mono 600).
 */

const MM = 1890 / 80;
const mm = (n: number) => Math.round(n * MM);
export const ANCHO_PNG = mm(80);
export const ALTO_PNG = mm(50);

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#18181b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/></svg>`;
const dataSvg = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

export async function pngDePegatina(codigo: string, base: string): Promise<Uint8Array> {
  const [fonts, qr] = await Promise.all([cargarFuentes(), qrSvg(codigo, base)]);
  // La rosa: 62 mm, corrida abajo a la izquierda como en la hoja, y los números a mano.
  const rosaLado = mm(62);
  const rosaX = mm(-17);
  const rosaY = ALTO_PNG - rosaLado + mm(24);
  const numeros = NUMEROS_DE_LA_ROSA.map((t, i) => {
    const r = (i * 30 * Math.PI) / 180;
    const cx = rosaX + rosaLado / 2 + (rosaLado * 0.36) * Math.sin(r);
    const cy = rosaY + rosaLado / 2 - (rosaLado * 0.36) * Math.cos(r);
    return { t, cx, cy, giro: i * 30 };
  });

  const respuesta = new ImageResponse(
    (
      <div style={{ width: ANCHO_PNG, height: ALTO_PNG, display: "flex" }}>
        <div
          style={{
            position: "relative",
            width: ANCHO_PNG,
            height: ALTO_PNG,
            display: "flex",
            overflow: "hidden",
            borderRadius: mm(3.5),
            backgroundColor: "#18181b",
            padding: mm(4.2),
            fontFamily: "Nunito",
            color: "#ffffff",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataSvg(rosa({ numeros: false }))} width={rosaLado} height={rosaLado} style={{ position: "absolute", left: rosaX, top: rosaY, opacity: 0.07 }} alt="" />
          {numeros.map(({ t, cx, cy, giro }) => (
            <div
              key={t}
              style={{
                position: "absolute",
                left: cx - mm(3),
                top: cy - mm(1.5),
                width: mm(6),
                height: mm(3),
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontFamily: "PlexMono",
                fontSize: mm(2.6),
                color: "rgba(255,255,255,0.07)",
                transform: `rotate(${giro}deg)`,
              }}
            >
              {t}
            </div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: mm(1.6), fontSize: mm(3.4), fontWeight: 800 }}>
              <div style={{ width: mm(5), height: mm(5), borderRadius: mm(1.4), backgroundColor: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataSvg(LOGO)} width={mm(3.2)} height={mm(3.2)} alt="" />
              </div>
              Vector
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", fontSize: mm(6.4), lineHeight: 0.98, letterSpacing: -mm(0.22) }}>
              <span>¿Puedo</span>
              <span>volar hoy?</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: mm(3.2), lineHeight: 1.2, marginTop: mm(2) }}>
              <span>Tu bitácora de vuelo,</span>
              <span>en el teléfono.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: mm(2.4), lineHeight: 1.3, marginTop: mm(1.3), color: "#a1a1aa" }}>
              <span>Escaneá con la cámara o entrá a</span>
              <span>vector.fdiaznem.com.ar</span>
            </div>
          </div>

          <div style={{ width: mm(32), marginLeft: mm(3.6), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: mm(1.3) }}>
            <div style={{ width: mm(32), height: mm(32), backgroundColor: "#ffffff", borderRadius: mm(2.4), padding: mm(3), display: "flex" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataSvg(qr)} width={mm(26)} height={mm(26)} alt="" />
            </div>
            <div style={{ fontFamily: "PlexMono", fontSize: mm(2.3), color: "#a1a1aa", letterSpacing: mm(0.18) }}>{codigo}</div>
          </div>
        </div>
      </div>
    ),
    { width: ANCHO_PNG, height: ALTO_PNG, fonts }
  );
  return new Uint8Array(await respuesta.arrayBuffer());
}

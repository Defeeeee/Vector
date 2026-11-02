import { ImageResponse } from "next/og";
import { COLOR, MarcaVector, RESPLANDOR, cargarFuentes } from "@/lib/imagen-tarjeta";

/**
 * La vista previa de la landing y de las páginas públicas que no tienen la suya: lo que
 * aparece al pegar el link en WhatsApp, LinkedIn o Instagram. Las guías tienen la propia
 * (`guias/opengraph-image.tsx`). Estática: no lee nada de nadie.
 */

export const runtime = "nodejs";
export const alt = "Vector, la bitácora de vuelo digital para pilotos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PREGUNTAS = ["¿Puedo volar hoy?", "¿Cuánto me falta para la PCA?", "Libro en PDF para firmar"];

export default async function Image() {
  const fonts = await cargarFuentes();
  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: COLOR.fondo,
          backgroundImage: RESPLANDOR,
          fontFamily: "Nunito",
        }}
      >
        <MarcaVector tamano={56} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 76, fontWeight: 800, color: COLOR.texto, lineHeight: 1.05, letterSpacing: -2 }}>
            Tu bitácora de vuelo,
          </span>
          <span style={{ fontSize: 76, fontWeight: 800, color: COLOR.acento, lineHeight: 1.05, letterSpacing: -2 }}>
            siempre al día.
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 44 }}>
            {PREGUNTAS.map((p) => (
              <div
                key={p}
                style={{
                  display: "flex",
                  flexShrink: 0,
                  border: `1px solid ${COLOR.borde}`,
                  borderRadius: 999,
                  padding: "10px 20px",
                  fontFamily: "PlexMono",
                  fontSize: 20,
                  color: COLOR.tenue,
                }}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}

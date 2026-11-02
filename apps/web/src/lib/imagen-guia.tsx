import { ImageResponse } from "next/og";
import { COLOR, MarcaVector, RESPLANDOR, cargarFuentes } from "./imagen-tarjeta";

/**
 * La vista previa de cada guía, con su título: lo que se ve al compartirla en WhatsApp,
 * LinkedIn o un grupo de la escuela. Sólo del server (lee las fuentes del disco).
 */
export const TAMANO_GUIA = { width: 1200, height: 630 };

export async function imagenDeGuia(titulo: string, eyebrow = "GUÍA PARA PILOTOS") {
  const fonts = await cargarFuentes();
  const largo = titulo.length > 60 ? 58 : 68;
  return new ImageResponse(
    (
      <div
        style={{
          width: TAMANO_GUIA.width,
          height: TAMANO_GUIA.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: COLOR.fondo,
          backgroundImage: RESPLANDOR,
          fontFamily: "Nunito",
        }}
      >
        <MarcaVector tamano={52} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: "PlexMono", fontSize: 24, letterSpacing: 4, color: COLOR.acento, marginBottom: 18 }}>
            {eyebrow}
          </span>
          <span style={{ fontSize: largo, fontWeight: 800, color: COLOR.texto, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1000 }}>
            {titulo}
          </span>
        </div>
      </div>
    ),
    { ...TAMANO_GUIA, fonts }
  );
}

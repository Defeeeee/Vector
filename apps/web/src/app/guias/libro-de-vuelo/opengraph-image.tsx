import { TAMANO_GUIA, imagenDeGuia } from "@/lib/imagen-guia";
import { guia } from "@/lib/sitio";

export const runtime = "nodejs";
export const alt = guia("libro-de-vuelo").titulo;
export const size = TAMANO_GUIA;
export const contentType = "image/png";

export default function Image() {
  return imagenDeGuia(guia("libro-de-vuelo").titulo);
}

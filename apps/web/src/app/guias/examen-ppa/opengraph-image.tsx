import { TAMANO_GUIA, imagenDeGuia } from "@/lib/imagen-guia";
import { guia } from "@/lib/sitio";

export const runtime = "nodejs";
export const alt = guia("examen-ppa").titulo;
export const size = TAMANO_GUIA;
export const contentType = "image/png";

export default function Image() {
  return imagenDeGuia(guia("examen-ppa").titulo);
}

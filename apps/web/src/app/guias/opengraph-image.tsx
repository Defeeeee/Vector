import { TAMANO_GUIA, imagenDeGuia } from "@/lib/imagen-guia";

export const runtime = "nodejs";
export const alt = "Guías para pilotos de Vector";
export const size = TAMANO_GUIA;
export const contentType = "image/png";

export default function Image() {
  return imagenDeGuia("Lo que pide la norma, explicado con las fuentes.", "GUÍAS PARA PILOTOS");
}

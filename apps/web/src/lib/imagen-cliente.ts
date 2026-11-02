/**
 * Achicar una foto en el navegador antes de subirla.
 *
 * El backend la re-codifica igual —borra el EXIF, corrige la orientación y guarda WebP—,
 * así que esto no es por seguridad sino por la subida: una foto de teléfono pesa 3 a 8
 * MB y por datos móviles eso es medio minuto. A 1600 px en WebP queda en 200–400 KB.
 * De paso, **la ubicación GPS no sale nunca del teléfono**: el canvas no copia el EXIF.
 *
 * **Safari no codifica WebP desde un canvas**: `toBlob("image/webp")` le devuelve un PNG,
 * que para una foto de 1600 px pesa varios MB. Por eso, si lo que vuelve no es WebP, se
 * vuelve a codificar como JPEG.
 */

export interface Dimensiones {
  width: number;
  height: number;
}

/** Cómo queda una imagen para que su lado más largo no pase de `maxDimension`. */
export function calcularDimensiones(
  anchoOriginal: number,
  altoOriginal: number,
  maxDimension: number = 1600,
): Dimensiones {
  if (anchoOriginal <= maxDimension && altoOriginal <= maxDimension) {
    return { width: anchoOriginal, height: altoOriginal };
  }

  const ratio = anchoOriginal / altoOriginal;
  if (anchoOriginal > altoOriginal) {
    return { width: maxDimension, height: Math.round(maxDimension / ratio) };
  } else {
    return { width: Math.round(maxDimension * ratio), height: maxDimension };
  }
}

/** `"IMG_2041.HEIC"` con `image/webp` → `"IMG_2041.webp"`. */
export function nombreConExtension(nombre: string, tipo: string): string {
  const extension = tipo === "image/webp" ? ".webp" : tipo === "image/png" ? ".png" : ".jpg";
  const base = nombre.replace(/\.[^/.]+$/, "") || "foto";
  return `${base}${extension}`;
}

export class ImagenIlegible extends Error {}

function cargar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Típicamente un HEIC en una compu: el navegador no lo sabe abrir.
      reject(new ImagenIlegible("Ese formato no se puede leer. Probá con una foto JPG o PNG."));
    };
    img.src = url;
  });
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

export async function comprimirImagen(file: File, maxDimension: number = 1600, calidad = 0.85): Promise<File> {
  const img = await cargar(file);
  // `naturalWidth` y no `width`: el segundo puede venir afectado por CSS. Los navegadores
  // actuales ya aplican la orientación del EXIF al decodificar, así que una foto vertical
  // del teléfono llega parada.
  const { width, height } = calcularDimensiones(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagenIlegible("No se pudo procesar la foto en este navegador.");
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await aBlob(canvas, "image/webp", calidad);
  if (!blob || blob.type !== "image/webp") blob = await aBlob(canvas, "image/jpeg", calidad);
  if (!blob) throw new ImagenIlegible("No se pudo procesar la foto en este navegador.");

  return new File([blob], nombreConExtension(file.name, blob.type), { type: blob.type });
}

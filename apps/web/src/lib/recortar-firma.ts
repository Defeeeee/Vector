import * as UPNGModulo from "@pdf-lib/upng";

// Sus tipos declaran exportaciones con nombre, pero la versión ESM (la que usa el build de Next)
// sólo exporta un `default`; la CommonJS (la de los tests en node) trae las dos cosas. Así anda
// en los dos lados.
const UPNG = (UPNGModulo as unknown as { default?: typeof UPNGModulo }).default ?? UPNGModulo;
const { decode, encode, toRGBA8 } = UPNG;

/**
 * La firma se guarda como el PNG del lienzo entero donde se dibujó, con mucho margen vacío:
 * al encajarla en la caja del formulario la tinta quedaba chiquita. Esto la recorta a la
 * tinta (con un margen del 3 %), así que sirve también para las firmas ya guardadas.
 *
 * Tinta = alfa mayor a 16 o, si la imagen no tiene transparencia, lo que no es casi blanco.
 * Si no hay tinta o algo falla, devuelve el PNG original: nunca rompe el PDF.
 */
export function recortarFirmaPng(png: Uint8Array): Uint8Array {
  try {
    const buf = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
    const img = decode(buf);
    const { width: w, height: h } = img;
    const px = new Uint8Array(toRGBA8(img)[0]);
    const conAlfa = hayTransparencia(px);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const tinta = conAlfa ? px[i + 3] > 16 : px[i + 3] > 16 && !(px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240);
        if (!tinta) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return png;
    const margen = Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 0.03);
    x0 = Math.max(0, x0 - margen);
    y0 = Math.max(0, y0 - margen);
    x1 = Math.min(w - 1, x1 + margen);
    y1 = Math.min(h - 1, y1 + margen);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    if (cw === w && ch === h) return png;
    const salida = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      const desde = ((y0 + y) * w + x0) * 4;
      salida.set(px.subarray(desde, desde + cw * 4), y * cw * 4);
    }
    return new Uint8Array(encode([salida.buffer as ArrayBuffer], cw, ch, 0));
  } catch {
    return png;
  }
}

/** ¿Algún píxel es transparente? Si no, la firma viene sobre fondo blanco. */
function hayTransparencia(px: Uint8Array): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
  return false;
}

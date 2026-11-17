import { describe, expect, it } from "vitest";
import { decode, encode } from "@pdf-lib/upng";
import { recortarFirmaPng } from "./recortar-firma";

function png(w: number, h: number, pinta: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(pinta(x, y), (y * w + x) * 4);
  return new Uint8Array(encode([d.buffer as ArrayBuffer], w, h, 0));
}
const medida = (b: Uint8Array) => {
  const i = decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return [i.width, i.height];
};

describe("recortarFirmaPng", () => {
  it("recorta a la tinta más el 3 % de margen (transparente)", () => {
    const p = png(400, 200, (x, y) => (x >= 150 && x < 250 && y >= 80 && y < 120 ? [11, 31, 107, 255] : [0, 0, 0, 0]));
    const [w, h] = medida(recortarFirmaPng(p));
    expect(w).toBe(100 + 2 * 3);
    expect(h).toBe(40 + 2 * 3);
  });

  it("sin transparencia, la tinta es lo que no es blanco", () => {
    const p = png(300, 300, (x, y) => (x >= 100 && x < 150 && y >= 100 && y < 200 ? [0, 0, 100, 255] : [255, 255, 255, 255]));
    const [w, h] = medida(recortarFirmaPng(p));
    expect(w).toBe(50 + 2 * 3);
    expect(h).toBe(100 + 2 * 3);
  });

  it("sin tinta devuelve el original", () => {
    const p = png(50, 50, () => [0, 0, 0, 0]);
    expect(recortarFirmaPng(p)).toBe(p);
  });

  it("si no es un PNG, devuelve lo mismo", () => {
    const basura = new Uint8Array([1, 2, 3]);
    expect(recortarFirmaPng(basura)).toBe(basura);
  });
});

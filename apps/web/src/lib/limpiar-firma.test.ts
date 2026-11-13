import { describe, expect, it } from "vitest";
import { desenfoqueCaja, limpiarFirma, otsu, reducir, rotar90, type ImagenRgba } from "./limpiar-firma";

/** Una "foto" de papel: luz despareja, una sombra suave, grano, una firma, un sello y motas. */
function foto({ sello = true, claro = true }: { sello?: boolean; claro?: boolean } = {}): {
  img: ImagenRgba;
  trazo: [number, number][];
  selloCaja: { x: number; y: number; w: number; h: number };
  claroCaja: { x: number; y: number; w: number; h: number };
  mota: [number, number];
  sombra: [number, number];
} {
  const W = 600, H = 400;
  const data = new Uint8ClampedArray(W * H * 4);
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Luz: de 205 a la izquierda a 245 a la derecha, un poco amarilla.
      let l = 205 + (40 * x) / W - (15 * y) / H;
      // Sombra suave abajo a la derecha (como la de la mano).
      const s = Math.min(1, Math.max(0, (x - 380) / 70)) * Math.min(1, Math.max(0, (y - 230) / 70));
      l *= 1 - 0.28 * s;
      const ruido = (azar() - 0.5) * 6;
      const o = (y * W + x) * 4;
      data[o] = l + ruido;
      data[o + 1] = l - 4 + ruido;
      data[o + 2] = l - 14 + ruido;
      data[o + 3] = 255;
    }
  }
  const pintar = (x: number, y: number, c: [number, number, number], mezcla = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) data[o + k] = data[o + k] * (1 - mezcla) + c[k] * mezcla;
  };
  // Un trazo oscuro, grueso (4 px), en forma de onda.
  const trazo: [number, number][] = [];
  for (let x = 60; x < 330; x++) {
    const y = Math.round(150 + 40 * Math.sin(x / 18));
    for (let g = -2; g <= 2; g++) pintar(x, y + g, [25, 25, 45]);
    if (x % 7 === 0) trazo.push([x, y]);
  }
  const selloCaja = { x: 360, y: 90, w: 120, h: 60 };
  const claroCaja = { x: 360, y: 180, w: 90, h: 40 };
  if (sello) {
    // Un sello de tinta de color medio: un marco de 3 px.
    for (let y = selloCaja.y; y < selloCaja.y + selloCaja.h; y++) {
      for (let x = selloCaja.x; x < selloCaja.x + selloCaja.w; x++) {
        const borde = x < selloCaja.x + 3 || x >= selloCaja.x + selloCaja.w - 3 || y < selloCaja.y + 3 || y >= selloCaja.y + selloCaja.h - 3;
        if (borde) pintar(x, y, [90, 110, 200]);
      }
    }
  }
  if (sello && claro) {
    for (let y = claroCaja.y; y < claroCaja.y + claroCaja.h; y++) {
      for (let x = claroCaja.x; x < claroCaja.x + claroCaja.w; x++) pintar(x, y, [150, 160, 230], 0.9);
    }
  }
  // Una mota de polvo de 2×2.
  const mota: [number, number] = [520, 60];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) pintar(mota[0] + dx, mota[1] + dy, [60, 60, 60]);
  return { img: { width: W, height: H, data }, trazo, selloCaja, claroCaja, mota, sombra: [540, 350] };
}

const alfaEn = (r: ImagenRgba, x: number, y: number) => r.data[(y * r.width + x) * 4 + 3];

describe("limpiarFirma", () => {
  it("saca el papel, la luz despareja y la sombra, y deja el trazo", () => {
    const f = foto({ sello: false });
    const r = limpiarFirma(f.img, { anchoMax: 10_000 })!;
    expect(r).not.toBeNull();
    // Sin achicar, el recorte arranca cerca del trazo: la sombra y la mota quedaron afuera.
    expect(r.width).toBeLessThan(330);
    let transparentes = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] === 0) transparentes++;
    // El trazo es una fracción chica de su recorte: casi todo es transparente.
    expect(transparentes / (r.data.length / 4)).toBeGreaterThan(0.85);
    // Y la tinta es del color de la tinta, no del papel.
    let opacos = 0;
    for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3] > 200) { opacos++; expect(r.data[i + 2]).toBeGreaterThan(r.data[i]); }
    expect(opacos).toBeGreaterThan(500);
  });

  it("deja un solo color de tinta si no se conservan los colores", () => {
    const r = limpiarFirma(foto().img, { tinta: "negro", anchoMax: 10_000 })!;
    for (let i = 0; i < r.data.length; i += 4) {
      if (r.data[i + 3] > 0) expect([r.data[i], r.data[i + 1], r.data[i + 2]]).toEqual([18, 18, 20]);
    }
  });

  it("conserva el trazo oscuro y el sello de color, claro y medio", () => {
    const f = foto();
    // Sin recorte ni achique: las coordenadas de la foto valen en el resultado desplazadas por el recorte,
    // así que se busca la caja del recorte reconstruyéndola con el mismo método sin achicar.
    const r = limpiarFirma(f.img, { conservarColores: true, anchoMax: 10_000, ladoMaxTrabajo: 10_000 })!;
    expect(r).not.toBeNull();
    // El recorte abarca de la firma (x≈60) al sello (x≈480): ancho ≈ 420 + márgenes.
    expect(r.width).toBeGreaterThan(400);
    expect(r.width).toBeLessThan(470);
    // El recorte empieza en el trazo (x=60) menos el margen.
    const margen = Math.max(4, Math.round(Math.max(420, 190) * 0.03));
    const ox = 60 - margen;
    // En el alto, arriba está el sello (y=90); el trazo sube a 110.
    const oy = 90 - margen;
    const cuenta = (caja: { x: number; y: number; w: number; h: number }, borde = false) => {
      let ok = 0, n = 0;
      for (let y = caja.y; y < caja.y + caja.h; y++) {
        for (let x = caja.x; x < caja.x + caja.w; x++) {
          const enBorde = x < caja.x + 3 || x >= caja.x + caja.w - 3 || y < caja.y + 3 || y >= caja.y + caja.h - 3;
          if (borde && !enBorde) continue;
          n++;
          if (alfaEn(r, x - ox, y - oy) > 128) ok++;
        }
      }
      return ok / n;
    };
    expect(cuenta(f.selloCaja, true)).toBeGreaterThan(0.85);
    expect(cuenta(f.claroCaja)).toBeGreaterThan(0.85);
    let fuertes = 0;
    for (const [x, y] of f.trazo) if (alfaEn(r, x - ox, y - oy) > 128) fuertes++;
    expect(fuertes / f.trazo.length).toBeGreaterThan(0.9);
    // El sello sigue siendo azul, no gris, y más oscuro que el papel.
    const o = ((f.claroCaja.y + 20 - oy) * r.width + (f.claroCaja.x + 45 - ox)) * 4;
    expect(r.data[o + 2]).toBeGreaterThan(r.data[o] + 30);
    expect(r.data[o]).toBeLessThan(200);
    // Y la firma negra sigue negra: los dos colores conviven.
    const t = f.trazo[10];
    const ot = ((t[1] - oy) * r.width + (t[0] - ox)) * 4;
    expect(r.data[ot] + r.data[ot + 1] + r.data[ot + 2]).toBeLessThan(250);
  });

  it("no deja la sombra ni las motas sueltas", () => {
    const f = foto();
    const r = limpiarFirma(f.img, { conservarColores: true, anchoMax: 10_000, ladoMaxTrabajo: 10_000 })!;
    // La sombra (540,350) y la mota (520,60) quedan fuera del recorte: el ancho llega a lo sumo al sello.
    expect(r.width).toBeLessThan(470);
    expect(r.height).toBeLessThan(230);
  });

  it("achica a lo máximo pedido", () => {
    const r = limpiarFirma(foto().img, { anchoMax: 200 })!;
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(200);
  });

  it("el ajuste cambia cuánto trazo queda", () => {
    // Un trazo firme y otro flojo (lápiz): "más trazo" tiene que sumar el flojo.
    const W = 300, H = 120;
    const data = new Uint8ClampedArray(W * H * 4).fill(240);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const linea = (y: number, x0: number, x1: number, v: number) => {
      for (let x = x0; x < x1; x++) for (let g = 0; g < 4; g++) for (let k = 0; k < 3; k++) data[((y + g) * W + x) * 4 + k] = v;
    };
    linea(30, 20, 280, 30);
    linea(80, 20, 280, 195);
    const cuantos = (ajuste: number) => {
      const r = limpiarFirma({ width: W, height: H, data }, { ajuste, anchoMax: 10_000 })!;
      let n = 0;
      for (let i = 3; i < r.data.length; i += 4) n += r.data[i];
      return n;
    };
    expect(cuantos(1)).toBeGreaterThan(cuantos(-1));
  });

  it("una hoja en blanco no tiene firma", () => {
    const W = 200, H = 120;
    const data = new Uint8ClampedArray(W * H * 4).fill(235);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(limpiarFirma({ width: W, height: H, data })).toBeNull();
  });

  it("anda con una imagen muy chica", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    expect(() => limpiarFirma({ width: 4, height: 4, data })).not.toThrow();
  });
});

describe("las piezas", () => {
  it("rotar 90 cuatro veces devuelve la imagen", () => {
    const f = foto().img;
    const r = rotar90(rotar90(rotar90(rotar90(f, 1), 1), 1), 1);
    expect(r.width).toBe(f.width);
    expect(Buffer.from(r.data).equals(Buffer.from(f.data))).toBe(true);
    const una = rotar90(f, 1);
    expect(una.width).toBe(f.height);
    expect(una.height).toBe(f.width);
  });

  it("el desenfoque de una imagen pareja la deja pareja", () => {
    const a = new Float32Array(50 * 40).fill(0.5);
    const b = desenfoqueCaja(a, 50, 40, 7);
    expect(Math.max(...b)).toBeCloseTo(0.5, 5);
    expect(Math.min(...b)).toBeCloseTo(0.5, 5);
  });

  it("Otsu separa dos grupos", () => {
    const v = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) v[i] = i < 900 ? 0.05 : 0.8;
    const t = otsu(v);
    expect(t).toBeGreaterThan(0.04);
    expect(t).toBeLessThan(0.8);
  });

  it("reducir conserva el color y no toca lo que ya entra", () => {
    const f = foto().img;
    expect(reducir(f, 1000)).toBe(f);
    expect(reducir(f, 100).width).toBe(100);
  });
});

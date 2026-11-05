/**
 * Corta una capa (una o más cartas dibujadas, en orden de prioridad) en teselas Web Mercator de
 * 256 px: `<salida>/<z>/<x>/<y>.webp`. Fuera del marco de las cartas, transparente; una tesela
 * que no toca ninguna carta no se escribe.
 *
 * Para cada píxel de la tesela: lon/lat → punto de la carta (`puntoEnCarta`) → píxel de la imagen
 * dibujada, con interpolación bilineal. La proyección se calcula cada 16 px y se interpola en el
 * medio: dentro de una tesela es lisa y el error es de centésimas de píxel.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { puntoEnCarta } from "./lambert.mjs";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const T = 256, G = 16, W = T / G + 1;
const RAD = Math.PI / 180;
const lonDeX = (x, z) => (x / 2 ** z) * 360 - 180;
const latDeY = (y, z) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** z));
const xDeLon = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const yDeLat = (lat, z) => Math.floor(((1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2) * 2 ** z);

/**
 * @param cartas [{ ajuste, imagen: { px, ancho, alto, escala, marco } }]
 * @returns cuántas teselas y bytes por nivel
 */
export async function teselar(cartas, zmin, zmax, salida) {
  const c2 = cartas.map(({ ajuste, imagen }) => {
    const [mx0, , , my1] = imagen.marco;
    const lons = ajuste.gcps.map((g) => g.lon), lats = ajuste.gcps.map((g) => g.lat);
    return {
      ...imagen,
      aPixel: (lon, lat) => {
        const [x, y] = puntoEnCarta(ajuste, lon, lat);
        return [(x - mx0) * imagen.escala, (my1 - y) * imagen.escala];
      },
      // Un margen generoso alrededor de la grilla: el marco llega más allá del último meridiano.
      caja: [Math.min(...lons) - 4, Math.min(...lats) - 4, Math.max(...lons) + 4, Math.max(...lats) + 4],
    };
  });
  const lon0 = Math.min(...c2.map((c) => c.caja[0])), lat0 = Math.min(...c2.map((c) => c.caja[1]));
  const lon1 = Math.max(...c2.map((c) => c.caja[2])), lat1 = Math.max(...c2.map((c) => c.caja[3]));
  const resumen = [];
  for (let z = zmin; z <= zmax; z++) {
    let teselas = 0, bytes = 0;
    const pendientes = [];
    for (let x = xDeLon(lon0, z); x <= xDeLon(lon1, z); x++)
      for (let y = yDeLat(lat1, z); y <= yDeLat(lat0, z); y++) {
        const mallas = c2.map((c) => {
          const m = new Float64Array(W * W * 2);
          let cerca = false;
          for (let j = 0; j < W; j++)
            for (let i = 0; i < W; i++) {
              const [sx, sy] = c.aPixel(lonDeX(x + (i * G) / T, z), latDeY(y + (j * G) / T, z));
              m[(j * W + i) * 2] = sx;
              m[(j * W + i) * 2 + 1] = sy;
              if (sx >= -T && sy >= -T && sx < c.ancho + T && sy < c.alto + T) cerca = true;
            }
          return cerca ? m : null;
        });
        if (!mallas.some(Boolean)) continue;
        const rgba = Buffer.alloc(T * T * 4);
        let algo = false;
        for (let py = 0; py < T; py++) {
          const gj = Math.floor(py / G), fj = (py % G) / G;
          for (let px = 0; px < T; px++) {
            const gi = Math.floor(px / G), fi = (px % G) / G;
            for (let ci = 0; ci < c2.length; ci++) {
              const m = mallas[ci];
              if (!m) continue;
              const c = c2[ci];
              const k00 = (gj * W + gi) * 2, k10 = k00 + 2, k01 = k00 + W * 2, k11 = k01 + 2;
              const sx = (m[k00] * (1 - fi) + m[k10] * fi) * (1 - fj) + (m[k01] * (1 - fi) + m[k11] * fi) * fj;
              const sy = (m[k00 + 1] * (1 - fi) + m[k10 + 1] * fi) * (1 - fj) + (m[k01 + 1] * (1 - fi) + m[k11 + 1] * fi) * fj;
              if (sx < 0 || sy < 0 || sx > c.ancho - 1 || sy > c.alto - 1) continue;
              const x0 = Math.floor(sx), y0 = Math.floor(sy), dx = sx - x0, dy = sy - y0;
              const x1 = Math.min(x0 + 1, c.ancho - 1), y1 = Math.min(y0 + 1, c.alto - 1);
              const o = (py * T + px) * 4;
              for (let ch = 0; ch < 3; ch++) {
                const v00 = c.px[(y0 * c.ancho + x0) * 3 + ch], v10 = c.px[(y0 * c.ancho + x1) * 3 + ch];
                const v01 = c.px[(y1 * c.ancho + x0) * 3 + ch], v11 = c.px[(y1 * c.ancho + x1) * 3 + ch];
                rgba[o + ch] = (v00 * (1 - dx) + v10 * dx) * (1 - dy) + (v01 * (1 - dx) + v11 * dx) * dy;
              }
              rgba[o + 3] = 255;
              algo = true;
              break;
            }
          }
        }
        if (!algo) continue;
        pendientes.push(
          sharp(rgba, { raw: { width: T, height: T, channels: 4 } })
            .webp({ quality: 80, alphaQuality: 90, effort: 5 })
            .toBuffer()
            .then((buf) => {
              const d = path.join(salida, String(z), String(x));
              fs.mkdirSync(d, { recursive: true });
              fs.writeFileSync(path.join(d, `${y}.webp`), buf);
              teselas++;
              bytes += buf.length;
            })
        );
        if (pendientes.length >= 16) await Promise.all(pendientes.splice(0));
      }
    await Promise.all(pendientes.splice(0));
    resumen.push({ z, teselas, bytes });
  }
  return resumen;
}

/**
 * Lambert cónica conforme sobre WGS84, como la declaran las cartas ENR 6 del AIP.
 *
 * De la proyección sólo importa la constante del cono `n`: el meridiano central, la escala y el
 * origen se traducen en un giro, una escala y un desplazamiento de la carta, y eso lo absorbe la
 * semejanza `[a, b, tx, ty]` (x' = a·X − b·Y + tx, y' = b·X + a·Y + ty) que se ajusta contra la
 * grilla. Una semejanza y no una afín: la carta es conforme, no se estira distinto en cada eje.
 */
const E = 0.0818191908426;
const RAD = Math.PI / 180;

const t = (lat) => {
  const f = lat * RAD;
  return Math.tan(Math.PI / 4 - f / 2) / Math.pow((1 - E * Math.sin(f)) / (1 + E * Math.sin(f)), E / 2);
};

/** Coordenadas en el cono, sin escalar: [X, Y]. */
export function lambert(n, lon0, lon, lat) {
  const r = Math.pow(t(lat), n);
  const th = n * (lon - lon0) * RAD;
  return [r * Math.sin(th), -r * Math.cos(th)];
}

export const aplicarSemejanza = ([a, b, tx, ty], [X, Y]) => [a * X - b * Y + tx, b * X + a * Y + ty];

/** lon/lat → punto de la página del PDF (y hacia arriba), con el ajuste de una carta. */
export const puntoEnCarta = (ajuste, lon, lat) => aplicarSemejanza(ajuste.semejanza, lambert(ajuste.n, ajuste.lon0, lon, lat));

/** Semejanza de mínimos cuadrados que lleva `src` a `dst`. */
export function semejanza(src, dst) {
  const N = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < N; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= N; sy /= N; dx /= N; dy /= N;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < N; i++) {
    const X = src[i][0] - sx, Y = src[i][1] - sy, U = dst[i][0] - dx, V = dst[i][1] - dy;
    num1 += X * U + Y * V;
    num2 += X * V - Y * U;
    den += X * X + Y * Y;
  }
  const a = num1 / den, b = num2 / den;
  return [a, b, dx - a * sx + b * sy, dy - b * sx - a * sy];
}

/**
 * Ajusta `n` (sección áurea, hemisferio sur: negativo) y la semejanza contra los puntos de
 * control `{ lon, lat, x, y }`. Devuelve también el residuo de cada punto, en puntos de la carta.
 */
export function ajustar(gcps) {
  const lon0 = gcps.reduce((s, g) => s + g.lon, 0) / gcps.length;
  const error = (n) => {
    const src = gcps.map((g) => lambert(n, lon0, g.lon, g.lat));
    const s = semejanza(src, gcps.map((g) => [g.x, g.y]));
    const res = gcps.map((g, i) => {
      const [x, y] = aplicarSemejanza(s, src[i]);
      return Math.hypot(x - g.x, y - g.y);
    });
    return { semejanza: s, res, rms: Math.sqrt(res.reduce((t2, r) => t2 + r * r, 0) / res.length) };
  };
  let lo = -0.999, hi = -0.001;
  for (let k = 0; k < 200; k++) {
    const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
    if (error(m1).rms < error(m2).rms) hi = m2;
    else lo = m1;
  }
  const n = (lo + hi) / 2;
  const e = error(n);
  return { n, lon0, semejanza: e.semejanza, rmsPt: e.rms, maxPt: Math.max(...e.res), residuos: e.res };
}

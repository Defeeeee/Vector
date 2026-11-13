/**
 * Limpiar la foto de una firma (o de una firma con su sello): sacarle el fondo de la hoja de
 * papel y dejar sólo la tinta, sobre transparente. **Todo pasa en el navegador del piloto,
 * sin ningún servicio de afuera**: la firma de un tercero no sale de su teléfono hasta que
 * la guarda en su cuenta.
 *
 * Puro, sobre `{ width, height, data }` RGBA (lo mismo que un `ImageData`), para testearlo
 * en vitest sin canvas. El componente `CapturaFirma` hace la foto, el `canvas` y el PNG.
 *
 * El método, sin IA:
 *
 * 1. **El fondo se estima, no se supone blanco.** La luz de una foto nunca es pareja: hay
 *    sombra de la mano, de la cámara, un lado más amarillo. El fondo es un desenfoque muy
 *    grande de la imagen (caja separable, radio ≈ 1/30 del lado mayor), repetido sin los
 *    píxeles que ya son tinta, para que un trazo grueso no lo oscurezca. Cada píxel se
 *    divide por el fondo de su lugar: el papel queda en 1 sin importar la luz.
 * 2. **Cuánta tinta tiene un píxel** (de 0 a 1): lo oscuro que quedó después de dividir. En
 *    "conservar colores" también cuenta cuánto color tiene, porque un sello de tinta clara
 *    (azul, violeta) es más claro que la birome y, sólo por brillo, se lo come el umbral.
 * 3. **El umbral es el de Otsu** sobre esa tinta, con el ajuste "más trazo / menos trazo"
 *    del piloto. En colores va más bajo, para que el sello claro sobreviva.
 * 4. **El alfa es la tinta** (con un borde suave, para que no se vea serruchado), el color
 *    de la tinta es uno solo (azul tinta o negro) o, en colores, el original de cada píxel,
 *    realzado un poco, sin aplanar.
 * 5. **Se sacan las motas** (grupos de unos pocos píxeles: polvo, grano), se recorta al
 *    trazo con un margen y se achica.
 */

export interface ImagenRgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type TintaFirma = "azul" | "negro";

export interface OpcionesLimpieza {
  /** -1 (menos trazo) a 1 (más trazo). 0 es lo que dice Otsu. */
  ajuste?: number;
  /**
   * `true`: cada píxel de tinta conserva su color (el sello, la firma azul y la negra, como
   * quedan en el papel). `false`: toda la tinta de un solo color, el de `tinta`.
   */
  conservarColores?: boolean;
  tinta?: TintaFirma;
  /** El ancho máximo de lo que sale. */
  anchoMax?: number;
  /** Un lado de más de esto se achica antes de procesar (la foto de un teléfono pesa 12 MP). */
  ladoMaxTrabajo?: number;
}

export const ANCHO_MAX_FIRMA = 800;
/** El dorso lleva la firma con el sello: más grande. */
export const ANCHO_MAX_DORSO = 1200;

const COLOR_TINTA: Record<TintaFirma, [number, number, number]> = {
  azul: [20, 38, 130],
  negro: [18, 18, 20],
};

/** Achica por promedio de cajas (sin pasar por el canvas). Si ya entra, devuelve la misma. */
export function reducir(img: ImagenRgba, anchoMax: number, altoMax = anchoMax): ImagenRgba {
  const esc = Math.min(1, anchoMax / img.width, altoMax / img.height);
  if (esc >= 1) return img;
  const w = Math.max(1, Math.round(img.width * esc));
  const h = Math.max(1, Math.round(img.height * esc));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          const al = img.data[i + 3];
          // Promedio ponderado por alfa: un borde transparente no oscurece el color.
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

/** Gira la imagen de a 90° (a la derecha). `veces` puede ser negativo. */
export function rotar90(img: ImagenRgba, veces: number): ImagenRgba {
  const k = ((Math.round(veces) % 4) + 4) % 4;
  if (k === 0) return img;
  const { width: W, height: H } = img;
  const w = k === 2 ? W : H;
  const h = k === 2 ? H : W;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let nx: number, ny: number;
      if (k === 1) { nx = H - 1 - y; ny = x; }
      else if (k === 2) { nx = W - 1 - x; ny = H - 1 - y; }
      else { nx = y; ny = W - 1 - x; }
      const i = (y * W + x) * 4;
      const o = (ny * w + nx) * 4;
      out[o] = img.data[i];
      out[o + 1] = img.data[i + 1];
      out[o + 2] = img.data[i + 2];
      out[o + 3] = img.data[i + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** Desenfoque de caja separable, de radio `r`, con los bordes repetidos. En su lugar sobre `src`. */
export function desenfoqueCaja(src: Float32Array, w: number, h: number, r: number): Float32Array {
  r = Math.max(1, Math.floor(r));
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    let suma = 0;
    for (let k = -r; k <= r; k++) suma += src[fila + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[fila + x] = suma / n;
      suma += src[fila + Math.min(w - 1, x + r + 1)] - src[fila + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let suma = 0;
    for (let k = -r; k <= r; k++) suma += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = suma / n;
      suma += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * El fondo de un canal: desenfoque grande, repetido sin los píxeles que son claramente
 * tinta (más de un 6 % más oscuros que el fondo de la pasada anterior).
 */
function fondoDe(canal: Float32Array, w: number, h: number, r: number): Float32Array {
  let fondo = desenfoqueCaja(canal, w, h, r);
  // Dos vueltas: la primera todavía está algo oscurecida por un sello grande, la segunda ya no.
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const sin = new Float32Array(canal.length);
    for (let i = 0; i < canal.length; i++) sin[i] = canal[i] < fondo[i] * 0.94 ? fondo[i] : canal[i];
    fondo = desenfoqueCaja(sin, w, h, r);
  }
  return fondo;
}

/** El umbral de Otsu de valores 0..1 (256 niveles). */
export function otsu(valores: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < valores.length; i++) hist[Math.min(255, Math.max(0, Math.round(valores[i] * 255)))]++;
  const total = valores.length;
  let sumaTotal = 0;
  for (let i = 0; i < 256; i++) sumaTotal += i * hist[i];
  let sumaB = 0, pesoB = 0, mejor = 0, umbral = 0;
  for (let i = 0; i < 256; i++) {
    pesoB += hist[i];
    if (pesoB === 0) continue;
    const pesoF = total - pesoB;
    if (pesoF === 0) break;
    sumaB += i * hist[i];
    const mB = sumaB / pesoB;
    const mF = (sumaTotal - sumaB) / pesoF;
    const entre = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (entre > mejor) {
      mejor = entre;
      umbral = i;
    }
  }
  return umbral / 255;
}

const suave = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Quita los grupos conexos (8 vecinos) de menos de `minimo` píxeles de la máscara; y su borde. */
function sacarMotas(alfa: Uint8ClampedArray, w: number, h: number, minimo: number): void {
  const visto = new Uint8Array(w * h);
  const pila = new Int32Array(w * h);
  const quitar: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (visto[s] || alfa[s] < 128) continue;
    let tope = 0;
    pila[tope++] = s;
    visto[s] = 1;
    const miembros: number[] = [];
    while (tope) {
      const p = pila[--tope];
      miembros.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (visto[q] || alfa[q] < 128) continue;
          visto[q] = 1;
          pila[tope++] = q;
        }
      }
    }
    if (miembros.length < minimo) quitar.push(...miembros);
  }
  for (const p of quitar) {
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) alfa[ny * w + nx] = 0;
      }
    }
  }
  // Lo flojo (un borde, el resto de una sombra) sólo queda si está pegado a tinta firme.
  const cerca = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alfa[y * w + x] < 128) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) cerca[ny * w + nx] = 1;
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (!cerca[i]) alfa[i] = 0;
}

/**
 * La foto, limpia: tinta sobre transparente, recortada al trazo. `null` si no encontró nada
 * de tinta (una foto de papel en blanco, o un ajuste demasiado bajo).
 */
/**
 * La imagen sobre papel blanco, respetando su transparencia. Un PNG que ya viene limpio (fondo
 * transparente) trae el fondo como negro con alfa 0: sin esto, el limpiador lo leía como tinta y
 * la firma salía en negativo (Federico, 2026-11-13, al subir una firma ya aislada). Una foto, que
 * es toda opaca, pasa igual.
 */
export function sobrePapel(img: ImagenRgba): ImagenRgba {
  const { width, height, data } = img;
  let transparente = false;
  for (let o = 3; o < data.length; o += 4) if (data[o] < 255) { transparente = true; break; }
  if (!transparente) return img;
  const fuera = new Uint8ClampedArray(data.length);
  for (let o = 0; o < data.length; o += 4) {
    const a = data[o + 3] / 255;
    fuera[o] = data[o] * a + 255 * (1 - a);
    fuera[o + 1] = data[o + 1] * a + 255 * (1 - a);
    fuera[o + 2] = data[o + 2] * a + 255 * (1 - a);
    fuera[o + 3] = 255;
  }
  return { width, height, data: fuera };
}

export function limpiarFirma(entrada: ImagenRgba, opciones: OpcionesLimpieza = {}): ImagenRgba | null {
  const { ajuste = 0, conservarColores = false, tinta = "azul", anchoMax = ANCHO_MAX_FIRMA, ladoMaxTrabajo = 1400 } = opciones;
  const img = reducir(sobrePapel(entrada), ladoMaxTrabajo);
  const { width: w, height: h, data } = img;
  const total = w * h;
  const radio = Math.max(8, Math.round(Math.max(w, h) / 30));

  // Canales como flotantes. En blanco y negro basta el gris; en colores, un fondo por canal
  // (la luz de una lámpara tiñe el papel).
  const R = new Float32Array(total), G = new Float32Array(total), B = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    R[i] = data[i * 4];
    G[i] = data[i * 4 + 1];
    B[i] = data[i * 4 + 2];
  }
  const gris = new Float32Array(total);
  for (let i = 0; i < total; i++) gris[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];

  const nR = new Float32Array(total), nG = new Float32Array(total), nB = new Float32Array(total);
  const tinta01 = new Float32Array(total);
  if (conservarColores) {
    const fR = fondoDe(R, w, h, radio), fG = fondoDe(G, w, h, radio), fB = fondoDe(B, w, h, radio);
    for (let i = 0; i < total; i++) {
      nR[i] = Math.min(1, R[i] / Math.max(1, fR[i]));
      nG[i] = Math.min(1, G[i] / Math.max(1, fG[i]));
      nB[i] = Math.min(1, B[i] / Math.max(1, fB[i]));
      const lum = 0.299 * nR[i] + 0.587 * nG[i] + 0.114 * nB[i];
      const croma = Math.max(nR[i], nG[i], nB[i]) - Math.min(nR[i], nG[i], nB[i]);
      tinta01[i] = Math.max(1 - lum, croma);
    }
  } else {
    const f = fondoDe(gris, w, h, radio);
    for (let i = 0; i < total; i++) tinta01[i] = 1 - Math.min(1, gris[i] / Math.max(1, f[i]));
  }

  const base = otsu(tinta01);
  const factor = 1 - 0.6 * Math.max(-1, Math.min(1, ajuste));
  // En colores el piso es más bajo: el sello claro tiene que pasar. Un piso evita que el
  // grano del papel (y el ruido del JPEG) cuenten como tinta.
  const t = Math.max(0.06, Math.min(conservarColores ? 0.2 : 0.5, conservarColores ? base * 0.5 : base) * factor);

  const alfa = new Uint8ClampedArray(total);
  for (let i = 0; i < total; i++) alfa[i] = Math.round(255 * suave((tinta01[i] - t * 0.7) / (t * 0.6)));

  sacarMotas(alfa, w, h, Math.max(6, Math.round(total * 0.00003)));

  // El recorte al trazo.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alfa[y * w + x] > 90) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const margen = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.03));
  x0 = Math.max(0, x0 - margen);
  y0 = Math.max(0, y0 - margen);
  x1 = Math.min(w - 1, x1 + margen);
  y1 = Math.min(h - 1, y1 + margen);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const [tr, tg, tb] = COLOR_TINTA[tinta];
  const salida = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y + y0) * w + (x + x0);
      const o = (y * cw + x) * 4;
      const a = alfa[i];
      salida[o + 3] = a;
      if (a === 0) continue;
      if (!conservarColores) {
        salida[o] = tr;
        salida[o + 1] = tg;
        salida[o + 2] = tb;
        continue;
      }
      // El color de la tinta sin el papel que se le mezcla en el borde, y realzado.
      const af = a / 255;
      let r = nR[i], g = nG[i], b = nB[i];
      if (af < 0.98) {
        r = Math.min(1, Math.max(0, (r - (1 - af)) / af));
        g = Math.min(1, Math.max(0, (g - (1 - af)) / af));
        b = Math.min(1, Math.max(0, (b - (1 - af)) / af));
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      // Saturar un poco y oscurecer un poco: la tinta clara se ve en el papel impreso.
      r = Math.pow(Math.min(1, Math.max(0, l + (r - l) * 1.35)), 1.25);
      g = Math.pow(Math.min(1, Math.max(0, l + (g - l) * 1.35)), 1.25);
      b = Math.pow(Math.min(1, Math.max(0, l + (b - l) * 1.35)), 1.25);
      salida[o] = Math.round(r * 255);
      salida[o + 1] = Math.round(g * 255);
      salida[o + 2] = Math.round(b * 255);
    }
  }
  return reducir({ width: cw, height: ch, data: salida }, anchoMax, anchoMax);
}

/** Un `data:image/png` pesa ~4/3 de lo que pesa la imagen: lo que cabe en el tope del backend. */
export const TOPE_CHARS_FIRMA = 240_000;
export const TOPE_CHARS_DORSO = 440_000;

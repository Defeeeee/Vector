/**
 * Los puntos de control de una carta ENR 6: los cruces de su grilla.
 *
 * Las cartas son PDF vectoriales. Los meridianos y paralelos son trazos propios (finos, de un
 * gris que cambia de carta a carta), y cada uno tiene su rótulo de grados en el borde del mapa
 * ("56°W", "34°30'S"). Se toma el estilo de trazo que, rotulado, da más cruces; cada línea toma
 * el rótulo más cercano a una de sus puntas, y cada cruce meridiano × paralelo es un punto
 * (lon, lat) ↔ (x, y) exacto, en puntos de la página.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { getDocumentProxy, getResolvedPDFJS } = require("unpdf");

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Los trazos de la página como polilíneas, con su color y ancho. */
async function trazos(pagina) {
  const O = (await getResolvedPDFJS()).OPS;
  const ops = await pagina.getOperatorList();
  const polis = [];
  let ctm = [1, 0, 0, 1, 0, 0], color = null, ancho = 1;
  const pila = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const f = ops.fnArray[i], a = ops.argsArray[i];
    if (f === O.save) pila.push([ctm, color, ancho]);
    else if (f === O.restore) [ctm, color, ancho] = pila.pop() ?? [ctm, color, ancho];
    else if (f === O.transform) ctm = mul(ctm, a);
    else if (f === O.setStrokeRGBColor) color = typeof a[0] === "string" ? a[0] : Array.from(a).join(",");
    else if (f === O.setLineWidth) ancho = a[0];
    else if (f === O.constructPath) {
      // pdf.js 6: [operador de pintado, [datos], caja]; los datos son 0 moveTo, 1 lineTo,
      // 2 curveTo, 3 quadraticCurveTo, 4 closePath.
      const d = a[1]?.[0];
      if (!d) continue;
      let actual = null;
      for (let k = 0; k < d.length; ) {
        const c = d[k++];
        if (c === 0) { actual = { pintado: a[0], color, ancho, pts: [ap(ctm, d[k], d[k + 1])] }; polis.push(actual); k += 2; }
        else if (c === 1) { actual.pts.push(ap(ctm, d[k], d[k + 1])); k += 2; }
        else if (c === 2) { actual.pts.push(ap(ctm, d[k + 4], d[k + 5])); k += 6; }
        else if (c === 3) { actual.pts.push(ap(ctm, d[k + 2], d[k + 3])); k += 4; }
        else if (c === 4) actual.cerrado = true;
        else throw new Error(`Operación de trazo desconocida: ${c}`);
      }
    }
  }
  for (const q of polis) {
    const xs = q.pts.map((p) => p[0]), ys = q.pts.map((p) => p[1]);
    q.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return polis;
}

/** "56°W", "34°S", "34°30'S"; algunas cartas los traen letra por letra y se juntan por renglón. */
async function rotulos(pagina) {
  const tc = await pagina.getTextContent();
  const piezas = tc.items
    .filter((it) => it.str.trim())
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, alto: Math.hypot(it.transform[2], it.transform[3]) }));
  piezas.sort((a, b) => Math.round(a.y * 2) - Math.round(b.y * 2) || a.x - b.x);
  const palabras = [];
  for (const pz of piezas) {
    const u = palabras.at(-1);
    if (u && Math.abs(u.y - pz.y) < 0.6 && pz.x - (u.x + u.w) < 2.5 && pz.x >= u.x) {
      u.str += pz.str;
      u.w = pz.x + pz.w - u.x;
    } else palabras.push({ ...pz });
  }
  const salida = [];
  for (const it of palabras) {
    const m = /^(\d{1,3})[°º](?:(\d{1,2})['’´]?)?([NSEWO])$/.exec(it.str.replace(/\s+/g, ""));
    if (!m) continue;
    const v = (Number(m[1]) + Number(m[2] ?? 0) / 60) * (/[SWO]/.test(m[3]) ? -1 : 1);
    salida.push({ eje: /[NS]/.test(m[3]) ? "lat" : "lon", v, x: it.x + it.w / 2, y: it.y + it.alto / 2 });
  }
  return salida;
}

function cruce(a, b) {
  for (let i = 0; i + 1 < a.pts.length; i++)
    for (let j = 0; j + 1 < b.pts.length; j++) {
      const [p1, p2, p3, p4] = [a.pts[i], a.pts[i + 1], b.pts[j], b.pts[j + 1]];
      const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
      if (!d) continue;
      const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
      const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
      if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
    }
  return null;
}

/** La grilla de la carta: sus puntos de control y el marco del mapa (hasta donde llega la grilla). */
export async function grillaDeCarta(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pagina = await pdf.getPage(1);
  const [polis, rs] = await Promise.all([trazos(pagina), rotulos(pagina)]);
  const largos = polis.filter((q) => !q.cerrado && q.pts.length >= 2 && Math.max(q.bb[2] - q.bb[0], q.bb[3] - q.bb[1]) > 300);
  const porEstilo = new Map();
  for (const q of largos) {
    const k = `${q.color}|${q.ancho.toFixed(3)}`;
    porEstilo.set(k, (porEstilo.get(k) ?? 0) + 1);
  }
  const asignar = (lineas, eje) => {
    const candidatos = rs.filter((r) => r.eje === eje);
    for (const l of lineas) {
      let mejor = null;
      for (const punta of [l.pts[0], l.pts.at(-1)])
        for (const r of candidatos) {
          const d = Math.hypot(r.x - punta[0], r.y - punta[1]);
          if (!mejor || d < mejor.d) mejor = { d, v: r.v };
        }
      l.valor = mejor && mejor.d < 40 ? mejor.v : null;
    }
  };
  const intentos = [...porEstilo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([estilo]) => {
      const grilla = largos.filter((q) => `${q.color}|${q.ancho.toFixed(3)}` === estilo);
      const meridianos = grilla.filter((q) => q.bb[3] - q.bb[1] > q.bb[2] - q.bb[0]).map((q) => ({ ...q }));
      const paralelos = grilla.filter((q) => q.bb[2] - q.bb[0] >= q.bb[3] - q.bb[1]).map((q) => ({ ...q }));
      asignar(meridianos, "lon");
      asignar(paralelos, "lat");
      const gcps = [];
      for (const m of meridianos)
        for (const q of paralelos) {
          if (m.valor == null || q.valor == null) continue;
          const c = cruce(m, q);
          if (c) gcps.push({ lon: m.valor, lat: q.valor, x: c[0], y: c[1] });
        }
      return { estilo, meridianos, paralelos, gcps };
    });
  const { estilo, meridianos, paralelos, gcps } = intentos.sort((a, b) => b.gcps.length - a.gcps.length)[0] ?? {};
  if (!gcps || gcps.length < 6) throw new Error(`La carta tiene ${gcps?.length ?? 0} cruces de grilla rotulados: no alcanza para ubicarla.`);
  const marco = [
    Math.min(...paralelos.map((q) => q.bb[0])),
    Math.min(...meridianos.map((q) => q.bb[1])),
    Math.max(...paralelos.map((q) => q.bb[2])),
    Math.max(...meridianos.map((q) => q.bb[3])),
  ];
  return { estilo, gcps, marco, pagina: pagina.view };
}

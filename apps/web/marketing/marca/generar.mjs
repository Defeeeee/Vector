// Para correrlo: al lado de este archivo, `fuentes/PlusJakartaSans-800.ttf` (Google Fonts, OFL) y
// `herr/` con `npm i opentype.js@1.3.4`. Escribe las piezas en `salida/`; se copian a
// `apps/web/public/marca/` y `src/components/Marca.tsx` se regenera desde ahí.
// Genera las piezas de la marca en SVG (curvas, sin fuentes) → salida/
import fs from "node:fs";
import { createRequire } from "node:module";
const D = new URL(".", import.meta.url).pathname;
const opentype = createRequire(D + "herr/package.json")("opentype.js");
const OUT = D + "salida/";
fs.mkdirSync(OUT, { recursive: true });

export const COLORES = {
  noche: "#0B0D10",
  carbon: "#16191E",
  blanco: "#FFFFFF",
  cian: "#38BDF8",
  azul: "#2563EB",
  niebla: "#9AA7B4",
};

/* ---------------- isotipo: la flecha de rumbo plegada, a 045° ---------------- */
// En una grilla de 100: punta (50,6), alas (17,92) y (83,92), muesca (50,64). La luz del eje es 3.
const G = 1.5;
const rot = ([x, y], deg = 45, cx = 50, cy = 50) => {
  const r = (deg * Math.PI) / 180;
  return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)];
};
const IZQ = [[50 - G, 6], [50 - G, 64], [17, 92]].map((p) => rot(p));
const DER = [[50 + G, 6], [83, 92], [50 + G, 64]].map((p) => rot(p));
const todos = [...IZQ, ...DER];
const bx0 = Math.min(...todos.map((p) => p[0])), by0 = Math.min(...todos.map((p) => p[1]));
const bx1 = Math.max(...todos.map((p) => p[0])), by1 = Math.max(...todos.map((p) => p[1]));
const ISO_W = bx1 - bx0, ISO_H = by1 - by0;
const pts = (ps, dx = 0, dy = 0, s = 1) => ps.map(([x, y]) => `${((x - bx0) * s + dx).toFixed(2)},${((y - by0) * s + dy).toFixed(2)}`).join(" ");
const iso = (c1, c2, dx = 0, dy = 0, s = 1) => `<polygon points="${pts(IZQ, dx, dy, s)}" fill="${c1}"/><polygon points="${pts(DER, dx, dy, s)}" fill="${c2}"/>`;

/* ---------------- logotipo: "vector" en Plus Jakarta Sans ExtraBold, en curvas ---------------- */
const fuente = opentype.loadSync(D + "fuentes/PlusJakartaSans-800.ttf");
const TRACK = -0.04;
function palabra(alto) {
  const glifos = fuente.stringToGlyphs("vector");
  let x = 0, d = "";
  glifos.forEach((g, i) => {
    d += g.getPath(x, 0, alto).toPathData(2);
    x += (g.advanceWidth / fuente.unitsPerEm) * alto + TRACK * alto;
    if (i < glifos.length - 1) x += (fuente.getKerningValue(g, glifos[i + 1]) / fuente.unitsPerEm) * alto;
  });
  // Caja real de los glifos.
  const tmp = new opentype.Path();
  glifos.forEach(() => {});
  const bb = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, xx = 0;
    glifos.forEach((g, i) => {
      const b = g.getPath(xx, 0, alto).getBoundingBox();
      x0 = Math.min(x0, b.x1); y0 = Math.min(y0, b.y1); x1 = Math.max(x1, b.x2); y1 = Math.max(y1, b.y2);
      xx += (g.advanceWidth / fuente.unitsPerEm) * alto + TRACK * alto;
      if (i < glifos.length - 1) xx += (fuente.getKerningValue(g, glifos[i + 1]) / fuente.unitsPerEm) * alto;
    });
    return { x0, y0, x1, y1 };
  })();
  const xAlto = (fuente.tables.os2.sxHeight / fuente.unitsPerEm) * alto;
  return { d, bb, xAlto };
}

const ALTO = 100; // cuerpo del logotipo
const P = palabra(ALTO);
const PW = P.bb.x1 - P.bb.x0, PH = P.bb.y1 - P.bb.y0;
const X = P.xAlto; // la unidad de la marca: la altura de la x
const texto = (color, dx, dy) => `<path transform="translate(${(dx - P.bb.x0).toFixed(2)},${(dy - P.bb.y0).toFixed(2)})" d="${P.d}" fill="${color}"/>`;

const svg = (w, h, cuerpo, titulo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${titulo}">${cuerpo}</svg>\n`;

const VARIANTES = {
  color: { iso1: COLORES.blanco, iso2: COLORES.cian, letra: COLORES.blanco, fondo: "oscuro" },
  "color-claro": { iso1: COLORES.noche, iso2: COLORES.azul, letra: COLORES.noche, fondo: "claro" },
  blanco: { iso1: COLORES.blanco, iso2: COLORES.blanco, letra: COLORES.blanco, fondo: "oscuro" },
  negro: { iso1: COLORES.noche, iso2: COLORES.noche, letra: COLORES.noche, fondo: "claro" },
};

const piezas = {};
// Isotipo solo: escalado a la altura del logotipo horizontal × 1,25.
const S_ISO = (PH * 1.25) / ISO_H;
for (const [v, c] of Object.entries(VARIANTES)) {
  piezas[`isotipo-${v}`] = svg(ISO_W * S_ISO, ISO_H * S_ISO, iso(c.iso1, c.iso2, 0, 0, S_ISO), "Vector");
  // Horizontal: el isotipo un 25 % más alto que las letras, centrado en la altura de la x; separación 0,8 X.
  const isoH = PH * 1.25, s = isoH / ISO_H, isoW = ISO_W * s;
  const sep = X * 0.5;
  const W = isoW + sep + PW, H = Math.max(isoH, PH);
  const yLetra = (H - PH) / 2 + (isoH - PH) * 0.08;
  piezas[`logo-horizontal-${v}`] = svg(W, H, iso(c.iso1, c.iso2, 0, (H - isoH) / 2, s) + texto(c.letra, isoW + sep, yLetra), "Vector");
  // Vertical: el isotipo arriba, del doble de alto que las letras; separación 0,9 X.
  const isoV = PH * 2.2, sv = isoV / ISO_H, isoVW = ISO_W * sv;
  const WV = Math.max(isoVW, PW), sepV = X * 0.9;
  piezas[`logo-vertical-${v}`] = svg(WV, isoV + sepV + PH, iso(c.iso1, c.iso2, (WV - isoVW) / 2, 0, sv) + texto(c.letra, (WV - PW) / 2, isoV + sepV), "Vector");
  if (v === "blanco" || v === "negro" || v === "color" || v === "color-claro") piezas[`logotipo-${v}`] = svg(PW, PH, texto(c.letra, 0, 0), "Vector");
}

// Ícono de app: cuadrado de esquinas redondeadas (las recorta cada sistema; el SVG lo trae para la web).
function icono(lado, { fondo, c1, c2, zona = 0.62, redondeo = 0.225, conCirculo = false }) {
  const s = (lado * zona) / Math.max(ISO_W, ISO_H);
  const w = ISO_W * s, h = ISO_H * s;
  // Centrado óptico: la masa de la flecha está abajo a la izquierda; se corre un poco hacia arriba y a la derecha.
  const dx = (lado - w) / 2 + lado * 0.012, dy = (lado - h) / 2 - lado * 0.012;
  const base = conCirculo ? `<circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}" fill="${fondo}"/>` : redondeo ? `<rect width="${lado}" height="${lado}" rx="${lado * redondeo}" fill="${fondo}"/>` : `<rect width="${lado}" height="${lado}" fill="${fondo}"/>`;
  return svg(lado, lado, base + iso(c1, c2, dx, dy, s), "Vector");
}
piezas["icono-app"] = icono(1024, { fondo: COLORES.noche, c1: COLORES.blanco, c2: COLORES.cian });
piezas["icono-app-cuadrado"] = icono(1024, { fondo: COLORES.noche, c1: COLORES.blanco, c2: COLORES.cian, redondeo: 0 });
piezas["icono-app-maskable"] = icono(1024, { fondo: COLORES.noche, c1: COLORES.blanco, c2: COLORES.cian, redondeo: 0, zona: 0.5 });
piezas["icono-app-azul"] = icono(1024, { fondo: COLORES.azul, c1: COLORES.blanco, c2: "#BFE6FD" });
piezas["avatar-redes"] = icono(1080, { fondo: COLORES.noche, c1: COLORES.blanco, c2: COLORES.cian, conCirculo: true, zona: 0.5 });
// Favicon: a 16–32 px la luz del eje se pierde; va más grande y sin redondeo exagerado.
piezas["favicon"] = icono(64, { fondo: COLORES.noche, c1: COLORES.blanco, c2: COLORES.cian, zona: 0.74, redondeo: 0.22 });

for (const [n, s] of Object.entries(piezas)) fs.writeFileSync(OUT + n + ".svg", s);
fs.writeFileSync(OUT + "medidas.json", JSON.stringify({ X, ISO_W, ISO_H, PW, PH, IZQ, DER, G, TRACK }, null, 1));
console.log(Object.keys(piezas).length, "piezas; X =", X.toFixed(2));

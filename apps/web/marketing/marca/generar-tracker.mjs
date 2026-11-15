// La marca de Vector Tracker (3.43.0): la flecha de Vector con una estela de tres puntos detrás —lo
// que se sigue— y "vector tracker" en la misma Plus Jakarta Sans ExtraBold del logotipo, en curvas,
// con "tracker" en el cian del lado a la sombra. Misma geometría y mismo método que `generar.mjs`.
//
// Para correrlo, como `generar.mjs`: `fuentes/PlusJakartaSans-800.ttf` y `herr/` con
// `npm i opentype.js@1.3.4` al lado de este archivo (o `FUENTE=` y `HERR=` apuntando a otro lado; no
// se commitean). La TTF sale de la fuente variable de la app, instanciada en 800:
//   fonttools varLib.instancer src/app/fonts/plus-jakarta-sans-latin-wght-normal.woff2 wght=800 -o pjs.woff2
//   (y guardarla sin `flavor` como .ttf). El script comprueba que "vector" dé las mismas curvas que
//   `public/marca/logo-horizontal-color.svg`: si no, la fuente no es la de la marca y no escribe nada.
//
// Escribe en `public/marca/tracker-*.svg` y regenera `src/components/MarcaTracker.tsx`. Los PNG del
// manifest del tracker salen de ahí con `npm run build:iconos`.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const D = new URL(".", import.meta.url).pathname;
const RAIZ = path.resolve(D, "../..");
const HERR = process.env.HERR || D + "herr/";
const opentype = createRequire(path.join(HERR, "package.json"))("opentype.js");
const fuente = opentype.loadSync(process.env.FUENTE || D + "fuentes/PlusJakartaSans-800.ttf");

const C = { noche: "#0B0D10", blanco: "#FFFFFF", cian: "#38BDF8" };

/* ---------------- la flecha, igual que en generar.mjs ---------------- */
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
const MUESCA = rot([50, 64]);

/**
 * Las piezas como datos (polígonos, círculos, trazados), para escribir el SVG y el componente de
 * React con lo mismo.
 */
const flecha = (dx, dy, s) => [
  { tipo: "poligono", lado: "sol", puntos: IZQ.map(([x, y]) => `${((x - bx0) * s + dx).toFixed(2)},${((y - by0) * s + dy).toFixed(2)}`).join(" ") },
  { tipo: "poligono", lado: "sombra", puntos: DER.map(([x, y]) => `${((x - bx0) * s + dx).toFixed(2)},${((y - by0) * s + dy).toFixed(2)}`).join(" ") },
];
// La estela: tres puntos que salen de la muesca hacia atrás (225°), cada uno más chico y más tenue.
const OPACIDADES = [1, 0.7, 0.42];
const estela = (dx, dy, s) =>
  OPACIDADES.map((op, k) => {
    const i = k + 1, paso = 13, r0 = 5.6;
    return {
      tipo: "punto",
      lado: "sombra",
      cx: ((MUESCA[0] - bx0 - Math.SQRT1_2 * paso * i) * s + dx).toFixed(2),
      cy: ((MUESCA[1] - by0 + Math.SQRT1_2 * paso * i) * s + dy).toFixed(2),
      r: (r0 * (1 - k * 0.2) * s).toFixed(2),
      opacidad: op,
    };
  });

const TRACK = -0.04;
function palabra(texto, alto) {
  const glifos = fuente.stringToGlyphs(texto);
  let x = 0, d = "", x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  glifos.forEach((g, i) => {
    const p = g.getPath(x, 0, alto);
    d += p.toPathData(2);
    const b = p.getBoundingBox();
    x0 = Math.min(x0, b.x1); y0 = Math.min(y0, b.y1); x1 = Math.max(x1, b.x2); y1 = Math.max(y1, b.y2);
    x += (g.advanceWidth / fuente.unitsPerEm) * alto + TRACK * alto;
    if (i < glifos.length - 1) x += (fuente.getKerningValue(g, glifos[i + 1]) / fuente.unitsPerEm) * alto;
  });
  return { d, bb: { x0, y0, x1, y1 }, w: x1 - x0, h: y1 - y0, xAlto: (fuente.tables.os2.sxHeight / fuente.unitsPerEm) * alto };
}
const texto = (P, lado, x, base) => ({ tipo: "texto", lado, transform: `translate(${(x - P.bb.x0).toFixed(2)},${base.toFixed(2)})`, d: P.d });

const V = palabra("vector", 100);
const T = palabra("tracker", 100);
const marca = fs.readFileSync(path.join(RAIZ, "public/marca/logo-horizontal-color.svg"), "utf8");
if (!marca.includes(V.d.slice(0, 200))) {
  console.error("La fuente no da las mismas curvas que la marca: no se escribe nada.");
  process.exit(1);
}
const X = V.xAlto;

/* ---------------- las composiciones ---------------- */
const piezas = {};
// Horizontal: el isotipo un 25 % más alto que las letras, con la estela en el margen izquierdo.
{
  const isoH = V.h * 1.25, s = isoH / ISO_H, isoW = ISO_W * s;
  const margen = 34 * s, sep = X * 0.5, espacio = X * 0.42;
  const asc = -V.bb.y0, desc = Math.max(V.bb.y1, T.bb.y1);
  const W = margen + isoW + sep + V.w + espacio + T.w;
  const H = Math.max(isoH + margen * 0.55, asc + desc);
  const base = isoH * 0.5 + V.xAlto * 0.5 + (isoH - V.h) * 0.04;
  const x = margen + isoW + sep;
  piezas.horizontal = { w: W, h: H, partes: [...estela(margen, 0, s), ...flecha(margen, 0, s), texto(V, "sol", x, base), texto(T, "sombra", x + V.w + espacio, base)] };
}
// Apilado: "vector" arriba y "tracker" abajo. La flecha mide lo mismo que el bloque de texto —de lo
// más alto de "vector" a la línea de base de "tracker"— y se alinea arriba y abajo con él; la estela
// sobresale abajo a la izquierda, fuera de esa caja.
{
  const lineas = V.xAlto * 1.95, asc = -V.bb.y0;
  const bloqueH = asc + lineas; // "tracker" no tiene descendentes
  const isoH = bloqueH, s = isoH / ISO_H, isoW = ISO_W * s;
  const sep = X * 0.55;
  // Lo que la estela sobresale de la caja de la flecha.
  const puntos = estela(0, 0, s);
  const izq = Math.max(0, -Math.min(...puntos.map((q) => +q.cx - +q.r)));
  const abajo = Math.max(0, Math.max(...puntos.map((q) => +q.cy + +q.r)) - isoH);
  const W = izq + isoW + sep + Math.max(V.w, T.w);
  const H = isoH + abajo;
  const x = izq + isoW + sep;
  piezas.apilado = { w: W, h: H, partes: [...estela(izq, 0, s), ...flecha(izq, 0, s), texto(V, "sol", x, asc), texto(T, "sombra", x, asc + lineas)] };
}
// Isotipo solo (la flecha con la estela), en un cuadrado.
{
  const lado = 100, s = (lado * 0.86) / Math.max(ISO_W, ISO_H);
  const w = ISO_W * s, h = ISO_H * s, dx = lado - w, dy = 0;
  piezas.isotipo = { w: lado, h: lado, partes: [...estela(dx, dy, s), ...flecha(dx, dy, s)] };
}
// Íconos de la app del tracker (los PNG los rasteriza build-iconos).
function icono(zona, redondeo) {
  const lado = 1024, s = (lado * zona) / Math.max(ISO_W, ISO_H);
  const w = ISO_W * s, h = ISO_H * s;
  // Centrado óptico con la estela: la masa queda abajo a la izquierda, así que se corre hacia allá menos que el de Vector.
  const dx = (lado - w) / 2 + lado * 0.045, dy = (lado - h) / 2 - lado * 0.045;
  return { w: lado, h: lado, fondo: { rx: lado * redondeo }, partes: [...estela(dx, dy, s), ...flecha(dx, dy, s)] };
}
piezas["icono-app"] = icono(0.56, 0.225);
piezas["icono-app-cuadrado"] = icono(0.56, 0);
piezas["icono-app-maskable"] = icono(0.46, 0);

/* ---------------- SVG ---------------- */
const color = { sol: C.blanco, sombra: C.cian };
const svgDe = (p) => {
  const cuerpo = (p.fondo ? `<rect width="${p.w}" height="${p.h}"${p.fondo.rx ? ` rx="${p.fondo.rx}"` : ""} fill="${C.noche}"/>` : "") +
    p.partes
      .map((q) =>
        q.tipo === "poligono"
          ? `<polygon points="${q.puntos}" fill="${color[q.lado]}"/>`
          : q.tipo === "punto"
            ? `<circle cx="${q.cx}" cy="${q.cy}" r="${q.r}" fill="${color[q.lado]}"${q.opacidad < 1 ? ` opacity="${q.opacidad}"` : ""}/>`
            : `<path transform="${q.transform}" d="${q.d}" fill="${color[q.lado]}"/>`
      )
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}" width="${Math.round(p.w)}" height="${Math.round(p.h)}" role="img" aria-label="Vector Tracker">${cuerpo}</svg>\n`;
};
for (const [n, p] of Object.entries(piezas)) fs.writeFileSync(path.join(RAIZ, "public/marca", `tracker-${n}.svg`), svgDe(p));

/* ---------------- componente ---------------- */
const datos = (n) => {
  const p = piezas[n];
  return `{ vb: "0 0 ${p.w.toFixed(2)} ${p.h.toFixed(2)}", partes: ${JSON.stringify(p.partes)} }`;
};
const tsx = `/**
 * La marca de Vector Tracker (3.43.0): la flecha de Vector con una estela de tres puntos detrás y
 * "vector tracker" en Plus Jakarta Sans ExtraBold, en curvas, con "tracker" en cian. El tracker es
 * sólo oscuro: blanco del lado al sol, cian del lado a la sombra.
 *
 * Generado por marketing/marca/generar-tracker.mjs (piezas en public/marca/tracker-*.svg): no se
 * edita a mano.
 */

type Parte =
  | { tipo: "poligono"; lado: "sol" | "sombra"; puntos: string }
  | { tipo: "punto"; lado: "sol" | "sombra"; cx: string; cy: string; r: string; opacidad: number }
  | { tipo: "texto"; lado: "sol" | "sombra"; transform: string; d: string };

const PIEZAS: Record<"horizontal" | "apilado" | "isotipo", { vb: string; partes: Parte[] }> = {
  horizontal: ${datos("horizontal")},
  apilado: ${datos("apilado")},
  isotipo: ${datos("isotipo")},
};

const COLOR = { sol: "fill-white", sombra: "fill-aviation-cyan" } as const;

function Pieza({ cual, className, titulo = "Vector Tracker" }: { cual: keyof typeof PIEZAS; className?: string; titulo?: string }) {
  const p = PIEZAS[cual];
  return (
    <svg viewBox={p.vb} className={className} role="img" aria-label={titulo}>
      {p.partes.map((q, i) =>
        q.tipo === "poligono" ? (
          <polygon key={i} points={q.puntos} className={COLOR[q.lado]} />
        ) : q.tipo === "punto" ? (
          <circle key={i} cx={q.cx} cy={q.cy} r={q.r} className={COLOR[q.lado]} opacity={q.opacidad < 1 ? q.opacidad : undefined} />
        ) : (
          <path key={i} transform={q.transform} d={q.d} className={COLOR[q.lado]} />
        )
      )}
    </svg>
  );
}

/** "vector tracker" en una línea, con la flecha y su estela: el encabezado. */
export function LogoTracker({ className, titulo }: { className?: string; titulo?: string }) {
  return <Pieza cual="horizontal" className={className} titulo={titulo} />;
}

/** "vector" sobre "tracker": para la pantalla de ingreso. */
export function LogoTrackerApilado({ className, titulo }: { className?: string; titulo?: string }) {
  return <Pieza cual="apilado" className={className} titulo={titulo} />;
}

/** La flecha con la estela, sola. */
export function IsotipoTracker({ className, titulo }: { className?: string; titulo?: string }) {
  return <Pieza cual="isotipo" className={className} titulo={titulo} />;
}
`;
fs.writeFileSync(path.join(RAIZ, "src/components/MarcaTracker.tsx"), tsx);
console.log("piezas:", Object.keys(piezas).map((n) => `tracker-${n}.svg`).join(" "), "+ src/components/MarcaTracker.tsx");

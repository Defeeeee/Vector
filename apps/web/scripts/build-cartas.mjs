/**
 * Las cartas de navegación del AIP como capas del Mapa (3.9.0, `src/lib/cartas-aip.ts`).
 *
 *   npm run build:cartas -- <carpeta con ENR-6.1.pdf…> <salida> [inf|sup|vfr…]
 *
 * 1. **Georreferencia** cada carta con su grilla (`scripts/cartas/grilla.mjs`): los cruces de
 *    meridianos y paralelos rotulados son los puntos de control, y se ajusta la Lambert cónica
 *    conforme que la carta declara (`scripts/cartas/lambert.mjs`). El ajuste, con sus puntos, va a
 *    `src/data/cartas-aip.json` (commiteado: el test `cartas-aip.test.ts` lo revisa).
 * 2. **Dibuja** el marco de la carta a alta resolución (`scripts/cartas/dibujar.mjs`).
 * 3. **Corta** cada capa en teselas WebP (`scripts/cartas/teselar.mjs`): `<salida>/<capa>/z/x/y.webp`.
 *
 * Las teselas no van al repo: se suben al VPS, a `~/Vector/datos/cartas/`, con
 *   rsync -a --delete <salida>/ ubuntu@oraclearm:Vector/datos/cartas/
 * y cambiar `AIRAC_CARTAS` en `lib/cartas-aip.ts` hace que los navegadores las vuelvan a pedir.
 *
 * **Los PDF se bajan desde un navegador** (AIP → ENR → ENR 6), no con este script: ANAC bloquea
 * las IPs que le piden con scripts (AGENTS.md). Se llaman como el documento: ENR-6.1.pdf.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { grillaDeCarta } from "./cartas/grilla.mjs";
import { ajustar } from "./cartas/lambert.mjs";
import { dibujar } from "./cartas/dibujar.mjs";
import { teselar } from "./cartas/teselar.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = path.join(RAIZ, "src", "data", "cartas-aip.json");

/**
 * Cada capa, sus cartas en orden de prioridad (donde se pisan, gana la primera), los niveles de
 * zoom y la escala de dibujo: ~200 m por píxel en las ENR (1:2.300.000) para z9, ~30 m en las
 * VFR (1:500.000) para z12.
 */
const CAPAS = {
  inf: { zoom: [5, 9], escala: 4, cartas: [["ENR 6.1", "INF 1"], ["ENR 6.3", "INF 2"], ["ENR 6.5", "INF 3"]] },
  sup: { zoom: [5, 9], escala: 4, cartas: [["ENR 6.2", "SUP 1"], ["ENR 6.4", "SUP 2"], ["ENR 6.6", "SUP 3"]] },
  vfr: { zoom: [8, 12], escala: 5.6, cartas: [["ENR 6.10", "VFR TMA Baires"], ["ENR 6.9", "VFR TMA Córdoba"]] },
};

const [carpeta, salida, ...pedidas] = process.argv.slice(2);
if (!carpeta || !salida) {
  console.error("Uso: npm run build:cartas -- <carpeta con ENR-6.N.pdf> <salida> [inf|sup|vfr…]");
  process.exit(1);
}
const capas = pedidas.length ? pedidas : Object.keys(CAPAS);
const datos = fs.existsSync(DATOS) ? JSON.parse(fs.readFileSync(DATOS, "utf8")) : { cartas: {} };
const r2 = (v) => Math.round(v * 100) / 100;

for (const capa of capas) {
  const cfg = CAPAS[capa];
  if (!cfg) throw new Error(`Capa desconocida: ${capa}`);
  const cartas = [];
  for (const [documento, nombre] of cfg.cartas) {
    const archivo = path.join(carpeta, `${documento.replace(" ", "-")}.pdf`);
    const bytes = fs.readFileSync(archivo);
    const grilla = await grillaDeCarta(bytes);
    const ajuste = ajustar(grilla.gcps);
    console.log(`${documento} (${nombre}): ${grilla.gcps.length} cruces, n ${ajuste.n.toFixed(4)}, error medio ${ajuste.rmsPt.toFixed(3)} pt, máximo ${ajuste.maxPt.toFixed(3)} pt`);
    datos.cartas[documento] = {
      nombre,
      capa,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      estiloGrilla: grilla.estilo,
      marco: grilla.marco.map(r2),
      n: ajuste.n,
      lon0: ajuste.lon0,
      semejanza: ajuste.semejanza,
      rmsPt: r2(ajuste.rmsPt * 100) / 100,
      maxPt: r2(ajuste.maxPt * 100) / 100,
      gcps: grilla.gcps.map((g) => ({ lon: g.lon, lat: g.lat, x: r2(g.x), y: r2(g.y) })),
    };
    const imagen = await dibujar(archivo, grilla.marco, cfg.escala);
    console.log(`  dibujada: ${imagen.ancho}×${imagen.alto} px`);
    cartas.push({ ajuste: datos.cartas[documento], imagen });
  }
  const dir = path.join(salida, capa);
  fs.rmSync(dir, { recursive: true, force: true });
  const resumen = await teselar(cartas, cfg.zoom[0], cfg.zoom[1], dir);
  for (const r of resumen) console.log(`  ${capa} z${r.z}: ${r.teselas} teselas, ${(r.bytes / 1e6).toFixed(1)} MB`);
}
fs.writeFileSync(DATOS, JSON.stringify(datos, null, 1) + "\n");
console.log(`Ajustes en ${path.relative(RAIZ, DATOS)}.`);

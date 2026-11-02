/**
 * La demo de la pegatina con QR: arma el HTML con `src/lib/pegatinas-hoja.ts` (el mismo de la
 * hoja que se imprime desde el panel) y lo exporta a PNG y a una hoja A4 en PDF.
 *
 *   node marketing/pegatinas.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hojaDePegatinas } from "../src/lib/pegatinas-hoja.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://vector.fdiaznem.com.ar";
// El HTML intermedio va a una carpeta temporal: en `salida/` quedan sólo el PNG y el PDF.
const TMP = mkdtempSync(join(tmpdir(), "pegatinas-"));

writeFileSync(join(TMP, "pegatina-lugar.html"), await hojaDePegatinas(["K7P2"], BASE, { sola: true }));
writeFileSync(join(TMP, "pegatinas-lugar-a4.html"), await hojaDePegatinas(["K7P2", "M3XA", "R8TD", "H4NQ", "C9WE", "Y2BK", "P6FJ", "X7MG", "D3RU", "T9HZ"], BASE));
const chrome = (args) => execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--virtual-time-budget=8000", ...args], { stdio: "ignore" });
chrome(["--hide-scrollbars", "--force-device-scale-factor=4", "--window-size=303,190", `--screenshot=${join(AQUI, "salida", "pegatina-lugar.png")}`, `file://${join(TMP, "pegatina-lugar.html")}`]);
chrome(["--no-pdf-header-footer", `--print-to-pdf=${join(AQUI, "salida", "pegatinas-lugar-a4.pdf")}`, `file://${join(TMP, "pegatinas-lugar-a4.html")}`]);
console.log("marketing/salida/pegatina-lugar.png y pegatinas-lugar-a4.pdf");

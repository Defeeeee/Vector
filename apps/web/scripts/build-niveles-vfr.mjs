// Niveles de crucero VFR de la AIP ENR 1.7 → src/data/niveles-vfr.json.
// Lee el texto commiteado (src/data/aip/ENR-1.7.txt); no pide nada a la red.
import fs from "node:fs";
import { parsearNivelesVfr } from "./niveles-vfr-parse.mjs";

const texto = fs.readFileSync("src/data/aip/ENR-1.7.txt", "utf8");
const { col2, col4 } = parsearNivelesVfr(texto);
fs.writeFileSync("src/data/niveles-vfr.json", JSON.stringify({ fuente: "AIP ENR 1.7-6/1.7-7, AIRAC AMDT 3/2022", col2, col4 }, null, 1) + "\n");
console.log(`col. 2: ${col2.length} niveles; col. 4: ${col4.length} niveles`);

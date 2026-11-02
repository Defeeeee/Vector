// La hoja del libro de vuelo en PDF, con los mismos vuelos de prueba de backend-falso.mjs.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const jiti = createJiti(import.meta.url, { alias: { "@": join(RAIZ, "src") } });
const { armarLibro, apellidoYNombre, valoresDeApertura } = await jiti.import(join(RAIZ, "src/lib/libro-anac.ts"));
const { pdfDelLibro } = await jiti.import(join(RAIZ, "src/lib/libro-anac-pdf.ts"));
const { DATOS } = await import(join(AQUI, "backend-falso.mjs"));

const apertura = valoresDeApertura(null);
const hojas = armarLibro({ vuelos: DATOS.vuelos, aeronaves: DATOS.aviones, apertura, renglonesPorHoja: 15 });
const bytes = await pdfDelLibro(
  hojas,
  { apellidoYNombre: apellidoYNombre(DATOS.perfil.first_name, DATOS.perfil.last_name), licencia: "PPA", licenciaNumero: "123456", legajo: "" },
  { generado: "06/10/2026", apertura, renglonesPorHoja: 15 }
);
writeFileSync(join(AQUI, "libro-ejemplo.pdf"), bytes);
console.log(`libro-ejemplo.pdf: ${hojas.length} hojas`);

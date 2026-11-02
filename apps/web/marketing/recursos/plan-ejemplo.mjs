// El plan de vuelo de EANA, la demora y la cancelación, con un piloto inventado: los arma el
// mismo código de Vector (`lib/formulario-plan.ts`, `lib/plan-de-vuelo-pdf.ts`). Para las
// piezas del carrusel del plan de vuelo (`marketing/plan-de-vuelo.html`).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const jiti = createJiti(import.meta.url, { alias: { "@": join(RAIZ, "src") } });
const { formularioVacio, revisar } = await jiti.import(join(RAIZ, "src/lib/formulario-plan.ts"));
const { planConDemora, planVigente } = await jiti.import(join(RAIZ, "src/lib/demora-plan.ts"));
const { pdfPlanDeVuelo, pdfDemora, pdfCancelacion } = await jiti.import(join(RAIZ, "src/lib/plan-de-vuelo-pdf.ts"));

const f = {
  ...formularioVacio(),
  matricula: "LVABC",
  tipoAeronave: "C152",
  equipo: "SDGZ",
  vigilancia: "C",
  salida: { codigo: "SADF", nombre: "San Fernando", lat: -34.4532, lon: -58.5896 },
  destino: { codigo: "SADM", nombre: "Morón", lat: -34.6763, lon: -58.6428 },
  altn1: { codigo: "SAEZ", nombre: "Ezeiza", lat: -34.8222, lon: -58.5358 },
  dofUtc: "2026-10-24",
  eobtUtc: "1830",
  velocidad: "N0095",
  nivel: "VFR",
  ruta: "DCT",
  eet: "0020",
  autonomia: "0330",
  personas: "2",
  colorMarcas: "BLANCO Y ROJO",
  otros: { RMK: "VUELO DE INSTRUCCION" },
  piloto: "LUCIA FERRARI PPA 12345678",
  oficina: "SADF",
};
const r = revisar(f, "2026-10-24T12:00:00Z");
if (!r.completo) throw new Error(`El plan de ejemplo no está completo: ${JSON.stringify(r.errores)}`);
const firmaPng = new Uint8Array(readFileSync(join(AQUI, "plan-ejemplo/firma.png")));
const datos = (plan) => ({ plan, eobt: plan.c13hora, c18: plan.c18, nombre: "LUCIA FERRARI", licencia: "123456" });

writeFileSync(join(AQUI, "plan-ejemplo/plan.pdf"), await pdfPlanDeVuelo(r.plan, { fondoJpg: new Uint8Array(readFileSync(join(RAIZ, "src/lib/plan-de-vuelo-eana.jpg"))), firmaPng }));
const demorado = planConDemora(r.plan, { dof: "2026-10-24", eobt: "1930" });
writeFileSync(join(AQUI, "plan-ejemplo/demora.pdf"), await pdfDemora(datos(demorado), { fondoPng: new Uint8Array(readFileSync(join(RAIZ, "src/lib/plan-de-vuelo-dla.png"))), firmaPng }));
writeFileSync(join(AQUI, "plan-ejemplo/cancelacion.pdf"), await pdfCancelacion(datos(planVigente(r.plan, [])), { fondoPng: new Uint8Array(readFileSync(join(RAIZ, "src/lib/plan-de-vuelo-cnl.png"))), firmaPng }));
console.log("plan-ejemplo/: plan.pdf, demora.pdf, cancelacion.pdf");

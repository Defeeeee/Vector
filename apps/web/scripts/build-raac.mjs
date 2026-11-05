/**
 * Genera `src/data/raac/raac-<parte>.json`: el texto de una Parte de la RAAC, partido por
 * sección, para que el copiloto conteste preguntas de reglamento citando la norma
 * (`lib/raac.ts`, la herramienta `consultar_raac` de `/api/chat`).
 *
 *   npm run build:raac -- 61 /ruta/a/raac61.pdf
 *   npm run build:raac -- 61            (baja el PDF de FUENTES: no desde la red de Federico)
 *
 * ## De dónde
 *
 * - **Parte 61, VI edición con la Enmienda I (13 de mayo de 2026, Res. ANAC 292/2026)**: en
 *   `docs.anac.gob.ar` (link de la planilla "RAAC Vigentes" de argentina.gob.ar). Hasta el
 *   2026-11-05 era el anexo de la Res. ANAC 65/2026 en Infoleg, que no trae la enmienda.
 * - **Parte 91, IV edición (22 de mayo de 2026, Res. ANAC 311/2026)**: sólo en
 *   `docs.anac.gob.ar` (link de la planilla "RAAC Vigentes" de argentina.gob.ar). Bajada el
 *   2026-11-05 **desde el navegador**, no con este script: ANAC bloquea las IPs que le piden
 *   con scripts (AGENTS.md). Pasá el PDF como segundo argumento.
 *
 * ## Cómo se parte
 *
 * Cada sección empieza en un renglón propio: "61.020 Licencias otorgadas…". El índice del
 * principio repite los números con el título; de cada número se queda con el bloque más largo,
 * que es el del cuerpo. Se sacan los encabezados de página y se unen las palabras cortadas
 * con guion al final del renglón. **El texto no se resume ni se corrige**: es lo que dice el
 * PDF, para poder citarlo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
import { UA_VECTOR } from "./ua-vector.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTES = {
  61: {
    url: "https://docs.anac.gob.ar/index.php/s/PtMG8j8sFeRyren/download",
    titulo: "Licencias y habilitaciones para pilotos",
    edicion: "VI Edición, Enmienda I, mayo 2026 (Res. ANAC 292/2026)",
  },
  91: {
    url: "https://docs.anac.gob.ar/index.php/s/FX7dJTFy9fxGCxE/download",
    titulo: "Reglas de vuelo y operación general",
    edicion: "IV Edición, mayo 2026 (Res. ANAC 311/2026)",
  },
};

const [parte, local] = process.argv.slice(2);
if (!FUENTES[parte]) {
  console.error(`Uso: npm run build:raac -- <${Object.keys(FUENTES).join("|")}> [pdf]`);
  process.exit(1);
}
const fuente = FUENTES[parte];

const bytes = local
  ? fs.readFileSync(local)
  : Buffer.from(await (await fetch(fuente.url, { headers: { "User-Agent": UA_VECTOR } })).arrayBuffer());
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const { text: paginas } = await extractText(pdf, { mergePages: false });

// Los renglones de cada página, sin los encabezados ("RAAC PARTE 61 Capítulo A",
// "ADMINISTRACIÓN NACIONAL VI Edición Enero 2026", "DE AVIACIÓN CIVIL 8").
const ENCABEZADO = [
  new RegExp(`^RAAC PARTE ${parte}\\b`, "i"),
  /^ADMINISTRACI[ÓO]N NACIONAL\b/i,
  /^DE AVIACI[ÓO]N CIVIL\b/i,
  // La 91 lleva la edición en un renglón aparte: "4º Edición 22 mayo 2026", "4º Edición".
  /^\d+ ?[º°] ?Edici[óo]n\b/i,
  /^Edici[óo]n( \d{1,2} [a-z]+ \d{4})?$/i,
  /^\d{1,2} (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) \d{4}$/i,
  // La portada de cada subparte y apéndice.
  /^REGULACIONES ARGENTINAS DE AVIACI[ÓO]N CIVIL\b/,
  new RegExp(`^PARTE ${parte}\\b`),
];
const renglones = [];
paginas.forEach((texto, i) => {
  for (const r of texto.split("\n")) {
    // "61. 500 Aplicación": el PDF a veces corta el número de la sección con un espacio.
    const limpio = r.replace(/\s+/g, " ").trim().replace(new RegExp(`^${parte}\\. (\\d{3,4})\\b`), `${parte}.$1`);
    if (limpio && !ENCABEZADO.some((e) => e.test(limpio))) renglones.push({ texto: limpio, pagina: i + 1 });
  }
});

// "CAPÍTULO E — LICENCIA DE PILOTO COMERCIAL": cada sección guarda su capítulo, porque los
// títulos se repiten ("Experiencia de vuelo" está en cada licencia) y el capítulo dice cuál es.
// La 91 se parte en subpartes ("SUBPARTE B – REGLAS DE VUELO"), y sus secciones van de 91.1
// a 91.1721: el número puede tener de una a cuatro cifras.
const CAPITULO = /^(CAP[IÍ]TULO|SUBPARTE) ([A-Z]{1,2}) ?[—–-] ?(.+)$/;
// "91.153 (d) (3) de esta Parte)…" o "91.903 y 91.153…" son citas que quedaron al principio de
// un renglón, no secciones (se tragaban el resto de la Parte): el título no empieza con un
// inciso, un número ni un conector. Sí puede ir en minúscula ("91.103 información sobre
// vuelos.") o después de una raya ("91.510 – Equipamiento…").
const CONECTOR = "(?:de|del|y|e|o|u|a|al|en|la|el|los|las|según|segun|para|que|con|por|se|inciso|párrafo)\\b";
const INICIO = new RegExp(`^(${parte}\\.\\d{1,4}[A-Z]?)(?:\\s+(?:[—–-]\\s*)?((?!\\(|\\d|${CONECTOR}).+))?$`);
// "APÉNDICE D – MÍNIMOS METEOROLÓGICOS…": cada apéndice es su propio bloque, para que no se
// sume a la última sección. Se cita como "91 Apéndice D".
// "APÉNDICE A 1.1 09/08/2022" es un renglón de la lista de páginas, no el apéndice.
const APENDICE = /^AP[ÉE]NDICE ([A-Z]{1,2})\b\s*[—–.-]?\s*((?!\d).*)$/;
// En el cuerpo, un apéndice a veces arranca sólo con su título, sin "APÉNDICE C –" (el de la
// autorización de vuelo solo del alumno en la 61): el título se reconoce por el índice.
const tituloApendice = new Map();
for (const r of renglones) {
  const a = APENDICE.exec(r.texto);
  if (a && a[2].trim().length > 10) tituloApendice.set(a[2].trim().toUpperCase(), a[1]);
}
const bloques = [];
let capitulo = "";
for (const r of renglones) {
  const c = CAPITULO.exec(r.texto);
  if (c) {
    const nombre = c[3].trim().toLowerCase().replace(/^./, (x) => x.toUpperCase());
    capitulo = `${/^S/.test(c[1]) ? "Subparte" : "Capítulo"} ${c[2]}: ${nombre}`;
    continue;
  }
  const a = APENDICE.exec(r.texto);
  const soloTitulo = !a && tituloApendice.get(r.texto.toUpperCase());
  if (a || soloTitulo) {
    const letra = a ? a[1] : soloTitulo;
    const titulo = (a ? a[2] : r.texto).trim().toLowerCase().replace(/^./, (x) => x.toUpperCase());
    bloques.push({ seccion: `${parte} Apéndice ${letra}`, titulo, capitulo: "", pagina: r.pagina, lineas: [] });
    continue;
  }
  const m = INICIO.exec(r.texto);
  if (m) bloques.push({ seccion: m[1], titulo: (m[2] ?? "").trim(), capitulo, pagina: r.pagina, lineas: [] });
  else if (bloques.length) bloques.at(-1).lineas.push(r.texto);
}

/** Une "otor-" + "gada" y los renglones partidos, pero respeta los incisos (a), (1), (i). */
function unir(lineas) {
  let salida = "";
  for (const l of lineas) {
    if (!salida) salida = l;
    else if (/-$/.test(salida) && /^[a-záéíóúñ]/.test(l)) salida = salida.slice(0, -1) + l;
    else if (/^\(([a-z]{1,4}|\d{1,2})\)/.test(l)) salida += "\n" + l;
    else salida += " " + l;
  }
  return salida.trim();
}

const porSeccion = new Map();
for (const b of bloques) {
  const texto = unir(b.lineas);
  const previo = porSeccion.get(b.seccion);
  if (!previo || texto.length > previo.texto.length) porSeccion.set(b.seccion, { seccion: b.seccion, titulo: b.titulo, capitulo: b.capitulo, pagina: b.pagina, texto });
}
// Las secciones por número y los apéndices al final, por letra.
const orden = (s) => (s.seccion.includes("Apéndice") ? `~${s.seccion}` : s.seccion);
const secciones = [...porSeccion.values()].filter((s) => s.texto.length > 0).sort((a, b) => orden(a).localeCompare(orden(b), "es", { numeric: true }));

const salida = path.join(RAIZ, "src", "data", "raac", `raac-${parte}.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(
  salida,
  JSON.stringify({ parte: Number(parte), titulo: fuente.titulo, edicion: fuente.edicion, fuente: fuente.url, secciones }, null, 1) + "\n"
);
console.log(`raac-${parte}.json: ${secciones.length} secciones, ${secciones.reduce((t, s) => t + s.texto.length, 0)} caracteres.`);

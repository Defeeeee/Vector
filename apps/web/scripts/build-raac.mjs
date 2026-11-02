/**
 * Genera `src/data/raac/raac-<parte>.json`: el texto de una Parte de la RAAC, partido por
 * sección, para que el copiloto conteste preguntas de reglamento citando la norma
 * (`lib/raac.ts`, la herramienta `consultar_raac` de `/api/chat`).
 *
 *   npm run build:raac -- 61 /ruta/a/raac61.pdf
 *   npm run build:raac -- 61            (baja el PDF de FUENTES)
 *
 * ## De dónde
 *
 * - **Parte 61, VI edición (enero 2026)**: el anexo de la Res. ANAC 65/2026 en Infoleg (el
 *   servicio oficial de información legislativa). ANAC también la publica en
 *   `docs.anac.gob.ar` (link de la lista de RAAC de argentina.gob.ar), que a veces no contesta.
 * - **Parte 91**: sólo en `docs.anac.gob.ar`. La edición vigente es la de la Res. ANAC
 *   864-E/2017 con sus enmiendas (la última grande, Res. ANAC 957/2025).
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

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTES = {
  61: {
    url: "https://servicios.infoleg.gob.ar/infolegInternet/anexos/420000-424999/422623/res65.pdf",
    titulo: "Licencias y habilitaciones para pilotos",
    edicion: "VI Edición, enero 2026 (Res. ANAC 65/2026)",
  },
  91: {
    url: "https://docs.anac.gob.ar/index.php/s/FX7dJTFy9fxGCxE/download",
    titulo: "Reglas de vuelo y operación general",
    edicion: "",
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
  : Buffer.from(await (await fetch(fuente.url, { headers: { "User-Agent": "Mozilla/5.0 (Vector)" } })).arrayBuffer());
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const { text: paginas } = await extractText(pdf, { mergePages: false });

// Los renglones de cada página, sin los encabezados ("RAAC PARTE 61 Capítulo A",
// "ADMINISTRACIÓN NACIONAL VI Edición Enero 2026", "DE AVIACIÓN CIVIL 8").
const ENCABEZADO = [
  new RegExp(`^RAAC PARTE ${parte}\\b`, "i"),
  /^ADMINISTRACI[ÓO]N NACIONAL\b/i,
  /^DE AVIACI[ÓO]N CIVIL\b/i,
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
const CAPITULO = /^CAP[IÍ]TULO ([A-Z]{1,2}) ?[—–-] ?(.+)$/;
const INICIO = new RegExp(`^(${parte}\\.\\d{3,4}[A-Z]?)(?:\\s+(.*))?$`);
const bloques = [];
let capitulo = "";
for (const r of renglones) {
  const c = CAPITULO.exec(r.texto);
  if (c) {
    const nombre = c[2].trim().toLowerCase().replace(/^./, (x) => x.toUpperCase());
    capitulo = `Capítulo ${c[1]}: ${nombre}`;
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
const secciones = [...porSeccion.values()].filter((s) => s.texto.length > 0).sort((a, b) => a.seccion.localeCompare(b.seccion, "es", { numeric: true }));

const salida = path.join(RAIZ, "src", "data", "raac", `raac-${parte}.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(
  salida,
  JSON.stringify({ parte: Number(parte), titulo: fuente.titulo, edicion: fuente.edicion, fuente: fuente.url, secciones }, null, 1) + "\n"
);
console.log(`raac-${parte}.json: ${secciones.length} secciones, ${secciones.reduce((t, s) => t + s.texto.length, 0)} caracteres.`);

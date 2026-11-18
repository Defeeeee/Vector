/**
 * Una planilla (xlsx o csv) pasada a texto, para que Gemini la lea como un libro de vuelo de
 * **cualquier formato**: columnas con cualquier nombre y en cualquier orden.
 *
 * Sin dependencias: un xlsx es un zip con XML adentro (Office Open XML). Se lee el directorio del
 * zip, se infla cada parte con `zlib` y se sacan las celdas con expresiones regulares, que alcanzan
 * para el XML que escriben Excel, Google Sheets y LibreOffice. Las fechas y horas, que en el xlsx son
 * números de serie, se escriben como fecha (AAAA-MM-DD) u hora (HH:MM) según el formato de la celda:
 * así Gemini no tiene que adivinar que 45678 es una fecha. El xls viejo (binario) no se lee: se pide
 * guardarlo como xlsx o csv.
 */
import zlib from "node:zlib";

export interface Hoja {
  nombre: string;
  filas: string[][];
}

// ── El zip ──────────────────────────────────────────────────────────────────────────────────────
function leerZip(buf: Buffer): Map<string, Buffer> {
  const archivos = new Map<string, Buffer>();
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("No es un archivo xlsx.");
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10), comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28), largoExtra = buf.readUInt16LE(p + 30), largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString("utf8");
    const datos = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const crudo = buf.subarray(datos, datos + comprimido);
    if (metodo === 0) archivos.set(nombre, Buffer.from(crudo));
    else if (metodo === 8) archivos.set(nombre, zlib.inflateRawSync(crudo));
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

// ── El XML de Office ────────────────────────────────────────────────────────────────────────────
const desescapar = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
const textos = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1])).join("");

/** Qué estilos de celda son fecha, hora o fecha y hora (por su formato de número). */
function formatosDeFecha(estilos: string | undefined): ("fecha" | "hora" | "fechahora" | null)[] {
  if (!estilos) return [];
  const propios = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) propios.set(Number(m[1]), desescapar(m[2]));
  const xfs = estilos.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map((m) => {
    const id = Number(m[1]);
    if ((id >= 14 && id <= 17) || id === 22) return id === 22 ? "fechahora" : "fecha";
    if (id >= 18 && id <= 21) return "hora";
    if (id === 45 || id === 46 || id === 47) return "hora";
    const f = (propios.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "").toLowerCase();
    const fecha = /[dy]/.test(f) || /m{3,}/.test(f), hora = /h|s/.test(f);
    return fecha && hora ? "fechahora" : fecha ? "fecha" : hora ? "hora" : null;
  });
}

/** Un número de serie de Excel (días desde 1899-12-30) como fecha y/u hora. */
export function serieAFecha(n: number, tipo: "fecha" | "hora" | "fechahora"): string {
  const ms = Math.round(n * 86_400_000) + Date.UTC(1899, 11, 30);
  const iso = new Date(ms).toISOString();
  if (tipo === "hora") {
    const min = Math.round((n - Math.floor(n)) * 1440);
    return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  return tipo === "fecha" ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

const columna = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Las hojas de un xlsx, con sus filas como texto. */
export function leerXlsx(buf: Buffer): Hoja[] {
  const zip = leerZip(buf);
  const txt = (n: string) => zip.get(n)?.toString("utf8");
  const compartidos = [...(txt("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const fechas = formatosDeFecha(txt("xl/styles.xml"));
  const libro = txt("xl/workbook.xml") ?? "";
  const rels = txt("xl/_rels/workbook.xml.rels") ?? "";
  const attr = (tag: string, nombre: string) => tag.match(new RegExp(`\\s${nombre}="([^"]*)"`))?.[1] ?? "";
  // Los atributos vienen en cualquier orden (Excel, Sheets y openpyxl los escriben distinto).
  const destino = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target").replace(/^\/?xl\//, "")]));
  const hojas: Hoja[] = [];
  for (const [tag] of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const m = [tag, attr(tag, "name"), attr(tag, "r:id")];
    const xml = txt(`xl/${destino.get(m[2]) ?? ""}`);
    if (!xml) continue;
    const filas: string[][] = [];
    for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila: string[] = [];
      for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], cuerpo = c[2] ?? "";
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
        const tipo = attrs.match(/\bt="([^"]+)"/)?.[1];
        const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
        const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let valor = "";
        if (tipo === "s" && v !== undefined) valor = compartidos[Number(v)] ?? "";
        else if (tipo === "inlineStr") valor = textos(cuerpo);
        else if (v !== undefined) {
          const formato = fechas[estilo];
          valor = formato && tipo !== "str" && /^-?\d+(\.\d+)?$/.test(v) ? serieAFecha(Number(v), formato) : desescapar(v);
        }
        fila[ref ? columna(ref) : fila.length] = valor.trim();
      }
      const limpia = Array.from(fila, (x) => x ?? "");
      if (limpia.some((x) => x)) filas.push(limpia);
    }
    if (filas.length) hojas.push({ nombre: desescapar(m[1]), filas });
  }
  return hojas;
}

/** Un CSV (coma, punto y coma o tabulador, con comillas) como una hoja. */
export function leerCsv(texto: string, nombre = "planilla"): Hoja[] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda.trim()); celda = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda.trim()); celda = "";
      if (fila.some((x) => x)) filas.push(fila);
      fila = [];
    } else celda += ch;
  }
  fila.push(celda.trim());
  if (fila.some((x) => x)) filas.push(fila);
  return filas.length ? [{ nombre, filas }] : [];
}

/** Cuántas filas de datos van a Gemini en cada pedido (con el encabezado de la hoja adelante). */
export const FILAS_POR_LOTE = 80;
/** Las primeras filas de la hoja, que llevan los encabezados (a veces en dos o tres renglones). */
const FILAS_DE_ENCABEZADO = 6;

export interface LotePlanilla {
  hoja: string;
  encabezado: string[][];
  filas: string[][];
  desde: number;
}

/** Parte las hojas en lotes de filas; cada lote lleva el encabezado de su hoja. */
export function lotesDePlanilla(hojas: Hoja[]): LotePlanilla[] {
  const lotes: LotePlanilla[] = [];
  for (const h of hojas) {
    const encabezado = h.filas.slice(0, FILAS_DE_ENCABEZADO);
    const cuerpo = h.filas.slice(FILAS_DE_ENCABEZADO);
    if (!cuerpo.length) { lotes.push({ hoja: h.nombre, encabezado: [], filas: encabezado, desde: 1 }); continue; }
    for (let i = 0; i < cuerpo.length; i += FILAS_POR_LOTE)
      lotes.push({ hoja: h.nombre, encabezado, filas: cuerpo.slice(i, i + FILAS_POR_LOTE), desde: FILAS_DE_ENCABEZADO + i + 1 });
  }
  return lotes;
}

/** Un lote como texto para el prompt: cada fila con su número, las celdas separadas por " | ". */
export function textoDelLote(l: LotePlanilla): string {
  const fila = (f: string[], n: number) => `${n}: ${f.join(" | ")}`;
  return [
    `Hoja «${l.hoja}».`,
    l.encabezado.length ? `Primeras filas de la hoja (encabezados):\n${l.encabezado.map((f, i) => fila(f, i + 1)).join("\n")}` : "",
    `Filas a leer:\n${l.filas.map((f, i) => fila(f, l.desde + i)).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}

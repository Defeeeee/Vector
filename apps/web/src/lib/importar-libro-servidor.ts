/**
 * Leer un libro subido, en segundo plano (Federico, 2026-11-17).
 *
 * `POST /api/importar-libro` guarda el archivo y contesta enseguida; esto lo lee de a lotes
 * (un PDF en tramos de 3 páginas, las fotos de a 4), y al terminar avisa por mail y push.
 *
 * - **El archivo** vive en `<datos>/importaciones/<id>/` (`carpetaDeDatos`, fuera del repo; es el
 *   libro del piloto: privado). Se borra al importar o descartar y a los 7 días (barrido).
 * - **Cada lote se guarda** al terminar (`lote-<n>.json`): un deploy reinicia `next start` y el
 *   barrido (`/api/cron/importaciones`) retoma desde el lote donde quedó, sin repetir lo leído.
 * - El estado y el latido van al backend (`/importaciones-libro-interno`, con el secreto de los
 *   barridos). Si el piloto descartó el trabajo, el próximo lote lo nota y se corta.
 * - Un lote que falla se reintenta una vez; si vuelve a fallar se sigue con el resto y se anota
 *   el rango (`lotes_fallidos`): nunca se pierde lo leído ni se dice "listo" a medias.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { carpetaDeDatos } from "@/lib/madhel-descargado";
import { getAirport } from "@/lib/airports";
import { leerHojasConGemini, type ParteArchivo } from "@/lib/leer-libro-gemini";
import {
  avionesNuevos, corregirLectura, esFilaDeTotales, lotesPendientes, partirEnLotes, textoDeHojas, TAM_LOTE_FOTOS, TAM_LOTE_PDF, unirLotes, unirRangos,
  type Rango, type VueloLeido,
} from "@/lib/importar-libro";
import { armarMensajeImportacion } from "@/lib/importar-libro-mail";
import { enviarConSeguimiento } from "@/lib/mail-envio";
import { mailConfigurado } from "@/lib/mailer";
import { SITIO_URL } from "@/lib/sitio";

const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";

export interface MetaImportacion {
  tipo: "pdf" | "fotos";
  /** Hojas: páginas del PDF o cantidad de fotos. */
  hojas: number;
  /** Nombres de archivo de las fotos, en orden. */
  archivos: string[];
}

export const carpetaDeImportacion = (id: string) => path.join(carpetaDeDatos(), "importaciones", id);
const IDS = /^[0-9a-f-]{36}$/i;

/** Los trabajos que este proceso está leyendo ahora: el barrido no retoma uno que sigue andando. */
const enCurso = new Set<string>();

function cabeceras(): Record<string, string> {
  return { "X-Cron-Secret": process.env.DOCUMENTS_ALERT_SECRET ?? "", "Content-Type": "application/json" };
}

async function interno<T>(ruta: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; datos: T | null }> {
  try {
    const res = await fetch(`${API_URL}/importaciones-libro-interno${ruta}`, { ...init, headers: { ...cabeceras(), ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return { ok: res.ok, status: res.status, datos: res.ok ? ((await res.json().catch(() => null)) as T) : null };
  } catch {
    return { ok: false, status: 0, datos: null };
  }
}

/** Escribe el avance. `false` si el piloto descartó el trabajo (hay que cortar). */
async function avanzar(id: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  const r = await interno<{ actualizada: boolean }>(`/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
  // Sin red al backend no se corta el trabajo: el archivo y los lotes están guardados.
  return r.ok ? !!r.datos?.actualizada : true;
}

interface FilaImportacion {
  id: string;
  user_id: string;
  estado: string;
  paginas_total: number;
  lotes_fallidos: Rango[];
  resultado: { vuelos?: VueloLeido[]; aviones?: unknown[] } | null;
  aviso_enviado_at: string | null;
  email: string | null;
  first_name: string | null;
  matriculas: string[];
}

const archivoDeLote = (dir: string, n: number) => path.join(dir, `lote-${n}.json`);

interface LoteGuardado {
  vuelos: VueloLeido[];
  fallo?: boolean;
}

async function leerLoteGuardado(dir: string, n: number): Promise<LoteGuardado | null> {
  try {
    return JSON.parse(await fs.readFile(archivoDeLote(dir, n), "utf8")) as LoteGuardado;
  } catch {
    return null;
  }
}

/** Las partes que se le mandan a Gemini por lote: un PDF chico o las fotos del tramo. */
async function partesDelLote(dir: string, meta: MetaImportacion, rango: Rango, pdf: PDFDocument | null): Promise<ParteArchivo[]> {
  if (meta.tipo === "pdf") {
    if (!pdf) throw new Error("Falta el PDF");
    const tramo = await PDFDocument.create();
    const paginas = await tramo.copyPages(pdf, Array.from({ length: rango.hasta - rango.desde + 1 }, (_, i) => rango.desde - 1 + i));
    paginas.forEach((p) => tramo.addPage(p));
    return [{ inlineData: { data: Buffer.from(await tramo.save()).toString("base64"), mimeType: "application/pdf" } }];
  }
  const partes: ParteArchivo[] = [];
  for (const nombre of meta.archivos.slice(rango.desde - 1, rango.hasta)) {
    const mime = nombre.endsWith(".png") ? "image/png" : nombre.endsWith(".webp") ? "image/webp" : "image/jpeg";
    partes.push({ inlineData: { data: (await fs.readFile(path.join(dir, nombre))).toString("base64"), mimeType: mime } });
  }
  return partes;
}

export function lotesDe(meta: MetaImportacion): Rango[] {
  return partirEnLotes(meta.hojas, meta.tipo === "pdf" ? TAM_LOTE_PDF : TAM_LOTE_FOTOS);
}

/** Lee lo que falta del libro, une y deja el trabajo 'listo' (o 'error') y avisa. */
export async function procesarImportacion(id: string): Promise<void> {
  if (!IDS.test(id) || enCurso.has(id)) return;
  enCurso.add(id);
  try {
    const dir = carpetaDeImportacion(id);
    const lectura = await interno<FilaImportacion>(`/${id}`);
    const fila = lectura.datos;
    if (!fila) return;

    // Ya terminó: puede faltar sólo el mail (se cayó el proceso justo antes).
    if (fila.estado === "listo" || fila.estado === "error") {
      await avisar(id, fila);
      return;
    }
    if (fila.estado !== "subido" && fila.estado !== "procesando") return;

    let meta: MetaImportacion;
    try {
      meta = JSON.parse(await fs.readFile(path.join(dir, "meta.json"), "utf8"));
    } catch {
      await avanzar(id, { estado: "error", error: "No encontramos el archivo del libro. Subilo de nuevo." });
      return;
    }

    if (!(await avanzar(id, { estado: "procesando" }))) return;
    const pdf = meta.tipo === "pdf" ? await PDFDocument.load(await fs.readFile(path.join(dir, "libro.pdf")), { ignoreEncryption: true }).catch(() => null) : null;
    if (meta.tipo === "pdf" && !pdf) {
      await avanzar(id, { estado: "error", error: "No pudimos abrir el PDF." });
      await avisarDeNuevo(id);
      return;
    }

    const lotes = lotesDe(meta);
    const hechos = new Set<number>();
    for (let i = 0; i < lotes.length; i++) if (await leerLoteGuardado(dir, i)) hechos.add(i);

    for (const i of lotesPendientes(lotes, hechos)) {
      const rango = lotes[i];
      let guardado: LoteGuardado = { vuelos: [], fallo: true };
      // Un reintento: Google a veces contesta saturado o corta la respuesta.
      for (let intento = 0; intento < 2; intento++) {
        try {
          const partes = await partesDelLote(dir, meta, rango, pdf);
          const vuelos = await leerHojasConGemini(partes, meta.tipo === "pdf" ? `un PDF con ${textoDeHojas(rango)} del libro` : `${partes.length === 1 ? "una foto de una hoja" : `${partes.length} fotos de hojas`} del libro de papel`, meta.tipo === "fotos");
          guardado = { vuelos: vuelos.filter((v) => !esFilaDeTotales(v)) };
          break;
        } catch (err) {
          console.error(`importar-libro ${id} lote ${i + 1} (intento ${intento + 1}):`, err instanceof Error ? err.message : err);
        }
      }
      await fs.writeFile(archivoDeLote(dir, i), JSON.stringify(guardado));
      hechos.add(i);

      const fallidos = await rangosFallidos(dir, lotes, hechos);
      if (!(await avanzar(id, { paginas_leidas: rango.hasta, lotes_fallidos: fallidos }))) return;
    }

    const porLote: VueloLeido[][] = [];
    for (let i = 0; i < lotes.length; i++) porLote.push((await leerLoteGuardado(dir, i))?.vuelos ?? []);
    // La capota leída como simulador y el día leído como noche (o al revés) se corrigen acá, con el
    // horario y la posición del sol: la revisión ya los muestra bien (`corregirLectura`).
    const vuelos = unirLotes(porLote).map((v) => corregirLectura(v, coordsDeAerodromo));
    const fallidos = await rangosFallidos(dir, lotes, new Set(lotes.map((_, i) => i)));
    const aviones = avionesNuevos(vuelos, fila.matriculas ?? []);

    const nada = vuelos.length === 0;
    const seguro = await avanzar(id, {
      estado: nada ? "error" : "listo",
      paginas_leidas: meta.hojas,
      lotes_fallidos: fallidos,
      resultado: { vuelos, aviones },
      ...(nada ? { error: fallidos.length ? "No pudimos leer ninguna hoja del libro." : "No encontramos vuelos en el libro." } : {}),
    });
    if (seguro) await avisarDeNuevo(id);
  } catch (err) {
    console.error(`importar-libro ${id}:`, err);
    await avanzar(id, { estado: "error", error: "Algo falló al leer el libro. Probá de nuevo." });
    await avisarDeNuevo(id);
  } finally {
    enCurso.delete(id);
  }
}

async function rangosFallidos(dir: string, lotes: Rango[], hechos: ReadonlySet<number>): Promise<Rango[]> {
  const rangos: Rango[] = [];
  for (const i of hechos) if ((await leerLoteGuardado(dir, i))?.fallo) rangos.push(lotes[i]);
  return unirRangos(rangos);
}

async function avisarDeNuevo(id: string): Promise<void> {
  const r = await interno<FilaImportacion>(`/${id}`);
  if (r.datos) await avisar(id, r.datos);
}

/**
 * El mail (y el push, que manda el backend al reservar), una vez por trabajo: se reserva con un
 * update condicional y, si el mail no sale, se suelta para que el barrido lo reintente.
 */
async function avisar(id: string, fila: FilaImportacion): Promise<void> {
  if (fila.aviso_enviado_at || (fila.estado !== "listo" && fila.estado !== "error")) return;
  const reserva = await interno<{ reservado: boolean }>(`/${id}/aviso`, { method: "POST" });
  if (!reserva.datos?.reservado) return;

  let enviado = false;
  if (fila.email && mailConfigurado()) {
    const vuelos = fila.resultado?.vuelos?.length ?? 0;
    const mensaje = armarMensajeImportacion({
      nombre: fila.first_name,
      estado: fila.estado as "listo" | "error",
      vuelos,
      avionesNuevos: fila.resultado?.aviones?.length ?? 0,
      paginasTotal: fila.paginas_total,
      fallidos: fila.lotes_fallidos ?? [],
      appUrl: SITIO_URL,
      revisar: `${SITIO_URL}/dashboard/log-flight/import?importacion=${id}`,
    });
    const r = await enviarConSeguimiento({ para: fila.email, userId: fila.user_id, tipo: "importacion-libro", clave: id, mensaje });
    enviado = r.enviado;
    if (!enviado) console.error(`importar-libro ${id}: el mail no salió: ${r.motivo ?? "sin motivo"}`);
  }
  // Sin mail configurado o sin dirección no se reintenta para siempre: el push ya salió y la
  // pantalla lo muestra. Sólo se suelta la reserva si el proveedor falló.
  if (!enviado && fila.email && mailConfigurado()) await interno(`/${id}/liberar-aviso`, { method: "POST" });
}

/** Borra la carpeta de una importación (idempotente). */
export async function borrarImportacion(id: string): Promise<void> {
  if (!IDS.test(id)) return;
  await fs.rm(carpetaDeImportacion(id), { recursive: true, force: true });
}

export interface ResultadoBarrido {
  retomadas: string[];
  borradas: number;
}

/** El barrido: retoma lo cortado y borra los archivos que ya no hacen falta. */
export async function barrerImportaciones(): Promise<ResultadoBarrido> {
  const retomar = await interno<{ id: string }[]>("/retomar");
  const ids = (retomar.datos ?? []).map((x) => x.id).filter((id) => !enCurso.has(id));
  for (const id of ids) void procesarImportacion(id);
  const borrar = await interno<string[]>("/para-borrar");
  let borradas = 0;
  for (const id of borrar.datos ?? []) {
    try {
      await fs.access(carpetaDeImportacion(id));
      await borrarImportacion(id);
      borradas++;
    } catch {
      // ya no estaba
    }
  }
  return { retomadas: ids, borradas };
}

/** [lat, lon] de un aeródromo por su indicador OACI o su designador ANAC. */
function coordsDeAerodromo(cod: string): [number, number] | null {
  const a = cod ? getAirport(cod) : null;
  return a && typeof a.lat === "number" && typeof a.lon === "number" && Number.isFinite(a.lat) && Number.isFinite(a.lon) ? [a.lat, a.lon] : null;
}

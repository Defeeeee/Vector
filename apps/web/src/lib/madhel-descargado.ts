import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * **La ficha de MADHEL de cada aeródromo, descargada**: la fuente principal de la ficha de
 * Aeropuertos mientras esté al día (Federico, 2026-11-03). Sólo servidor.
 *
 * La baja una vez por mes `.github/workflows/madhel.yml` (de a uno, cada 2 s) y la deja en el
 * VPS, `~/Vector/datos/madhel-fichas.json`: `{ descargado, fichas: { GEZ: {...} } }`, la
 * respuesta de MADHEL tal cual. **No está en el repo**, que es público: trae teléfonos de
 * aeródromos privados.
 *
 * Antes la ficha la traía el navegador del piloto, y si su red no llegaba a ANAC (bloqueada,
 * o ANAC sin contestar) la ficha salía vacía: le pasó a Federico con Pehuajó. Con la copia,
 * el navegador no le pregunta nada a ANAC por la ficha.
 *
 * **Al día** es que se bajó hace menos de `VIGENCIA_DIAS`: un mes y unos días de margen
 * para que una corrida fallida no la deje afuera. MADHEL cambia poco.
 */
export const VIGENCIA_DIAS = 40;

export const carpetaDeDatos = () => process.env.VECTOR_DATOS_DIR || path.join(os.homedir(), "Vector", "datos");

let memo: { mtimeMs: number; descargado: string; fichas: Record<string, unknown> } | null = null;

function leer(): { descargado: string; fichas: Record<string, unknown> } | null {
  try {
    const archivo = path.join(carpetaDeDatos(), "madhel-fichas.json");
    const { mtimeMs } = fs.statSync(archivo);
    if (!memo || memo.mtimeMs !== mtimeMs) {
      const datos = JSON.parse(fs.readFileSync(archivo, "utf8"));
      if (!datos || typeof datos.fichas !== "object") return null;
      memo = { mtimeMs, descargado: String(datos.descargado ?? ""), fichas: datos.fichas };
    }
    return memo;
  } catch {
    return null;
  }
}

/** ¿La copia se bajó hace menos de `VIGENCIA_DIAS`? */
export function copiaAlDia(descargado: string | null, ahora: Date): boolean {
  const t = descargado ? Date.parse(descargado) : NaN;
  return !Number.isNaN(t) && ahora.getTime() - t <= VIGENCIA_DIAS * 86400000;
}

/** ¿Hay copia al día? Lo pregunta el navegador para no pedirle la ficha a ANAC. */
export function madhelAlDia(ahora = new Date()): { descargado: string } | null {
  const datos = leer();
  return datos && copiaAlDia(datos.descargado, ahora) ? { descargado: datos.descargado } : null;
}

/**
 * La ficha de un aeródromo (designador ANAC: "PEH", "GEZ"), tal cual la dio MADHEL, si la
 * copia está al día y lo tiene. Si no, `null`. Nunca tira.
 */
export function fichaMadhel(designador: string, ahora = new Date()): unknown | null {
  const datos = leer();
  if (!datos || !copiaAlDia(datos.descargado, ahora)) return null;
  return datos.fichas[designador.trim().toUpperCase()] ?? null;
}

/**
 * Qué versión de la extensión "Vector → CAD" tiene el piloto, contra la que se baja hoy
 * (`extension/manifest.json`). La instalada se lee de `data-vector-cad-extension` en `<html>`,
 * que deja `extension/vector.js`.
 *
 * Una extensión cargada descomprimida no se actualiza sola: Vector avisa cuando hay una nueva
 * (Federico, 2026-10-29). Las anteriores a la 1.1.0 eran un botón en el CAD, no un puente: con
 * ésas "Pasar al CAD" no puede conectarse y sólo ofrece bajar la nueva.
 */
import manifest from "../../extension/manifest.json";

export const VERSION_EXTENSION: string = manifest.version;
export const VERSION_MINIMA_PUENTE = "1.1.0";

/** -1, 0 o 1, número por número ("1.10.0" > "1.9.2"). Lo que no es número cuenta como 0. */
export function compararVersion(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let k = 0; k < Math.max(pa.length, pb.length); k++) {
    const d = (pa[k] ?? 0) - (pb[k] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type EstadoExtension = "falta" | "sin-puente" | "vieja" | "al-dia";

export function estadoExtension(instalada: string | null | undefined, actual = VERSION_EXTENSION): EstadoExtension {
  if (!instalada) return "falta";
  if (compararVersion(instalada, VERSION_MINIMA_PUENTE) < 0) return "sin-puente";
  return compararVersion(instalada, actual) < 0 ? "vieja" : "al-dia";
}

/**
 * Qué se le ofrece a cada navegador en "Pasar al CAD" (Federico, 2026-10-30):
 *
 * - `extension`: Chrome, Edge, Brave, Opera (la extensión es de Chrome, MV3).
 * - `marcador`: Safari y Firefox, que no la cargan; el marcador anda en cualquiera.
 * - `compu`: un teléfono o una tablet, donde no hay extensiones ni barra de favoritos.
 *
 * El iPad se presenta como una Mac: lo delata la pantalla táctil (`toques`, de
 * `navigator.maxTouchPoints`), que el server no sabe. Sin user agent, lo de siempre.
 */
export type NavegadorCad = "extension" | "marcador" | "compu";

export function navegadorParaCad(ua: string, toques = 0): NavegadorCad {
  if (!ua) return "extension";
  if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua)) return "compu";
  if (/Macintosh/.test(ua) && toques > 1) return "compu";
  if (/Firefox\//.test(ua)) return "marcador";
  return /Chrome\/|Chromium\/|Edg\//.test(ua) ? "extension" : "marcador";
}

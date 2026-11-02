/**
 * Ayudas puras de la red social, fuera de los componentes para poder testearlas.
 */

/**
 * El mensaje para el piloto, a partir del cuerpo de un error del backend.
 *
 * El manejador global del backend (`src/app.py`) devuelve `{detail, extra}`. En los
 * errores propios —"Ese @ ya lo tiene otro piloto."— el texto está en `detail`. En los
 * 400 de validación, `detail` es genérico ("Validation failed for PUT ...") y el motivo
 * está en `extra[0].message`, con el prefijo que le agrega Pydantic.
 */
export function mensajeDeErrorApi(cuerpo: unknown, porDefecto: string): string {
  if (!cuerpo || typeof cuerpo !== "object") return porDefecto;
  const { detail, extra } = cuerpo as { detail?: unknown; extra?: unknown };

  if (Array.isArray(extra) && extra.length > 0) {
    const primero = extra[0] as { message?: unknown };
    if (typeof primero?.message === "string" && primero.message.trim()) {
      return primero.message.replace(/^Value error,\s*/i, "").trim();
    }
  }
  if (typeof detail === "string" && detail.trim() && !/^Validation failed/i.test(detail)) {
    return detail.trim();
  }
  return porDefecto;
}

/** "Federico Díaz Nemeth" → "FN". Para el avatar de quien todavía no subió foto. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primera = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primera + ultima).toUpperCase();
}

// ---------------------------------------------------------------------------
// Fechas de la red
// ---------------------------------------------------------------------------
//
// **Se calculan en el server y bajan como texto** (invariante 1 del AGENTS.md): una
// publicación que dice "hace 5 min" en el server y "hace 6 min" en el navegador es un
// error de hidratación, y `toLocaleString` ni siquiera da lo mismo en Node que en
// Chrome. Por eso esto no usa `Intl`: meses escritos a mano y la hora argentina como
// cuenta, y `ahora` entra por parámetro para poder testearlo.

/** Argentina no tiene horario de verano desde 2009: UTC−3 todo el año. */
const DESFASE_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function enArgentina(ms: number) {
  const d = new Date(ms + DESFASE_ARGENTINA_MS);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(), hora: d.getUTCHours(), minuto: d.getUTCMinutes() };
}

/** Cuántos días de calendario argentino van de `a` a `b`. */
function diasDeCalendario(a: number, b: number): number {
  const dia = (ms: number) => Math.floor((ms + DESFASE_ARGENTINA_MS) / DIA_MS);
  return dia(b) - dia(a);
}

/**
 * "recién", "hace 5 min", "hace 3 h", "ayer", "hace 4 días", "12 sep", "12 sep 2025".
 *
 * Las horas se cuentan hasta las 24; de ahí en más cuenta el calendario de acá, no el
 * de UTC: algo de las 22 h de ayer, a la 1 de la mañana, es "hace 3 h" y no "ayer".
 */
export function fechaRelativa(iso: string, ahora: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const ms = ahora.getTime() - t;
  if (ms < 60_000) return "recién";
  if (ms < 60 * 60_000) return `hace ${Math.floor(ms / 60_000)} min`;
  if (ms < DIA_MS) return `hace ${Math.floor(ms / (60 * 60_000))} h`;
  const dias = diasDeCalendario(t, ahora.getTime());
  if (dias <= 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  const p = enArgentina(t);
  return `${p.dia} ${MESES[p.mes]}${p.anio !== enArgentina(ahora.getTime()).anio ? ` ${p.anio}` : ""}`;
}

/** "22 sep 2026, 14:05", en hora argentina. Para el `title` de una fecha relativa. */
export function fechaCompleta(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const p = enArgentina(t);
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return `${p.dia} ${MESES[p.mes]} ${p.anio}, ${dosCifras(p.hora)}:${dosCifras(p.minuto)}`;
}

/**
 * "2026-09-12" → "12 sep 2026". La fecha de un vuelo es un día, no un instante: se lee
 * como viene, sin pasarla por ninguna zona horaria.
 */
export function fechaDeVuelo(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? "");
  if (!m) return fecha || null;
  const mes = Number(m[2]) - 1;
  if (mes < 0 || mes > 11) return fecha || null;
  return `${Number(m[3])} ${MESES[mes]} ${m[1]}`;
}

// ---------------------------------------------------------------------------
// El vuelo de una publicación
// ---------------------------------------------------------------------------

/** Lo que el backend saca de una ruta porque no es un aeródromo. */
const NO_AERODROMOS = new Set(["LOCAL", "SIM", "???"]);

/**
 * `"SADF SAAR"` → `"SADF → SAAR"`; un vuelo local → `"SADF · local"`.
 *
 * **Copia exacta de `ruta_legible` del backend** (`src/services/social.py`), que es el
 * que arma lo que se publica. Esto es sólo la vista previa del composer: si difieren,
 * el piloto aprueba una cosa y se publica otra. Sólo el primero y el último, porque los
 * puntos intermedios de una travesía dicen por dónde pasó y eso no lo eligió publicar.
 */
export function rutaLegible(route: string | null | undefined): string | null {
  const puntos = (route ?? "")
    .split(/[\s,\-–>→]+/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p && !NO_AERODROMOS.has(p));
  if (puntos.length === 0) return null;
  const origen = puntos[0];
  const destino = puntos[puntos.length - 1];
  return origen === destino ? `${origen} · local` : `${origen} → ${destino}`;
}

/**
 * Los aeródromos del chip de una publicación, para dibujarlo: `"SADF → SAAR"` →
 * `["SADF", "SAAR"]`, `"SADF · local"` → `["SADF"]`. Lee el formato de `rutaLegible` y
 * nada más: lo que no parezca un código se descarta.
 */
export function aerodromosDelChip(ruta: string | null | undefined): string[] {
  const codigos = (ruta ?? "")
    .replace(/·\s*local\s*$/i, "")
    .split(/[\s→]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z0-9]{3,4}$/.test(c));
  return [...new Set(codigos)];
}

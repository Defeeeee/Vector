import { leerFormulario, nodosDeRuta, type AerodromoForm, type FormularioPlan } from "./formulario-plan";
import { eobtVigente, type Demora } from "./demora-plan";
import { numeroDeCodigoLad } from "./lad";

/**
 * **Del plan de vuelo al Mapa** (`/dashboard/mapa?plan=<id>`): la ruta del plan, escrita como la
 * entiende el Mapa (`tokensDeRuta` de `mapa-ruta.ts`), y la lista "Tus planes" de la tarjeta.
 *
 * Puro: la hora actual entra como parámetro (invariante 1, nada de `toLocaleString`).
 *
 * - La casilla 15 trae cosas que no son un punto: `DCT`, `VFR`/`IFR`, los grupos de velocidad y
 *   nivel (`N0100A015`, `N0100VFR`, `K0185M0150`) y, a veces, pegados a un punto (`VM/N0100A015`).
 *   Se sacan; no se cuentan como salteados porque no son lugares.
 * - Lo que sí es un lugar pero el Mapa no puede ubicar se **saltea y se cuenta** (`SECTOR ESCUELA`,
 *   un LAD sin coordenadas) para avisárselo al piloto. Lo que parece un punto y el directorio no
 *   conoce lo deja pasar: el Mapa lo marca "No encontré X", como con cualquier código desconocido.
 * - Un LAD (o ZZZZ) con coordenadas va como punto propio: el Mapa no conoce `LAD2013`.
 */

const RE_GRUPO = /^[KNM]\d{3,4}(?:[AFSM]\d{3,4}|VFR)?$/;
const RE_REGLAS = /^(?:VFR|IFR|Y|Z)$/;

/** Una coordenada como la escribe el Mapa para un punto propio (~10 m). */
export function coordenadaParaElMapa(lat: number, lon: number): string {
  return `${lat < 0 ? "S" : "N"}${Math.abs(lat).toFixed(4)}/${lon < 0 ? "W" : "E"}${Math.abs(lon).toFixed(4)}`;
}

/** La casilla 15 sin los grupos de velocidad y nivel ni los cambios de reglas. */
function sinGrupos(ruta: string): string {
  return (ruta ?? "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const barra = t.indexOf("/");
      // `VM/N0100A015`: el punto con su cambio de velocidad y nivel.
      if (barra > 0 && RE_GRUPO.test(t.slice(barra + 1))) return t.slice(0, barra);
      return t;
    })
    .filter((t) => !RE_GRUPO.test(t) && !RE_REGLAS.test(t))
    .join(" ");
}

/** La salida o el destino como token del Mapa; `null` + el motivo si no se puede ubicar. */
function tokenDeAerodromo(ad: AerodromoForm | null): { token: string | null; salteado?: string } {
  const codigo = (ad?.codigo ?? "").trim().toUpperCase();
  if (!ad || !codigo) return { token: null };
  const esLad = numeroDeCodigoLad(codigo) !== null || codigo === "ZZZZ";
  if (!esLad) return { token: codigo };
  if (typeof ad.lat === "number" && typeof ad.lon === "number" && Number.isFinite(ad.lat) && Number.isFinite(ad.lon)) {
    return { token: coordenadaParaElMapa(ad.lat, ad.lon) };
  }
  return { token: null, salteado: `${codigo} (sin coordenadas)` };
}

export interface PlanEnElMapa {
  /** La ruta como se escribe en el Mapa: "SADM VM SRDL". Vacía si no hay salida y destino. */
  ruta: string;
  /** Lo que el Mapa no puede dibujar, para avisarlo: "SECTOR ESCUELA", "LAD2013 (sin coordenadas)". */
  salteados: string[];
  /** El avión del plan, o `null`. */
  aircraftId: string | null;
}

/** El plan (su formulario crudo) como ruta del Mapa. Sin salida y destino la ruta queda vacía. */
export function planAlMapa(formulario: unknown, aircraftId?: string | null): PlanEnElMapa {
  const f: FormularioPlan = leerFormulario(formulario);
  const id = aircraftId ?? f.aircraftId ?? null;
  const salida = tokenDeAerodromo(f.salida);
  const destino = tokenDeAerodromo(f.destino);
  const salteados: string[] = [];
  if (salida.salteado) salteados.push(salida.salteado);
  const medio: string[] = [];
  for (const n of nodosDeRuta(sinGrupos(f.ruta))) {
    if (n.tipo === "desconocido") salteados.push(n.texto);
    else if (n.token) medio.push(n.token);
  }
  if (destino.salteado) salteados.push(destino.salteado);
  // El Mapa necesita dos puntos como mínimo y el plan, salida y destino.
  if (!salida.token || !destino.token) return { ruta: "", salteados, aircraftId: id };
  return { ruta: [salida.token, ...medio, destino.token].join(" "), salteados, aircraftId: id };
}

/** "2 puntos del plan no van al Mapa: SECTOR ESCUELA, LAD2013 (sin coordenadas)." */
export function avisoDeSalteados(salteados: string[]): string | null {
  if (!salteados.length) return null;
  const n = salteados.length;
  return `${n === 1 ? "1 punto del plan no va" : `${n} puntos del plan no van`} al Mapa: ${salteados.join(", ")}.`;
}

/* -------------------------------------------------------------------------- */
/* "Tus planes" en la tarjeta de la ruta                                       */
/* -------------------------------------------------------------------------- */

/** Desde cuánto antes de la salida y hasta cuánto después se ofrece un plan en el Mapa. */
export const ATRAS_MS = 3 * 3_600_000;
export const ADELANTE_MS = 7 * 86_400_000;

/** Lo que la lista del backend dice de un plan, sin el formulario. */
export interface ResumenDePlan {
  id: string;
  salida: string | null;
  destino: string | null;
  matricula: string | null;
  dof: string | null;
  eobt: string | null;
  vuelo_id?: string | null;
  cancelado_at?: string | null;
  descartado_at?: string | null;
}

/** Un plan que sigue en pie: ni cancelado, ni descartado, ni ya volado, con salida y destino. */
export const planVigente = (p: ResumenDePlan): boolean => !p.cancelado_at && !p.descartado_at && !p.vuelo_id && Boolean(p.salida && p.destino);

function salidaMs(dof: string | null | undefined, eobt: string | null | undefined): number | null {
  if (!dof || !eobt || !/^\d{4}-\d{2}-\d{2}$/.test(dof) || !/^\d{4}$/.test(eobt)) return null;
  const ms = Date.parse(`${dof}T${eobt.slice(0, 2)}:${eobt.slice(2)}:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * El filtro barato, sobre la lista: la fecha del plan (sin demoras, que la lista no trae) a un día
 * de la ventana, para leer sólo esos planes enteros y ver su salida vigente.
 */
export function candidatoParaElMapa(p: ResumenDePlan, ahoraIso: string): boolean {
  if (!planVigente(p)) return false;
  const ms = salidaMs(p.dof, "0000");
  if (ms === null) return false;
  const ahora = Date.parse(ahoraIso);
  return ms >= ahora - ATRAS_MS - 2 * 86_400_000 && ms <= ahora + ADELANTE_MS + 86_400_000;
}

export interface PlanParaElMapa {
  id: string;
  /** "SADM → SRDL · LV-S048 · 12/11 19:30Z" */
  titulo: string;
  salidaMs: number;
  ruta: string;
  salteados: string[];
  aircraftId: string | null;
}

/**
 * La fila de "Tus planes", o `null` si el plan no entra en la ventana (con la salida vigente: las
 * demoras cuentan) o no tiene ruta que dibujar. La fecha es la de la EOBT en UTC, escrita a mano.
 */
export function planParaElMapa(
  p: ResumenDePlan & { aircraft_id?: string | null },
  formulario: unknown,
  demoras: Demora[],
  ahoraIso: string
): PlanParaElMapa | null {
  if (!planVigente(p)) return null;
  const f = leerFormulario(formulario);
  const vigente = eobtVigente(f, demoras ?? []) ?? (p.dof && p.eobt ? { dof: p.dof, eobt: p.eobt } : null);
  const ms = vigente ? salidaMs(vigente.dof, vigente.eobt) : null;
  if (!vigente || ms === null) return null;
  const ahora = Date.parse(ahoraIso);
  if (ms < ahora - ATRAS_MS || ms > ahora + ADELANTE_MS) return null;
  const { ruta, salteados, aircraftId } = planAlMapa(formulario, p.aircraft_id ?? null);
  if (!ruta) return null;
  const [, mes, dia] = vigente.dof.split("-");
  const matricula = (p.matricula ?? f.matricula ?? "").trim();
  const titulo = [`${p.salida} → ${p.destino}`, matricula, `${dia}/${mes} ${vigente.eobt.slice(0, 2)}:${vigente.eobt.slice(2)}Z`].filter(Boolean).join(" · ");
  return { id: p.id, titulo, salidaMs: ms, ruta, salteados, aircraftId };
}

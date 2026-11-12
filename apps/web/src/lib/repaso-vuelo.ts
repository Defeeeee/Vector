import { horariosDelPlan } from "./plan-cierre";
import { horaArgentina, horaUtc } from "./seguimiento-calculos";
import type { Demora } from "./demora-plan";
import type { FormularioPlan } from "./formulario-plan";
import type { PuntoCompartido } from "./compartir-plan";

/**
 * **El repaso del vuelo** ("Cómo fue el vuelo", en el editor de un plan): lo que el ADS-B vio del
 * avión del plan, contra lo planeado. Los números los arma el backend (`GET /planes-de-vuelo/{id}/repaso`,
 * `services/repaso_vuelo.py`); acá sólo se decide cuándo se ofrece y cómo se escribe.
 *
 * Puro, y las horas se arman a mano con la aritmética UTC de `seguimiento-calculos` (invariante 1:
 * nada de `toLocaleString`). **Son horas de cuándo el ADS-B vio al avión en el aire**, no los
 * horarios de la bitácora: se dice, y "Registrar este vuelo" nunca las precarga (Federico,
 * 2026-10-20). Que el ADS-B no haya visto el vuelo no es que no haya volado (invariante 2).
 */

export interface RepasoVuelo {
  estado: "completo" | "parcial" | "sin_datos";
  motivo: string | null;
  aviso?: string;
  despegue_adsb?: string;
  aterrizaje_adsb?: string | null;
  ultima_vista?: string;
  minutos_en_aire?: number;
  eet_min?: number | null;
  diferencia_min?: number | null;
  altitud_max_ft?: number | null;
  gs_max_kt?: number | null;
  gs_media_kt?: number | null;
  millas_voladas?: number;
  millas_planeadas?: number | null;
  desvio?: { max_nm: number; tramo: { indice: number; desde: string | null; hasta: string | null } } | null;
  aterrizajes_estimados?: number;
  minutos_sin_senal?: number;
  cerca_del_destino?: boolean | null;
  /** `[lat, lon, altitud]`, sin horas. */
  recorrido?: [number, number, number | null][];
}

/** El backend guarda las posiciones 30 días: pasado eso no hay nada que mirar. */
export const DIAS_DE_ADSB = 30;

/**
 * Si el editor ofrece "Cómo fue el vuelo": no está cancelado y ya pasó la llegada estimada (la
 * salida vigente más la casilla 16), o el link de "Compartir este vuelo" ya vio aterrizar.
 */
export function puedeRepasar(
  f: FormularioPlan,
  demoras: Demora[],
  cancelado: boolean,
  aterrizoAt: string | null,
  ahoraIso: string
): boolean {
  if (cancelado) return false;
  if (aterrizoAt && Number.isFinite(Date.parse(aterrizoAt))) return true;
  const h = horariosDelPlan(f, demoras);
  return h !== null && Date.parse(ahoraIso) >= h.llegadaMs;
}

/** Si el vuelo es de hace más de `DIAS_DE_ADSB` días: ya no hay posiciones guardadas. */
export function repasoVencido(f: FormularioPlan, demoras: Demora[], ahoraIso: string): boolean {
  const h = horariosDelPlan(f, demoras);
  return h !== null && Date.parse(ahoraIso) - h.salidaMs > DIAS_DE_ADSB * 86_400_000;
}

/** La ruta ubicada como la pide el backend: `lat,lon,CODIGO;lat,lon,CODIGO`. */
export function puntosParaElPedido(puntos: PuntoCompartido[]): string {
  return puntos
    .slice(0, 60)
    .map((p) => `${p.lat},${p.lon}${p.codigo ? `,${p.codigo.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 16)}` : ""}`)
    .join(";");
}

/** 2000 → "2.000", como se escribe acá. */
export function miles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 49.46 → "49,5". */
export function decimal(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** 75 → "1 h 15 min"; 42 → "42 min". */
export function minutosEscritos(min: number): string {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "justo lo que decía el plan", "7 min más que el plan", "5 min menos que el plan". */
export function diferenciaConElPlan(min: number | null | undefined): string | null {
  if (min === null || min === undefined) return null;
  if (Math.abs(min) < 2) return "lo que decía el plan";
  return `${minutosEscritos(Math.abs(min))} ${min > 0 ? "más" : "menos"} que el plan`;
}

/** "09:05 (12:05Z)": hora argentina y UTC de un instante, o `null` si no se lee. */
export function horaDoble(iso: string | null | undefined): string | null {
  const a = horaArgentina(iso ?? null);
  const z = horaUtc(iso ?? null);
  return a && z ? `${a} (${z})` : null;
}

export interface Cifra {
  rotulo: string;
  valor: string;
  /** Una línea chica abajo. */
  detalle?: string;
}

/**
 * Las cifras que se muestran, en orden. Lo que el ADS-B no trajo no se escribe en cero: se saltea
 * (invariante 2).
 */
export function cifrasDelRepaso(r: RepasoVuelo): Cifra[] {
  if (r.estado === "sin_datos") return [];
  const c: Cifra[] = [];
  const despegue = horaDoble(r.despegue_adsb);
  const aterrizaje = horaDoble(r.aterrizaje_adsb ?? null);
  if (despegue) c.push({ rotulo: "Lo vio despegar", valor: despegue, detalle: "hora argentina (UTC)" });
  if (aterrizaje) c.push({ rotulo: "Lo vio aterrizar", valor: aterrizaje, detalle: "hora argentina (UTC)" });
  else if (r.ultima_vista && horaDoble(r.ultima_vista)) c.push({ rotulo: "Lo vio por última vez", valor: horaDoble(r.ultima_vista)!, detalle: "no vio el aterrizaje" });
  if (typeof r.minutos_en_aire === "number") {
    const dif = diferenciaConElPlan(r.diferencia_min);
    c.push({
      rotulo: "En el aire",
      valor: minutosEscritos(r.minutos_en_aire),
      detalle: typeof r.eet_min === "number" ? `plan: ${minutosEscritos(r.eet_min)}${dif ? ` · ${dif}` : ""}` : "el plan no tenía duración (casilla 16)",
    });
  }
  if (typeof r.millas_voladas === "number") {
    c.push({
      rotulo: "Distancia",
      valor: `${decimal(r.millas_voladas)} NM`,
      detalle: typeof r.millas_planeadas === "number" ? `plan: ${decimal(r.millas_planeadas)} NM en línea recta entre los puntos` : undefined,
    });
  }
  if (typeof r.altitud_max_ft === "number") c.push({ rotulo: "Altitud máxima", valor: `${miles(r.altitud_max_ft)} ft`, detalle: "barométrica (1013 hPa), no sobre el terreno" });
  if (typeof r.gs_max_kt === "number") {
    c.push({
      rotulo: "Velocidad sobre el suelo",
      valor: `${r.gs_max_kt} kt máx.`,
      detalle: typeof r.gs_media_kt === "number" ? `media en el aire: ${r.gs_media_kt} kt` : undefined,
    });
  }
  if (r.desvio) {
    const { desde, hasta } = r.desvio.tramo;
    c.push({
      rotulo: "Desvío máximo de la ruta",
      valor: `${decimal(r.desvio.max_nm)} NM`,
      detalle: desde && hasta ? `en el tramo ${desde} → ${hasta}; sin contar 2 NM alrededor de los aeródromos` : "sin contar 2 NM alrededor de los aeródromos",
    });
  }
  if (typeof r.aterrizajes_estimados === "number") {
    c.push({ rotulo: "Aterrizajes", valor: String(r.aterrizajes_estimados), detalle: "estimado: bajó de 250 ft" });
  }
  if (r.minutos_sin_senal && r.minutos_sin_senal >= 3) c.push({ rotulo: "Sin señal", valor: minutosEscritos(r.minutos_sin_senal), detalle: "tramos en que el ADS-B no lo vio" });
  return c;
}

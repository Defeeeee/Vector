/**
 * Vientos en altura para el plan de vuelo: para cada altitud de crucero, qué viento hay
 * en la ruta, cuánto es de frente o de cola, cuánto tarda (con el ascenso) y cuánto gasta.
 *
 * Puro: recibe los tramos, la TAS y el viento de la mitad de cada tramo a cada altitud
 * (lo que devuelve `/api/viento` con `altitudesFt`) y no sabe nada de la red.
 *
 * ## Decisiones
 *
 * - **Signo:** `colaKt` positivo es viento de cola, negativo de frente (el avión sube la
 *   GS con la cola). `windComponents` de `aviation.ts` usa la convención contraria
 *   (headwind positivo): acá se invierte una sola vez.
 * - **Promedios ponderados por distancia** (frente/cola) sobre toda la ruta con el viento
 *   de la altitud de la fila. La **cruzada** es el máximo en módulo de los tramos y de qué
 *   lado viene.
 * - **Falta un dato = fila sin dato** (invariante 2): no se completa con los otros tramos.
 *   Tampoco hay fila si el viento anula el avance en algún tramo.
 * - **La hora de paso por cada tramo** (de la que sale el viento del pronóstico) la calcula
 *   quien llama con la TAS, igual que la planilla (`horasDeMitadDeTramo`), una sola vez para
 *   todas las altitudes: así el pedido a Open-Meteo es uno. Una diferencia de GS de 20 kt
 *   mueve la hora de un tramo unos minutos y el pronóstico es horario.
 * - **Tiempo = suma por tramo** (ascenso incluido) con su GS del triángulo de vientos, no
 *   distancia sobre GS promedio.
 *
 * ## El ascenso (pedido de Federico: en livianos se sube a 65–70 KIAS, no a la TAS de crucero)
 *
 * - Se sube desde la elevación de la salida (0 ft si no se sabe) hasta la altitud de la
 *   fila, a `iasAscensoKt` y `regimenFpm` constantes: tiempo = Δaltitud / régimen.
 * - **TAS de ascenso** = IAS × (1 + 0,02 por cada 1.000 ft de altitud media del ascenso),
 *   la aproximación de siempre (+2 % cada 1.000 ft).
 * - **Viento del ascenso:** el de la altitud listada más cercana a la media del ascenso, en
 *   cada tramo que el ascenso recorre (no hay otra altitud pedida; es una simplificación).
 * - El ascenso arranca en el primer punto y sigue por los tramos siguientes hasta cumplir
 *   su tiempo; el resto de la ruta se vuela a la TAS de crucero con el viento de la fila.
 * - **Si la ruta se termina antes de nivelar, la fila dice "no llega a nivelar"**: no se
 *   inventa un tiempo.
 * - **El descenso no pone penalidad** (se baja a crucero, sin tiempo extra); el combustible
 *   es el consumo único por todo el tiempo, también en ascenso (en la realidad es más: la
 *   nota de la pantalla lo dice).
 */

import { windComponents, windTriangle } from "./aviation";
import { rumboVerdadero } from "./navegacion";
import { vientoPromedioPonderado } from "./viento-ruta";
import { marcaVfr, type MarcaVfr } from "./niveles-vfr";
import type { Viento } from "./navegacion";

/** Un tramo de la ruta, de un nodo ubicado al siguiente. */
export interface TramoRuta {
  distanciaNm: number;
  /** Curso verdadero, grados. */
  cursoT: number;
}

/** Los tramos de una lista de puntos consecutivos (cada tramo sin distancia se descarta). */
export function tramosDePuntos(
  puntos: { lat: number; lon: number }[],
  distancia: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number
): TramoRuta[] {
  const t: TramoRuta[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const d = distancia(puntos[i - 1], puntos[i]);
    if (d > 0.05) t.push({ distanciaNm: d, cursoT: rumboVerdadero(puntos[i - 1], puntos[i]) });
  }
  return t;
}

export const IAS_ASCENSO_KT = 70;
export const REGIMEN_ASCENSO_FPM = 500;

export interface ParametrosAscenso {
  iasKt: number;
  regimenFpm: number;
  /** Elevación de la salida, ft; 0 si no se sabe. */
  elevacionFt: number;
}

export type MotivoSinDato = "viento" | "imposible" | "no-nivela";

export interface FilaAltitud {
  altitudFt: number;
  /** `null` si no se sabe (ver `motivo`). */
  datos: {
    /** Promedio vectorial ponderado por distancia (desde dónde sopla, verdadero). */
    viento: Viento;
    /** Positivo = de cola, negativo = de frente. Ponderado por distancia. */
    colaKt: number;
    /** Máximo en módulo de los tramos. */
    cruzadaKt: number;
    /** De qué lado viene la cruzada máxima. */
    ladoCruzada: "derecha" | "izquierda" | null;
    /** Distancia total / tiempo total. */
    gsKt: number;
    /** Incluye el ascenso. */
    minutos: number;
    /** Minutos de ascenso (parte de `minutos`). */
    minutosAscenso: number;
    litros: number | null;
  } | null;
  motivo: MotivoSinDato | null;
  esMejor: boolean;
  /**
   * Si es un nivel de crucero VFR para la derrota (`lib/niveles-vfr.ts`). Información: no
   * entra en `esMejor`, que sólo mira el tiempo.
   */
  vfr?: MarcaVfr;
}

export interface EntradaVientos {
  tramos: TramoRuta[];
  tasKt: number;
  altitudesFt: number[];
  /** `vientos[a][t]`: el viento de la mitad del tramo `t` a la altitud `a` (`null` = no se sabe). */
  vientos: (Viento | null)[][];
  ascenso?: ParametrosAscenso;
  consumoLh?: number | null;
  /** Variación magnética de la ruta (W positiva), para los niveles VFR; sin ella no hay marca. */
  variacionW?: number | null;
  /** La elevación más alta entre la salida y el destino, ft, para los 3.000 ft sobre el terreno. */
  elevacionMaxFt?: number | null;
}

/** Las altitudes de crucero VFR de la tabla: 1.500 a 9.500 ft cada 1.000. */
export function altitudesPorDefecto(elevacionMaxFt?: number | null): number[] {
  const base: number[] = [];
  for (let a = 1500; a <= 9500; a += 1000) base.push(a);
  if (elevacionMaxFt != null && Number.isFinite(elevacionMaxFt)) {
    const extra = Math.ceil((elevacionMaxFt + 500) / 100) * 100;
    if (extra < base[0]) base.unshift(extra);
  }
  return base;
}

/** TAS en el ascenso: IAS +2 % cada 1.000 ft de altitud media. */
export function tasDeAscenso(iasKt: number, altitudMediaFt: number): number {
  return iasKt * (1 + 0.02 * (Math.max(0, altitudMediaFt) / 1000));
}

function gsEn(cursoT: number, tas: number, v: Viento): number | null {
  const t = windTriangle({ course: cursoT, tas, windDir: v.direccion, windSpeed: v.velocidad });
  return t.impossible || !(t.groundSpeed > 0) ? null : t.groundSpeed;
}

function filaVacia(altitudFt: number, motivo: MotivoSinDato): FilaAltitud {
  return { altitudFt, datos: null, motivo, esMejor: false };
}

export function vientosPorAltitud(e: EntradaVientos): FilaAltitud[] {
  const { tramos, tasKt, altitudesFt, vientos, ascenso, consumoLh, variacionW, elevacionMaxFt } = e;
  const total = tramos.reduce((s, t) => s + t.distanciaNm, 0);

  const filas = altitudesFt.map((altitudFt, a): FilaAltitud => {
    const delCrucero = vientos[a] ?? [];
    if (!(total > 0) || !(tasKt > 0) || tramos.some((_, i) => !delCrucero[i])) return filaVacia(altitudFt, "viento");
    const vCrucero = delCrucero as Viento[];

    // Frente/cola y cruzada: con el viento de la fila, sobre toda la ruta.
    let cola = 0;
    let cruzMax = 0;
    let cruzLado: "derecha" | "izquierda" | null = null;
    tramos.forEach((t, i) => {
      const c = windComponents(t.cursoT, vCrucero[i].direccion, vCrucero[i].velocidad);
      cola += (-c.headwind * t.distanciaNm) / total;
      if (Math.abs(c.crosswind) > cruzMax) {
        cruzMax = Math.abs(c.crosswind);
        cruzLado = c.crosswind > 0 ? "derecha" : "izquierda";
      }
    });
    const viento = vientoPromedioPonderado(tramos.map((t, i) => ({ distanciaNm: t.distanciaNm, viento: vCrucero[i], horaModeloMs: null })));

    // Ascenso.
    let ascensoH = 0;
    let tasAsc = 0;
    let vAsc: (Viento | null)[] = [];
    if (ascenso && ascenso.regimenFpm > 0 && ascenso.iasKt > 0) {
      const delta = altitudFt - ascenso.elevacionFt;
      if (delta > 0) {
        ascensoH = delta / ascenso.regimenFpm / 60;
        const media = (altitudFt + ascenso.elevacionFt) / 2;
        tasAsc = tasDeAscenso(ascenso.iasKt, media);
        let cerca = 0;
        altitudesFt.forEach((x, k) => {
          if (Math.abs(x - media) < Math.abs(altitudesFt[cerca] - media)) cerca = k;
        });
        vAsc = vientos[cerca] ?? [];
      }
    }

    let horas = 0;
    let restanteAsc = ascensoH;
    for (let i = 0; i < tramos.length; i++) {
      const { distanciaNm: d, cursoT } = tramos[i];
      let distCruc = d;
      if (restanteAsc > 1e-9) {
        const v = vAsc[i];
        if (!v) return filaVacia(altitudFt, "viento");
        const gsA = gsEn(cursoT, tasAsc, v);
        if (gsA === null) return filaVacia(altitudFt, "imposible");
        const tHastaFin = d / gsA;
        if (restanteAsc >= tHastaFin) {
          horas += tHastaFin;
          restanteAsc -= tHastaFin;
          continue;
        }
        horas += restanteAsc;
        distCruc = d - gsA * restanteAsc;
        restanteAsc = 0;
      }
      const gsC = gsEn(cursoT, tasKt, vCrucero[i]);
      if (gsC === null) return filaVacia(altitudFt, "imposible");
      horas += distCruc / gsC;
    }
    if (restanteAsc > 1e-9) return filaVacia(altitudFt, "no-nivela");

    const minutos = horas * 60;
    return {
      altitudFt,
      datos: {
        viento: viento ?? { direccion: 0, velocidad: 0 },
        colaKt: cola,
        cruzadaKt: cruzMax,
        ladoCruzada: cruzMax >= 0.5 ? cruzLado : null,
        gsKt: total / horas,
        minutos,
        minutosAscenso: ascensoH * 60,
        litros: consumoLh && consumoLh > 0 ? horas * consumoLh : null,
      },
      motivo: null,
      esMejor: false,
    };
  });

  // La mejor: menos tiempo; empate (al minuto) → la más baja.
  let mejor = -1;
  filas.forEach((f, i) => {
    if (!f.datos) return;
    if (mejor < 0) mejor = i;
    else {
      const m = filas[mejor].datos!.minutos;
      const d = f.datos.minutos;
      if (Math.round(d * 10) / 10 < Math.round(m * 10) / 10 || (Math.round(d * 10) / 10 === Math.round(m * 10) / 10 && f.altitudFt < filas[mejor].altitudFt)) mejor = i;
    }
  });
  if (mejor >= 0) filas[mejor].esMejor = true;
  // Los niveles VFR se marcan aparte del tiempo: no cambian cuál es la mejor.
  const cursos = tramos.map((t) => t.cursoT);
  for (const f of filas) f.vfr = marcaVfr(f.altitudFt, cursos, variacionW, elevacionMaxFt);
  return filas;
}

/** "1:12" para 72 minutos, redondeando al minuto. */
export function textoDuracion(minutos: number): string {
  const t = Math.round(minutos);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** "0112" (casilla 16) para 72 minutos. */
export function eetDeMinutos(minutos: number): string {
  const t = Math.max(1, Math.round(minutos));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}${String(t % 60).padStart(2, "0")}`;
}

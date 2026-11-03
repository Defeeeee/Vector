import { distanciaNmPrecisa } from "./distance";
import { dentroDelEspacio, type EspacioAereo } from "./espacios-aereos";
import { aMagnetico, puntoDesde, rumboVerdadero, type Punto } from "./navegacion";
import { esAerovia } from "./ruta-planificada";
import type { PuntoResuelto } from "./resolucion-puntos";

/**
 * **La ruta del Mapa** (3.0.0): lo que se escribe en la tarjeta, los tramos que se dibujan,
 * los espacios aéreos que atraviesa y, en vuelo, a qué punto vas. Puro: la pantalla
 * resuelve los tokens contra `/api/puntos` —el mismo directorio del Planificador, que anda
 * sin señal— y le pasa acá lo que volvió.
 */

/** Más que los 12 del Planificador: en el mapa una aerovía escrita a mano suma puntos. */
export const MAX_TOKENS = 30;

/** "SADF DCT UGIMI W18 BCA" → ["SADF", "UGIMI", "W18", "BCA"]. `DCT` no es un punto. */
export function tokensDeRuta(texto: string): string[] {
  return (texto ?? "")
    .toUpperCase()
    // Los mismos separadores que el Planificador (`parsearRuta`): la ruta viaja en la URL
    // como `SADF-SADM`.
    .split(/[\s,\-]+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== "DCT")
    .slice(0, MAX_TOKENS);
}

/** Qué pedirle a `/api/puntos` por cada token: una aerovía va con el punto de antes y el de después. */
export function consultasDeRuta(tokens: string[]): { q: string; desde: string; hasta: string }[] {
  return tokens.map((q, i) =>
    esAerovia(q) ? { q, desde: tokens[i - 1] ?? "", hasta: tokens[i + 1] ?? "" } : { q, desde: "", hasta: "" }
  );
}

export interface PuntoMapa extends Punto {
  codigo: string;
  label: string;
  clase: PuntoResuelto["clase"];
  /** La aerovía por la que se llega a este punto, si vino de una. */
  aerovia?: string;
  variacionW?: number;
  elevacionFt?: number;
  pistas?: PuntoResuelto["pistas"];
}

/**
 * Los puntos de la ruta, en orden, con las aerovías ya abiertas en sus puntos. `resueltos[i]`
 * es lo que volvió para `tokens[i]`: `undefined` mientras se busca, `null` si no existe.
 * Lo que no se ubicó no entra al dibujo, pero se devuelve aparte para decirlo.
 */
export function puntosDeRuta(
  tokens: string[],
  resueltos: (PuntoResuelto | null | undefined)[]
): { puntos: PuntoMapa[]; sinUbicar: string[]; buscando: boolean } {
  const puntos: PuntoMapa[] = [];
  const sinUbicar: string[] = [];
  let buscando = false;
  const agregar = (p: PuntoResuelto, aerovia?: string) => {
    const ultimo = puntos[puntos.length - 1];
    // La salida de una aerovía es también el token que sigue: no se repite.
    if (ultimo && ultimo.codigo === p.codigo && Math.abs(ultimo.lat - p.lat) < 1e-6) return;
    puntos.push({
      codigo: p.codigo,
      label: p.label,
      lat: p.lat,
      lon: p.lon,
      clase: p.clase,
      aerovia,
      variacionW: p.variacionW,
      elevacionFt: p.elevacionFt,
      pistas: p.pistas,
    });
  };
  tokens.forEach((t, i) => {
    const r = resueltos[i];
    if (r === undefined) {
      buscando = true;
      return;
    }
    if (r === null) {
      sinUbicar.push(t);
      return;
    }
    if (r.clase === "aerovia") {
      for (const p of r.tramo ?? []) agregar(p, t);
      return;
    }
    agregar(r);
  });
  return { puntos, sinUbicar, buscando };
}

export interface TramoMapa {
  desde: PuntoMapa;
  hasta: PuntoMapa;
  distanciaNm: number;
  rumboT: number;
  /** Con la variación del primer aeródromo de la ruta; `null` si no hay ninguno. */
  rumboM: number | null;
}

/** La variación de la ruta: la del primer punto que la tenga (sólo los aeródromos). */
export function variacionDeRuta(puntos: PuntoMapa[]): number | null {
  return puntos.find((p) => typeof p.variacionW === "number")?.variacionW ?? null;
}

export function tramosDeRuta(puntos: PuntoMapa[]): { tramos: TramoMapa[]; totalNm: number } {
  const variacion = variacionDeRuta(puntos);
  const tramos: TramoMapa[] = [];
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const rumboT = rumboVerdadero(a, b);
    tramos.push({
      desde: a,
      hasta: b,
      distanciaNm: distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon),
      rumboT,
      rumboM: variacion === null ? null : aMagnetico(rumboT, variacion),
    });
  }
  return { tramos, totalNm: tramos.reduce((s, t) => s + t.distanciaNm, 0) };
}

/**
 * Los espacios aéreos que la ruta atraviesa, en el orden en que se entra a cada uno. Se
 * mira cada media milla de cada tramo: alcanza para una ATZ de 3 NM y no cuesta nada.
 *
 * **Sólo lateralmente.** No se sabe a qué altura vas a pasar, así que esto dice "la ruta
 * cruza la TMA Baires", no "vas a entrar": con sus límites verticales al lado, lo decide
 * el piloto.
 */
export function espaciosEnRuta(puntos: Punto[], espacios: EspacioAereo[]): EspacioAereo[] {
  const vistos: EspacioAereo[] = [];
  const mirar = (p: Punto) => {
    for (const e of espacios) if (!vistos.includes(e) && dentroDelEspacio(e, p)) vistos.push(e);
  };
  if (puntos.length === 1) mirar(puntos[0]);
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const d = distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
    const rumbo = rumboVerdadero(a, b);
    const pasos = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 0; k <= pasos; k++) mirar(k === pasos ? b : puntoDesde(a, rumbo, (d * k) / pasos));
  }
  return vistos;
}

/** Dónde estás parado según el GPS: los espacios que te contienen lateralmente. */
export function espaciosEn(p: Punto, espacios: EspacioAereo[]): EspacioAereo[] {
  return espacios.filter((e) => dentroDelEspacio(e, p));
}

/* --------------------------------------------------------------- en vuelo --- */

/** A esta distancia de un punto se pasa al siguiente. */
export const LLEGADA_NM = 1;

/**
 * El índice del punto al que vas. Arranca en `actual` y avanza cuando llegaste (a menos de
 * `LLEGADA_NM`) o cuando ya lo pasaste: cruzaste la perpendicular del punto en el tramo que
 * lleva a él, que es lo que pasa cuando cortás camino o pasás al costado sin tocarlo. El
 * primero (la salida) se da por pasado si ya estás más cerca del segundo que la salida.
 * Nunca vuelve para atrás: si te desviás, el piloto elige el punto a mano.
 */
export function proximoPunto(puntos: Punto[], posicion: Punto, actual: number): number {
  const d = (a: Punto, b: Punto) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
  let i = Math.max(0, Math.min(actual, puntos.length - 1));
  while (i < puntos.length - 1) {
    const p = puntos[i];
    if (d(posicion, p) < LLEGADA_NM) i++;
    else if (i === 0 ? d(posicion, puntos[1]) < d(p, puntos[1]) : pasoDeLargo(puntos[i - 1], p, posicion)) i++;
    else break;
  }
  return i;
}

/** ¿La posición ya pasó la perpendicular del punto `b` en el tramo `a → b`? */
function pasoDeLargo(a: Punto, b: Punto, posicion: Punto): boolean {
  const rumboTramo = rumboVerdadero(a, b);
  const rumboDesdeB = rumboVerdadero(b, posicion);
  const diferencia = Math.abs(((rumboDesdeB - rumboTramo + 540) % 360) - 180);
  return diferencia < 90;
}

export interface HaciaPunto {
  distanciaNm: number;
  rumboT: number;
  /** Minutos a la velocidad sobre el terreno; `null` si casi no te movés. */
  eteMin: number | null;
}

/** Cuánto falta para un punto, desde donde estás, a la velocidad que vas. */
export function haciaPunto(posicion: Punto, punto: Punto, gsKt: number | null): HaciaPunto {
  const distanciaNm = distanciaNmPrecisa(posicion.lat, posicion.lon, punto.lat, punto.lon);
  return {
    distanciaNm,
    rumboT: rumboVerdadero(posicion, punto),
    eteMin: gsKt && gsKt > 20 ? (distanciaNm / gsKt) * 60 : null,
  };
}

/** Lo que da el GPS del teléfono, en las unidades del piloto. */
export function lecturaGps(c: { latitude: number; longitude: number; altitude: number | null; speed: number | null; heading: number | null; accuracy: number }) {
  return {
    lat: c.latitude,
    lon: c.longitude,
    /** Altura GPS (geométrica), no la del altímetro. */
    altitudFt: c.altitude === null ? null : Math.round(c.altitude * 3.28084),
    gsKt: c.speed === null ? null : c.speed * 1.943844,
    trackT: c.heading === null || Number.isNaN(c.heading) ? null : c.heading,
    precisionM: c.accuracy,
  };
}

/** "1 h 05 min", "12 min": sin `toLocale*`, que difiere entre Node y el navegador. */
export function duracionCorta(minutos: number): string {
  const total = Math.round(minutos);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** El punto que está a `nm` millas desde la salida, sobre la ruta. */
export function puntoEnRuta(puntos: Punto[], nm: number): Punto | null {
  let resto = nm;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    const d = distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
    if (resto <= d) return puntoDesde(a, rumboVerdadero(a, b), resto);
    resto -= d;
  }
  return puntos[puntos.length - 1] ?? null;
}

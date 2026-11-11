import { distanciaAlBorde, dentroDelEspacio, type EspacioAereo } from "./espacios-aereos";
import { espaciosEn } from "./mapa-ruta";
import { dependenciasEn, rangoEnPies, type Fir } from "./firs";
import { puntoDesde, type Punto } from "./navegacion";

/**
 * El aviso de "estás por entrar a…", en vuelo (Mapa → Volar). Ayuda VFR con el GPS del teléfono:
 * proyecta el track hacia adelante y dice qué espacio de los que dibuja el mapa vas a tocar
 * primero. No es una autorización ni una instrucción de control, y no reemplaza la carta.
 *
 * Todo es puro: la pantalla le pasa la lectura del GPS (`lecturaGps` de `mapa-ruta.ts`) y guarda
 * el estado de la histéresis (`sostenerAviso`).
 */

/** Por debajo de esto el track del GPS no sirve (en el suelo, rodando): no hay aviso. */
export const GS_MINIMA_KT = 15;
/** Cuánto se mira hacia adelante: lo que sea mayor entre estos minutos y estas millas. */
export const HORIZONTE_MIN = 3;
export const HORIZONTE_MIN_NM = 5;
/** El paso de la proyección. Un espacio más angosto que esto, en línea recta, igual se ve (se mira el borde con la misma resolución). */
const PASO_NM = 0.25;
/**
 * Margen vertical. La altura es la del GPS (geométrica), no la del altímetro, y el piso o techo
 * del AIP es sobre el mar: sólo se descarta un espacio si se está más lejos que esto de sus límites.
 */
export const MARGEN_VERTICAL_FT = 500;
/** Cuánto se sostiene un aviso que la proyección ya no confirma. */
export const SOSTENER_S = 20;
/** Si la distancia al borde crece más que esto respecto de la última confirmada, el piloto se alejó. */
export const ALEJARSE_NM = 1;

export interface Lectura {
  lat: number;
  lon: number;
  /** Altura GPS en pies, o `null`. */
  altitudFt: number | null;
  gsKt: number | null;
  /** Track verdadero. */
  trackT: number | null;
}

export interface AvisoEspacio {
  espacio: EspacioAereo;
  /** Millas hasta el borde, sobre el track. */
  distanciaNm: number;
  /** Minutos hasta el borde a la GS actual. */
  minutos: number;
  /** El punto donde entrarías. */
  entrada: Punto;
  /** Con quién se habla adentro. `null` si el AIP no publica nada. */
  dependencia: { distintivo: string; mhz: string[] } | null;
  /**
   * Lo que no se pudo confirmar de la altura: "si estás por debajo de 5.500 ft". `null` si la
   * altura GPS cae adentro de los límites del espacio.
   */
  condicionVertical: string | null;
}

function miles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Millas con coma y un decimal, sin `toLocale*` (invariante 1). */
export function nmCorto(nm: number): string {
  return nm.toFixed(1).replace(".", ",");
}

/** "menos de 1 min", "1 min", "2 min". */
export function minutosCorto(min: number): string {
  return min < 0.5 ? "menos de 1 min" : `${Math.max(1, Math.round(min))} min`;
}

/** "En 2,3 NM (1 min) entrás a la CTR EZEIZA · Torre 118.850". El nombre es el del AIP, con el tipo adelante. */
export function textoDelAviso(a: AvisoEspacio): string {
  const base = `En ${nmCorto(a.distanciaNm)} NM (${minutosCorto(a.minutos)}) entrás a la ${a.espacio.nombre}`;
  const radio = a.dependencia ? ` · ${a.dependencia.distintivo}${a.dependencia.mhz.length ? ` ${a.dependencia.mhz.join(" · ")}` : ""}` : "";
  return `${base}${radio}${a.condicionVertical ? ` (${a.condicionVertical})` : ""}`;
}

/**
 * ¿La altura es compatible con los límites del espacio? `descartar` sólo si queda claramente por
 * arriba del techo o por debajo del piso. Con altura desconocida, o con límites que no se
 * entienden, se avisa igual y se dice qué falta saber.
 */
export function chequeoVertical(e: Pick<EspacioAereo, "limites">, altitudFt: number | null): { descartar: boolean; condicion: string | null } {
  const r = rangoEnPies(e.limites);
  if (!r) return { descartar: false, condicion: "límites verticales sin confirmar" };
  // Un piso sobre el terreno (AGL) no se compara con la altura sobre el mar.
  const pisoUtil = r.piso > 0 && !/AGL/i.test(e.limites);
  const techoTxt = r.techo >= 999999 ? null : `${miles(r.techo)} ft`;
  if (altitudFt === null) {
    return { descartar: false, condicion: techoTxt ? `si estás por debajo de ${techoTxt}` : null };
  }
  if (techoTxt && altitudFt > r.techo + MARGEN_VERTICAL_FT) return { descartar: true, condicion: null };
  if (pisoUtil && altitudFt < r.piso - MARGEN_VERTICAL_FT) return { descartar: true, condicion: null };
  // Cerca del límite: la altura del GPS no alcanza para asegurar que estás adentro.
  if (techoTxt && altitudFt > r.techo) return { descartar: false, condicion: `si estás por debajo de ${techoTxt}` };
  if (pisoUtil && altitudFt < r.piso) return { descartar: false, condicion: `si estás por arriba de ${miles(r.piso)} ft` };
  return { descartar: false, condicion: null };
}

/** Dónde cruza el borde, entre `dA` (afuera) y `dB` (adentro) millas sobre el track, por bisección. */
function bordeEntre(e: EspacioAereo, origen: Punto, trackT: number, dA: number, dB: number): { p: Punto; nm: number } {
  let lo = dA;
  let hi = dB;
  let adentro = puntoDesde(origen, trackT, dB);
  for (let i = 0; i < 5; i++) {
    const mid = (lo + hi) / 2;
    const p = puntoDesde(origen, trackT, mid);
    if (dentroDelEspacio(e, p)) {
      hi = mid;
      adentro = p;
    } else lo = mid;
  }
  return { p: adentro, nm: hi };
}

/**
 * El primer espacio en el que todavía no estás y al que entrarías si seguís derecho. Mira lo
 * que sea mayor entre `HORIZONTE_MIN` minutos y `HORIZONTE_MIN_NM` millas.
 * `null` en el suelo (menos de `GS_MINIMA_KT`), sin track o sin GS.
 */
export function avisoDeEspacios(l: Lectura, espacios: EspacioAereo[], firs: Fir[]): AvisoEspacio | null {
  if (l.gsKt === null || l.gsKt < GS_MINIMA_KT || l.trackT === null || Number.isNaN(l.trackT)) return null;
  const horizonte = Math.max((l.gsKt * HORIZONTE_MIN) / 60, HORIZONTE_MIN_NM);
  // Los que ya te contienen no son "los próximos": se avisa del siguiente.
  const adentro = new Set(espaciosEn(l, espacios).map((e) => e.id));
  const candidatos = espacios.filter((e) => !adentro.has(e.id) && e.poligono.length >= 3);
  const pendientes = new Set(candidatos.map((e) => e.id));
  const hallados: { e: EspacioAereo; nm: number; p: Punto }[] = [];
  let dPrevio = 0;
  const pasos = Math.ceil(horizonte / PASO_NM);
  for (let k = 1; k <= pasos && pendientes.size; k++) {
    const d = Math.min(horizonte, k * PASO_NM);
    const p = puntoDesde(l, l.trackT, d);
    for (const e of candidatos) {
      if (!pendientes.has(e.id)) continue;
      if (dentroDelEspacio(e, p)) {
        pendientes.delete(e.id);
        const b = bordeEntre(e, l, l.trackT, dPrevio, d);
        hallados.push({ e, nm: b.nm, p: b.p });
      }
    }
    dPrevio = d;
  }
  hallados.sort((a, b) => a.nm - b.nm);
  for (const h of hallados) {
    const v = chequeoVertical(h.e, l.altitudFt);
    if (v.descartar) continue;
    return {
      espacio: h.e,
      distanciaNm: h.nm,
      minutos: (h.nm / l.gsKt) * 60,
      entrada: h.p,
      dependencia: dependenciaDe(h.e, h.p, l.altitudFt, espacios, firs),
      condicionVertical: v.condicion,
    };
  }
  return null;
}

/** Con quién se habla adentro del espacio: la dependencia que `dependenciasEn` da en el punto de entrada, o la del AIP. */
function dependenciaDe(e: EspacioAereo, entrada: Punto, altitudFt: number | null, espacios: EspacioAereo[], firs: Fir[]): AvisoEspacio["dependencia"] {
  const d = dependenciasEn(entrada, altitudFt, espacios, firs).find((x) => (x.tipo === "torre" || x.tipo === "tma") && x.donde === e.nombre);
  if (d) return { distintivo: d.distintivo, mhz: d.mhz };
  if (!e.dependencia) return null;
  return {
    distintivo: e.dependencia.distintivo,
    mhz: e.dependencia.sectores.flatMap((s) => (s.nombre ? s.mhz.map((m) => `${m} (${s.nombre!.toLowerCase()})`) : s.mhz)),
  };
}

/* ------------------------------------------------------------- histéresis --- */

export interface EstadoAviso {
  aviso: AvisoEspacio;
  /** Cuándo (ms) lo confirmó la proyección por última vez. */
  confirmadoMs: number;
  /** Distancia al borde en esa confirmación. */
  distanciaConfirmadaNm: number;
}

/**
 * Qué aviso mostrar, dado el anterior y el que acaba de calcular la proyección. Sin esto, un
 * GPS que tiembla en el rumbo lo prende y lo apaga. Un aviso se sostiene (con la distancia
 * recalculada) mientras no pase una de estas:
 * - el piloto entró al espacio;
 * - se alejó claramente (el borde está `ALEJARSE_NM` más lejos que la última vez que se confirmó);
 * - pasaron `SOSTENER_S` segundos sin que la proyección lo confirme;
 * - quedó en el suelo (GS conocida y menor a `GS_MINIMA_KT`).
 * Si la proyección da otro espacio, gana el nuevo.
 */
export function sostenerAviso(previo: EstadoAviso | null, nuevo: AvisoEspacio | null, l: Lectura, ahoraMs: number): EstadoAviso | null {
  if (nuevo) return { aviso: nuevo, confirmadoMs: ahoraMs, distanciaConfirmadaNm: nuevo.distanciaNm };
  if (!previo) return null;
  const e = previo.aviso.espacio;
  if (dentroDelEspacio(e, l)) return null;
  if (l.gsKt !== null && l.gsKt < GS_MINIMA_KT) return null;
  if (ahoraMs - previo.confirmadoMs > SOSTENER_S * 1000) return null;
  const borde = distanciaAlBorde(e.poligono.map(([lat, lon]) => ({ lat, lon })), l);
  if (borde > previo.distanciaConfirmadaNm + ALEJARSE_NM) return null;
  const gs = l.gsKt ?? 0;
  return {
    ...previo,
    aviso: { ...previo.aviso, distanciaNm: borde, minutos: gs >= GS_MINIMA_KT ? (borde / gs) * 60 : previo.aviso.minutos },
  };
}

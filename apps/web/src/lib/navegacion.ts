import { distanciaNmPrecisa } from "./distance";
import { windTriangle } from "./aviation";

/**
 * La planilla de navegación: de dos coordenadas a qué rumbo poner y cuánto tarda.
 *
 * Es lo que hoy se hace la noche anterior en una planilla fotocopiada. Vector entraba
 * recién cuando el vuelo había terminado; esto lo mete en el momento en que el piloto
 * planifica — que para un PPA juntando horas de travesía para el PCA es justo lo que
 * más hace.
 *
 * ## El marco de referencia, que es el punto delicado de todo el archivo
 *
 * **Toda la matemática de acá adentro es en grados verdaderos. La variación magnética
 * se aplica una sola vez, al final, para mostrar.**
 *
 * No es una preferencia estética: es lo único que cierra. El curso sale de coordenadas
 * y por lo tanto es **verdadero**. El viento del METAR se reporta en grados
 * **verdaderos** (el de la torre por radio es magnético, el escrito no). Y
 * `windTriangle` es agnóstico del marco: te devuelve el rumbo en el mismo sistema en
 * que le pasaste el curso. Si se mezclan los dos marcos el resultado sale mal **en
 * silencio**, con todos los números corridos exactamente lo mismo — que es la firma de
 * ese bug y la razón por la que es peligroso: los números se ven razonables.
 *
 * En Argentina la variación va de ~5° a ~15° W según la zona. Equivocarse en el signo
 * son el doble: 10 a 30° de error de rumbo, que en una travesía de 100 NM son entre 17
 * y 50 NM de desvío.
 */

/** Cualquier cosa con posición: un aeródromo del directorio o un punto tipeado. */
export interface Punto {
  lat: number;
  lon: number;
}

export interface Viento {
  /** De dónde sopla, **en grados verdaderos** — como lo escribe el METAR. */
  direccion: number;
  /** Nudos. */
  velocidad: number;
}

/**
 * Rumbo verdadero de un punto a otro, 0–360. **Loxodrómico: el rumbo constante.**
 *
 * **No existía ninguna función de bearing en el proyecto**: `distance.ts` medía cuánto
 * hay pero no para dónde.
 *
 * La elección entre loxodrómica y ortodrómica no es teórica acá, y va a favor de la
 * loxodrómica por una razón sola: **es la que se puede volar.** Una planilla de
 * navegación existe para poner un número en el DG y sostenerlo hasta el próximo punto.
 * El rumbo inicial del gran círculo no sirve para eso — cambia mientras avanzás, así
 * que sostenerlo te deja al costado.
 *
 * Cuánto importa, con números: SADM→SAAJ (113 NM) da 274,05° loxodrómico contra
 * 273,40° ortodrómico — medio grado, ruido. Pero SADM→SAZN (524 NM) da 240,71° contra
 * 237,93°: **casi tres grados**. La diferencia crece con `Δλ · sen(latitud)`, o sea con
 * los tramos largos este-oeste, que son exactamente los de travesía.
 *
 * Hay una propiedad que lo confirma y que además se testea: **el rumbo de vuelta es
 * exactamente el recíproco**, 180° justos. En el gran círculo no lo es (SAAJ→SADM da
 * 178,70° de diferencia), y una planilla donde la ida y la vuelta no son recíprocas
 * está mal para cualquier piloto que la mire.
 *
 * La distancia sigue siendo la ortodrómica de `distanciaNmPrecisa`: ahí la diferencia
 * es de segundo orden —décimas de milla en estos tramos— y no justifica una segunda
 * implementación.
 */
export function rumboVerdadero(desde: Punto, hasta: Punto): number {
  const toRad = (g: number) => (g * Math.PI) / 180;
  const φ1 = toRad(desde.lat);
  const φ2 = toRad(hasta.lat);

  // Diferencia de latitudes "estiradas" de Mercator: es lo que convierte una recta en
  // la carta en un rumbo constante.
  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));

  let Δλ = toRad(hasta.lon - desde.lon);
  // Por el lado corto. Irrelevante en Argentina, pero un rumbo que se va por el
  // Pacífico porque cruzó el antimeridiano es el tipo de borde que nadie revisa.
  if (Math.abs(Δλ) > Math.PI) Δλ -= Math.sign(Δλ) * 2 * Math.PI;

  return ((Math.atan2(Δλ, Δψ) * 180) / Math.PI + 360) % 360;
}

/**
 * A dónde se llega saliendo de un punto con un rumbo y una distancia.
 *
 * Es el problema inverso de `rumboVerdadero`, y usa **la misma geometría loxodrómica**
 * para que las dos operaciones cierren: salir de A con el rumbo hacia B y la distancia
 * A-B tiene que caer en B. Con gran círculo no cerraría, porque el rumbo cambia en el
 * camino.
 *
 * Lo usa el punto por radial y distancia de un VOR: "25 NM en el radial 045 de BAR".
 *
 * `rumboT` va en grados **verdaderos**. Si venís de un radial —que es magnético— hay que
 * convertirlo antes con la variación **de la estación**; ver `lib/puntos.ts`.
 */
export function puntoDesde(origen: Punto, rumboT: number, distanciaNm: number): Punto {
  const toRad = (g: number) => (g * Math.PI) / 180;
  const R = 3440.065; // radio terrestre en NM, el mismo que usa `distance.ts`

  const δ = distanciaNm / R;
  const θ = toRad(rumboT);
  const φ1 = toRad(origen.lat);
  const λ1 = toRad(origen.lon);

  const Δφ = δ * Math.cos(θ);
  const φ2 = φ1 + Δφ;

  const Δψ = Math.log(Math.tan(Math.PI / 4 + φ2 / 2) / Math.tan(Math.PI / 4 + φ1 / 2));
  /*
    En un rumbo este-oeste puro `Δψ` tiende a cero y la división explota. El límite
    matemático de `Δφ/Δψ` cuando ambos tienden a cero es `cos(φ)`, así que se usa eso
    directamente. Sin esta rama, volar exactamente al 090 daría `NaN`.
  */
  const q = Math.abs(Δψ) > 1e-11 ? Δφ / Δψ : Math.cos(φ1);
  const Δλ = (δ * Math.sin(θ)) / q;

  return {
    lat: (φ2 * 180) / Math.PI,
    // Normalizado a (-180, 180]: sin esto, cruzar el antimeridiano daría una longitud
    // de 190 grados que ningún mapa sabe dibujar.
    lon: ((((λ1 + Δλ) * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * De verdadero a magnético.
 *
 * `variacionW` va **en grados oeste positivos**, que es como lo publica la carta
 * argentina ("VAR 8°W") y como lo lee el piloto. Al verdadero se le **suma** — el
 * "west is best" de memoria. Una variación este se pasa negativa.
 *
 * El nombre lleva la `W` adentro justamente porque el modelo geomagnético (WMM) publica
 * declinación con el signo al revés, positiva al este. Un campo llamado `variacion` a
 * secas sería una invitación a mezclarlos, y mezclarlos duplica el error en vez de
 * anularlo.
 */
export function aMagnetico(verdadero: number, variacionW: number): number {
  return ((verdadero + variacionW) % 360 + 360) % 360;
}

export interface Tramo {
  distanciaNm: number;
  cursoVerdadero: number;
  cursoMagnetico: number;
  /** Corrección por viento, grados. Positivo = se cabecea a la derecha. */
  wca: number;
  rumboVerdadero: number;
  /** El que va escrito en la planilla y el que se pone en el DG. */
  rumboMagnetico: number;
  groundSpeed: number;
  /** Minutos de tramo, o `null` si con este viento no se puede volar. */
  minutos: number | null;
  /** Litros del tramo, o `null` si no hay consumo cargado o el tramo no se puede volar. */
  litros: number | null;
  /** Viento más fuerte de lo que la TAS puede corregir, o que la anula. */
  imposible: boolean;
}

export interface ParametrosTramo {
  tasKt: number;
  viento: Viento;
  /** Grados **oeste positivos**. Ver `aMagnetico`. */
  variacionW: number;
  /** Litros por hora. Sin esto los litros quedan en `null`, no en cero. */
  consumoLh?: number;
}

/**
 * Un tramo completo: cuánto hay, qué rumbo poner, cuánto tarda y cuánto consume.
 *
 * No reimplementa nada: la distancia sale de `distanciaNmPrecisa` y el triángulo de
 * `windTriangle`. Lo único propio es el rumbo y la conversión de marco.
 */
export function calcularTramo(desde: Punto, hasta: Punto, params: ParametrosTramo): Tramo {
  const { tasKt, viento, variacionW, consumoLh } = params;

  const distanciaNm = distanciaNmPrecisa(desde.lat, desde.lon, hasta.lat, hasta.lon);
  const cursoVerdadero = rumboVerdadero(desde, hasta);

  // Curso verdadero + viento verdadero → rumbo verdadero. Sin variación de por medio:
  // recién entra en las dos líneas de abajo.
  const t = windTriangle({
    course: cursoVerdadero,
    tas: tasKt,
    windDir: viento.direccion,
    windSpeed: viento.velocidad,
  });

  const volable = !t.impossible && t.groundSpeed > 0;
  const minutos = volable ? (distanciaNm / t.groundSpeed) * 60 : null;

  return {
    distanciaNm,
    cursoVerdadero,
    cursoMagnetico: aMagnetico(cursoVerdadero, variacionW),
    wca: t.wca,
    rumboVerdadero: t.heading,
    rumboMagnetico: aMagnetico(t.heading, variacionW),
    groundSpeed: t.groundSpeed,
    minutos,
    litros: minutos !== null && consumoLh !== undefined ? (minutos / 60) * consumoLh : null,
    imposible: !volable,
  };
}

export interface Plan {
  tramos: Tramo[];
  totales: {
    distanciaNm: number;
    /** `null` si algún tramo no se puede volar: media suma no es un total. */
    minutos: number | null;
    /** `null` si falta el consumo o si algún tramo no se puede volar. */
    litros: number | null;
  };
  /** Cuántos tramos no se pueden volar con este viento. Cero es lo normal. */
  tramosImposibles: number;
}

/**
 * La planilla entera: los tramos y lo que suman.
 *
 * Con menos de dos puntos no hay plan — devuelve todo en cero y ningún tramo, que es
 * el estado de la pantalla mientras el piloto todavía está cargando la ruta.
 *
 * **Los totales de tiempo y combustible se anulan si algún tramo es imposible.** Sumar
 * los que sí cierran daría un número más chico que la realidad y con pinta de válido —
 * exactamente el tipo de dato con el que alguien despega. Los tramos individuales
 * quedan igual en la lista para que la pantalla muestre cuál es el que traba.
 *
 * **No calcula reservas ni contesta "¿me alcanza el combustible?"**: eso es `computeFuel`
 * de `aviation.ts`, y la pantalla lo llama con `totales.minutos`. Meterlo acá adentro
 * sería tener la política de reservas escrita en dos lados.
 */
export function calcularPlan(puntos: Punto[], params: ParametrosTramo): Plan {
  const tramos: Tramo[] = [];
  for (let i = 0; i + 1 < puntos.length; i++) {
    tramos.push(calcularTramo(puntos[i], puntos[i + 1], params));
  }

  const tramosImposibles = tramos.filter((t) => t.imposible).length;
  const distanciaNm = tramos.reduce((suma, t) => suma + t.distanciaNm, 0);
  const hayConsumo = params.consumoLh !== undefined;

  return {
    tramos,
    totales: {
      distanciaNm,
      minutos: tramosImposibles > 0 ? null : tramos.reduce((suma, t) => suma + (t.minutos ?? 0), 0),
      litros:
        tramosImposibles > 0 || !hayConsumo
          ? null
          : tramos.reduce((suma, t) => suma + (t.litros ?? 0), 0),
    },
    tramosImposibles,
  };
}

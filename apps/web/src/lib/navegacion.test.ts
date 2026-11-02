import { describe, expect, it } from "vitest";
import {
  aMagnetico,
  calcularPlan,
  calcularTramo,
  puntoDesde,
  rumboVerdadero,
  type Punto,
} from "./navegacion";
import { distanciaNmPrecisa } from "./distance";

/**
 * Los rumbos esperados salen de una implementación aparte, escrita en otro lenguaje a
 * partir de la fórmula y no del código de acá. Comparar el código contra sí mismo no
 * prueba nada.
 *
 * Y las coordenadas son las de `madhel.tsv`, no inventadas: un test de navegación que
 * no se pueda contrastar contra una carta no sirve para lo único que tiene que servir.
 */

const SADM: Punto = { lat: -34.6792, lon: -58.6436 }; // Morón
const SAAJ: Punto = { lat: -34.5459, lon: -60.9305 }; // Junín
const SADF: Punto = { lat: -34.4545, lon: -58.5909 }; // San Fernando
const SAZN: Punto = { lat: -38.9489, lon: -68.1558 }; // Neuquén

describe("rumboVerdadero", () => {
  it("los cuatro cardinales", () => {
    expect(rumboVerdadero({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 6);
    expect(rumboVerdadero({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 6);
    expect(rumboVerdadero({ lat: 10, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(180, 6);
    expect(rumboVerdadero({ lat: 0, lon: 10 }, { lat: 0, lon: 0 })).toBeCloseTo(270, 6);
  });

  it("al este por un paralelo del sur da exactamente 090", () => {
    /*
      **Éste es el test que separa la loxodrómica de la ortodrómica.** Volando al este
      sobre el paralelo -34, el rumbo constante es 090 clavado. El gran círculo daría
      092,24° porque se comba hacia el polo. Si algún día alguien "mejora" esta función
      pasándola a ortodrómica, este test lo dice.
    */
    expect(rumboVerdadero({ lat: -34, lon: -58 }, { lat: -34, lon: -50 })).toBeCloseTo(90, 6);
  });

  it("SADM → SAAJ da 274,05°", () => {
    // Morón a Junín, 113 NM al oeste. Contrastable contra carta o SkyVector.
    expect(rumboVerdadero(SADM, SAAJ)).toBeCloseTo(274.0511, 3);
  });

  it("SADM → SADF da 010,9°", () => {
    // Un tramo corto al norte: 13,7 NM.
    expect(rumboVerdadero(SADM, SADF)).toBeCloseTo(10.9310, 3);
  });

  it("SADM → SAZN da 240,7°", () => {
    // 524 NM al suroeste. Acá la ortodrómica daría 237,93°: casi tres grados de
    // diferencia, y es la razón por la que el tramo largo decide la elección.
    expect(rumboVerdadero(SADM, SAZN)).toBeCloseTo(240.7098, 3);
  });

  it("el rumbo de vuelta es exactamente el recíproco", () => {
    // Propiedad de la loxodrómica que la ortodrómica no tiene (ahí SAAJ→SADM difiere
    // en 178,70°, no en 180). Una planilla donde ida y vuelta no son recíprocas está
    // mal para cualquier piloto que la mire.
    for (const [a, b] of [
      [SADM, SAAJ],
      [SADM, SAZN],
      [SADF, SAZN],
    ] as const) {
      const ida = rumboVerdadero(a, b);
      const vuelta = rumboVerdadero(b, a);
      expect(Math.abs(ida - vuelta)).toBeCloseTo(180, 6);
    }
  });

  it("el mismo punto no tiene rumbo definido, pero no devuelve NaN", () => {
    // atan2(0, 0) es 0 y no NaN. La pantalla igual no debería mostrar un tramo de
    // distancia cero, pero un NaN se propagaría a todos los totales.
    expect(Number.isNaN(rumboVerdadero(SADM, SADM))).toBe(false);
  });
});

describe("aMagnetico", () => {
  it("la variación oeste se suma: west is best", () => {
    // 8°W sobre un curso verdadero de 090 son 098 magnéticos.
    expect(aMagnetico(90, 8)).toBeCloseTo(98, 9);
  });

  it("la variación este se resta", () => {
    expect(aMagnetico(90, -8)).toBeCloseTo(82, 9);
  });

  it("da la vuelta por el norte en los dos sentidos", () => {
    expect(aMagnetico(355, 10)).toBeCloseTo(5, 9);
    expect(aMagnetico(5, -10)).toBeCloseTo(355, 9);
  });

  it("sin variación no toca nada", () => {
    expect(aMagnetico(123.4, 0)).toBeCloseTo(123.4, 9);
  });
});

describe("calcularTramo", () => {
  const sinViento = { tasKt: 110, viento: { direccion: 0, velocidad: 0 }, variacionW: 0 };

  it("sin viento el rumbo es el curso y la GS es la TAS", () => {
    // El mismo control de marco de referencia que en `aviation.test.ts`, ahora con la
    // cadena completa: coordenadas → curso → triángulo → rumbo.
    const t = calcularTramo(SADM, SAAJ, sinViento);
    expect(t.cursoVerdadero).toBeCloseTo(274.0511, 3);
    expect(t.rumboVerdadero).toBeCloseTo(274.0511, 3);
    expect(t.wca).toBeCloseTo(0, 9);
    expect(t.groundSpeed).toBeCloseTo(110, 9);
    expect(t.imposible).toBe(false);
  });

  it("la distancia no viene redondeada", () => {
    // 113,2855 NM. `distanceNm` daría 113 clavado, y ese redondeo encadenado por
    // cuatro tramos se come millas enteras.
    const t = calcularTramo(SADM, SAAJ, sinViento);
    expect(t.distanciaNm).toBeCloseTo(113.2855, 3);
    expect(Number.isInteger(t.distanciaNm)).toBe(false);
  });

  it("el tiempo sale de la distancia y la ground speed", () => {
    const t = calcularTramo(SADM, SAAJ, sinViento);
    expect(t.minutos).toBeCloseTo((113.2855 / 110) * 60, 2);
  });

  it("la variación corre el rumbo magnético y deja el verdadero quieto", () => {
    /*
      **El test central del marco de referencia.** La variación tiene que aparecer
      exactamente una vez y sólo en los campos magnéticos. Si se colara antes del
      triángulo de viento, el verdadero también se movería — y ése es el bug silencioso
      que el plan 12 marca como el único con consecuencia de navegación.
    */
    const sin = calcularTramo(SADM, SAAJ, sinViento);
    const con = calcularTramo(SADM, SAAJ, { ...sinViento, variacionW: 9 });

    expect(con.cursoVerdadero).toBeCloseTo(sin.cursoVerdadero, 9);
    expect(con.rumboVerdadero).toBeCloseTo(sin.rumboVerdadero, 9);
    expect(con.groundSpeed).toBeCloseTo(sin.groundSpeed, 9);
    expect(con.minutos!).toBeCloseTo(sin.minutos!, 9);

    expect(con.cursoMagnetico).toBeCloseTo(sin.cursoVerdadero + 9, 6);
    expect(con.rumboMagnetico).toBeCloseTo(sin.rumboVerdadero + 9, 6);
  });

  it("el viento del METAR es verdadero y entra sin convertir", () => {
    // Rumbo 090 verdadero con viento de 180/20 verdaderos: cruzado puro de la derecha.
    // Con 100 de TAS, WCA +11,54° y GS 97,98 — los mismos números de `aviation.test.ts`,
    // ahora llegando por la cadena completa.
    const oeste: Punto = { lat: 0, lon: 0 };
    const este: Punto = { lat: 0, lon: 5 };
    const t = calcularTramo(oeste, este, {
      tasKt: 100,
      viento: { direccion: 180, velocidad: 20 },
      variacionW: 0,
    });
    expect(t.cursoVerdadero).toBeCloseTo(90, 6);
    expect(t.wca).toBeCloseTo(11.5370, 3);
    expect(t.rumboVerdadero).toBeCloseTo(101.5370, 3);
    expect(t.groundSpeed).toBeCloseTo(97.9796, 3);
  });

  it("con viento imposible no inventa tiempo ni litros", () => {
    const t = calcularTramo(SADM, SAAJ, {
      tasKt: 50,
      viento: { direccion: 4, velocidad: 90 },
      variacionW: 9,
      consumoLh: 32,
    });
    expect(t.imposible).toBe(true);
    // Null y no cero: cero se leería como "no tarda nada" y "no consume nada".
    expect(t.minutos).toBeNull();
    expect(t.litros).toBeNull();
    // La distancia sí se sabe: no depende del viento.
    expect(t.distanciaNm).toBeCloseTo(113.2855, 3);
  });

  it("sin consumo cargado los litros son null, no cero", () => {
    const t = calcularTramo(SADM, SAAJ, sinViento);
    expect(t.litros).toBeNull();
    expect(t.minutos).not.toBeNull();
  });

  it("con consumo cargado, litros = horas × consumo", () => {
    const t = calcularTramo(SADM, SAAJ, { ...sinViento, consumoLh: 32 });
    expect(t.litros).toBeCloseTo((t.minutos! / 60) * 32, 9);
  });
});

describe("calcularPlan", () => {
  const params = {
    tasKt: 110,
    viento: { direccion: 0, velocidad: 0 },
    variacionW: 9,
    consumoLh: 32,
  };

  it("n puntos dan n-1 tramos", () => {
    expect(calcularPlan([SADM, SAAJ, SAZN, SADF], params).tramos).toHaveLength(3);
  });

  it("los totales son la suma de los tramos", () => {
    const plan = calcularPlan([SADM, SAAJ, SAZN], params);
    const sumaDist = plan.tramos.reduce((s, t) => s + t.distanciaNm, 0);
    const sumaMin = plan.tramos.reduce((s, t) => s + t.minutos!, 0);
    const sumaLitros = plan.tramos.reduce((s, t) => s + t.litros!, 0);

    expect(plan.totales.distanciaNm).toBeCloseTo(sumaDist, 9);
    expect(plan.totales.minutos!).toBeCloseTo(sumaMin, 9);
    expect(plan.totales.litros!).toBeCloseTo(sumaLitros, 9);
    expect(plan.tramosImposibles).toBe(0);
  });

  it("con menos de dos puntos no hay plan", () => {
    for (const puntos of [[], [SADM]]) {
      const plan = calcularPlan(puntos, params);
      expect(plan.tramos).toHaveLength(0);
      expect(plan.totales.distanciaNm).toBe(0);
      expect(plan.totales.minutos).toBe(0);
    }
  });

  it("un tramo imposible anula los totales de tiempo y combustible", () => {
    /*
      Sumar sólo los tramos que cierran daría un total más chico que la realidad y con
      pinta de válido. **Ése es el número con el que alguien despega.** La distancia sí
      se conserva: no depende del viento y sigue siendo cierta.
    */
    const plan = calcularPlan([SADM, SAAJ, SAZN], {
      ...params,
      tasKt: 50,
      viento: { direccion: 4, velocidad: 90 },
    });

    expect(plan.tramosImposibles).toBeGreaterThan(0);
    expect(plan.totales.minutos).toBeNull();
    expect(plan.totales.litros).toBeNull();
    expect(plan.totales.distanciaNm).toBeGreaterThan(0);
    // Y el tramo que traba queda identificable, para que la pantalla lo señale.
    expect(plan.tramos.some((t) => t.imposible)).toBe(true);
  });

  it("sin consumo los litros del total son null pero los minutos no", () => {
    const { consumoLh, ...sinConsumo } = params;
    void consumoLh;
    const plan = calcularPlan([SADM, SAAJ], sinConsumo);
    expect(plan.totales.litros).toBeNull();
    expect(plan.totales.minutos).not.toBeNull();
  });

  it("ida y vuelta al mismo punto suman el doble del tramo", () => {
    // Un cierre útil: con viento cero, SADM→SAAJ→SADM tiene que dar exactamente el
    // doble de tiempo que el tramo suelto. Con viento no, y por eso el viento va cero.
    const solo = calcularPlan([SADM, SAAJ], params);
    const ida = calcularPlan([SADM, SAAJ, SADM], params);
    expect(ida.totales.minutos!).toBeCloseTo(solo.totales.minutos! * 2, 6);
  });
});

describe("puntoDesde", () => {
  it("cierra con rumboVerdadero: salir de A hacia B llega a B", () => {
    /*
      **La propiedad que justifica usar la misma geometría en las dos funciones.** Si
      `puntoDesde` fuera ortodrómico y `rumboVerdadero` loxodrómico, esto no cerraría, y
      un punto construido por radial y distancia caería al lado del que uno quiso.

      El residuo que queda es real y está medido: `distanciaNmPrecisa` es **ortodrómica**
      y esta función camina sobre la **loxodrómica**, que es un poco más larga. En
      SADM→SAZN, 524 NM, la diferencia es de **0,217 NM** — un 0,04%. Por eso la
      tolerancia es de un cuarto de milla y no de un metro: es el precio conocido de
      medir con una geometría y rumbear con la otra, y en tiempos y combustible no se
      nota.
    */
    for (const [a, b] of [
      [SADM, SAAJ],
      [SADM, SAZN],
      [SADF, SAAJ],
    ] as const) {
      const d = distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon);
      const destino = puntoDesde(a, rumboVerdadero(a, b), d);
      expect(distanciaNmPrecisa(destino.lat, destino.lon, b.lat, b.lon)).toBeLessThan(0.25);
    }
  });

  it("en tramos cortos, que es donde se usa, cierra casi exacto", () => {
    // Un punto por radial y distancia son 10-50 NM. Ahí la diferencia entre las dos
    // geometrías es de tercer orden y desaparece.
    const cerca = { lat: -34.4545, lon: -58.5909 };
    const d = distanciaNmPrecisa(SADM.lat, SADM.lon, cerca.lat, cerca.lon);
    const destino = puntoDesde(SADM, rumboVerdadero(SADM, cerca), d);
    expect(destino.lat).toBeCloseTo(cerca.lat, 5);
    expect(destino.lon).toBeCloseTo(cerca.lon, 5);
  });

  it("al norte sube la latitud y no mueve la longitud", () => {
    // 60 NM son un grado de latitud, por definición de milla náutica.
    const d = puntoDesde({ lat: -34, lon: -58 }, 0, 60);
    expect(d.lat).toBeCloseTo(-33, 2);
    expect(d.lon).toBeCloseTo(-58, 6);
  });

  it("al sur baja la latitud", () => {
    expect(puntoDesde({ lat: -34, lon: -58 }, 180, 60).lat).toBeCloseTo(-35, 2);
  });

  it("al este puro no cambia la latitud y no da NaN", () => {
    /*
      El caso que rompe la fórmula ingenua: con rumbo 090 la diferencia de latitudes
      estiradas es cero y la división explota. El límite es `cos(latitud)`.
    */
    const d = puntoDesde({ lat: -34, lon: -58 }, 90, 60);
    expect(Number.isNaN(d.lat)).toBe(false);
    expect(Number.isNaN(d.lon)).toBe(false);
    expect(d.lat).toBeCloseTo(-34, 9);
    // A 34° de latitud, 60 NM al este son más de un grado de longitud.
    expect(d.lon).toBeGreaterThan(-58 + 1.1);
    expect(d.lon).toBeLessThan(-58 + 1.3);
  });

  it("al oeste puro tampoco", () => {
    const d = puntoDesde({ lat: -34, lon: -58 }, 270, 60);
    expect(d.lat).toBeCloseTo(-34, 9);
    expect(d.lon).toBeLessThan(-58);
  });

  it("la distancia de vuelta es la que se pidió", () => {
    for (const rumbo of [0, 45, 90, 137, 180, 225, 270, 314]) {
      const d = puntoDesde(SADM, rumbo, 25);
      expect(distanciaNmPrecisa(SADM.lat, SADM.lon, d.lat, d.lon)).toBeCloseTo(25, 1);
    }
  });

  it("distancia cero deja el punto donde estaba", () => {
    const d = puntoDesde(SADM, 137, 0);
    expect(d.lat).toBeCloseTo(SADM.lat, 9);
    expect(d.lon).toBeCloseTo(SADM.lon, 9);
  });

  it("normaliza la longitud si cruza el antimeridiano", () => {
    const d = puntoDesde({ lat: 0, lon: 179 }, 90, 240);
    expect(d.lon).toBeGreaterThan(-180);
    expect(d.lon).toBeLessThanOrEqual(180);
  });
});

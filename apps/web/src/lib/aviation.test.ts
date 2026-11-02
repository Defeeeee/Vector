import { describe, expect, it } from "vitest";
import {
  FEET_PER_NM,
  ISA_PRESSURE_HPA,
  angleDelta,
  computeAltitude,
  computeCloudBase,
  computeFuel,
  computeGlide,
  convertUnit,
  windComponents,
  windTriangle,
} from "./aviation";

/**
 * `aviation.ts` era el archivo más matemático del repo **sin un solo test**, y sobre
 * `windTriangle` se apoya todo el planificador de navegación que viene después. Esto
 * es el motor verificado antes de construirle encima.
 *
 * Los valores esperados salen de calcular a mano, no de correr el código y anotar lo
 * que dio: un test hecho así fija el bug en vez de encontrarlo.
 */

describe("angleDelta", () => {
  it("da el ángulo con signo entre dos rumbos", () => {
    expect(angleDelta(0, 90)).toBe(90);
    expect(angleDelta(90, 0)).toBe(-90);
  });

  it("cruza el norte por el lado corto", () => {
    // De 350 a 010 son 20° a la derecha, no 340° a la izquierda. Es el caso que
    // rompe cualquier resta ingenua.
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });

  it("resuelve el empate de 180° hacia el positivo", () => {
    // Con rumbos opuestos las dos respuestas son igual de válidas; lo que importa es
    // que no devuelva -180, que dejaría el rango abierto de los dos lados.
    expect(angleDelta(0, 180)).toBe(180);
    expect(angleDelta(180, 0)).toBe(180);
  });

  it("es cero contra sí mismo", () => {
    expect(angleDelta(123, 123)).toBe(0);
  });
});

describe("windComponents", () => {
  it("viento de frente puro: todo componente de frente", () => {
    const c = windComponents(360, 360, 20);
    expect(c.headwind).toBeCloseTo(20, 6);
    expect(c.crosswind).toBeCloseTo(0, 6);
  });

  it("viento de cola: headwind negativo", () => {
    // El signo es la convención de todo el archivo y la usa `windTriangle` para
    // sumar en vez de restar. Si se invierte, la ground speed sale al revés.
    const c = windComponents(360, 180, 20);
    expect(c.headwind).toBeCloseTo(-20, 6);
  });

  it("cruzado de la derecha es positivo, de la izquierda negativo", () => {
    expect(windComponents(360, 90, 20).crosswind).toBeCloseTo(20, 6);
    expect(windComponents(360, 270, 20).crosswind).toBeCloseTo(-20, 6);
  });

  it("a 45° reparte por la raíz de dos", () => {
    const c = windComponents(360, 45, 20);
    expect(c.headwind).toBeCloseTo(20 * Math.SQRT1_2, 6);
    expect(c.crosswind).toBeCloseTo(20 * Math.SQRT1_2, 6);
  });
});

describe("windTriangle", () => {
  it("sin viento: se vuela el curso y la ground speed es la TAS", () => {
    /*
      **Éste es el test que detecta un marco de referencia mal aplicado.** Sin viento
      no hay corrección posible, así que cualquier desvío del curso o de la TAS es
      una variación magnética metida donde no va — el riesgo que el plan 12 nombra
      como el único con consecuencia de navegación.
    */
    const t = windTriangle({ course: 275, tas: 110, windDir: 0, windSpeed: 0 });
    expect(t.wca).toBe(0);
    expect(t.heading).toBe(275);
    expect(t.groundSpeed).toBeCloseTo(110, 9);
    expect(t.impossible).toBe(false);
  });

  it("viento de frente puro: no hay corrección y la GS baja", () => {
    const t = windTriangle({ course: 360, tas: 100, windDir: 360, windSpeed: 20 });
    expect(t.wca).toBeCloseTo(0, 6);
    expect(t.groundSpeed).toBeCloseTo(80, 6);
  });

  it("viento de cola: la GS sube", () => {
    const t = windTriangle({ course: 360, tas: 100, windDir: 180, windSpeed: 20 });
    expect(t.groundSpeed).toBeCloseTo(120, 6);
  });

  it("cruzado puro de 20 kt con 100 de TAS: WCA 11,54° y GS 97,98", () => {
    // A mano: asin(20/100) = 11,5370°; GS = 100·cos(11,5370°) = 97,9796.
    const t = windTriangle({ course: 360, tas: 100, windDir: 90, windSpeed: 20 });
    expect(t.wca).toBeCloseTo(11.5370, 3);
    expect(t.heading).toBeCloseTo(11.5370, 3);
    expect(t.groundSpeed).toBeCloseTo(97.9796, 3);
    // Un cruzado puro casi no cuesta velocidad: 20 kt de costado son 2 kt de GS.
    expect(t.impossible).toBe(false);
  });

  it("es simétrico: mismo viento de un lado y del otro", () => {
    const der = windTriangle({ course: 360, tas: 100, windDir: 90, windSpeed: 20 });
    const izq = windTriangle({ course: 360, tas: 100, windDir: 270, windSpeed: 20 });
    expect(izq.wca).toBeCloseTo(-der.wca, 9);
    expect(izq.groundSpeed).toBeCloseTo(der.groundSpeed, 9);
  });

  it("el rumbo da la vuelta por el norte en vez de salir negativo", () => {
    // Curso 005 con corrección a la izquierda: 353°, no -7°.
    const t = windTriangle({ course: 5, tas: 100, windDir: 275, windSpeed: 20 });
    expect(t.heading).toBeCloseTo(353.463, 2);
  });

  it("marca imposible cuando el cruzado supera la TAS", () => {
    // Sin esto `asin` devuelve NaN y la pantalla muestra campos vacíos en lugar de
    // decir "no alcanza".
    const t = windTriangle({ course: 360, tas: 50, windDir: 90, windSpeed: 60 });
    expect(t.impossible).toBe(true);
    expect(t.groundSpeed).toBe(0);
    expect(t.heading).toBe(360);
    expect(Number.isNaN(t.wca)).toBe(false);
  });

  it("marca imposible cuando el viento de frente es más fuerte que el avión", () => {
    // El otro modo de fracaso, y no lo cubre el `asin`: la GS sale negativa, o sea
    // que se vuela para atrás.
    const t = windTriangle({ course: 360, tas: 20, windDir: 360, windSpeed: 40 });
    expect(t.impossible).toBe(true);
  });

  it("con TAS cero no divide por cero", () => {
    const t = windTriangle({ course: 90, tas: 0, windDir: 180, windSpeed: 15 });
    expect(t.groundSpeed).toBe(0);
    expect(t.heading).toBe(90);
    expect(t.wca).toBe(0);
    // No es "imposible": es que todavía no cargaste la TAS. La pantalla tiene que
    // quedarse callada, no gritar.
    expect(t.impossible).toBe(false);
  });
});

describe("computeFuel", () => {
  const base = { fuelOnBoard: 120, burnRate: 30, reserveMinutes: 45, legMinutes: 90, groundSpeed: 100 };

  it("reparte autonomía, reserva y alcance", () => {
    // A mano: 120/30 = 4 h · reserva 0,75·30 = 22,5 L · útiles (120-22,5)/30 = 3,25 h
    // · alcance 3,25·100 = 325 NM · tramo 1,5·30 + 22,5 = 67,5 L · sobra 52,5 L.
    const f = computeFuel(base);
    expect(f.enduranceHours).toBeCloseTo(4, 9);
    expect(f.reserveFuel).toBeCloseTo(22.5, 9);
    expect(f.usableHours).toBeCloseTo(3.25, 9);
    expect(f.rangeNm).toBeCloseTo(325, 9);
    expect(f.requiredForLeg).toBeCloseTo(67.5, 9);
    expect(f.remainingAfterLeg).toBeCloseTo(52.5, 9);
  });

  it("con la reserva más grande que el combustible, las horas útiles son cero y no negativas", () => {
    const f = computeFuel({ ...base, fuelOnBoard: 10, reserveMinutes: 60 });
    expect(f.reserveFuel).toBeCloseTo(30, 9);
    expect(f.usableHours).toBe(0);
    expect(f.rangeNm).toBe(0);
    // Pero el faltante del tramo **sí** tiene que verse negativo: es la respuesta a
    // "¿llego?" y cero la escondería.
    expect(f.remainingAfterLeg).toBeLessThan(0);
  });

  it("sin consumo cargado no inventa números", () => {
    const f = computeFuel({ ...base, burnRate: 0 });
    expect(f.enduranceHours).toBe(0);
    expect(f.requiredForLeg).toBe(0);
    // El combustible a bordo es un dato, no un cálculo: se devuelve tal cual.
    expect(f.remainingAfterLeg).toBe(120);
  });

  it("sin ground speed hay autonomía pero no alcance", () => {
    const f = computeFuel({ ...base, groundSpeed: 0 });
    expect(f.usableHours).toBeCloseTo(3.25, 9);
    expect(f.rangeNm).toBe(0);
  });
});

describe("computeAltitude", () => {
  it("con QNH estándar la altitud de presión es la elevación", () => {
    const a = computeAltitude({ elevationFt: 1000, qnhHpa: ISA_PRESSURE_HPA, oatC: 15 });
    expect(a.pressureAltitude).toBeCloseTo(1000, 9);
    // ISA a 1000 ft: 15 - 2 = 13 °C. Con 15 °C reales, 2 °C sobre ISA.
    expect(a.isaTemp).toBeCloseTo(13, 9);
    expect(a.isaDeviation).toBeCloseTo(2, 9);
    expect(a.densityAltitude).toBeCloseTo(1000 + 118.8 * 2, 6);
  });

  it("presión baja levanta la altitud de presión, 30 ft por hPa", () => {
    const a = computeAltitude({ elevationFt: 500, qnhHpa: ISA_PRESSURE_HPA - 10, oatC: 15 });
    expect(a.pressureAltitude).toBeCloseTo(800, 9);
  });

  it("presión alta la baja", () => {
    const a = computeAltitude({ elevationFt: 500, qnhHpa: ISA_PRESSURE_HPA + 10, oatC: 15 });
    expect(a.pressureAltitude).toBeCloseTo(200, 9);
  });

  it("un día frío da densidad por debajo de la presión", () => {
    // Es el caso que importa entender al revés: en invierno el avión rinde de más.
    const a = computeAltitude({ elevationFt: 1000, qnhHpa: ISA_PRESSURE_HPA, oatC: 0 });
    expect(a.isaDeviation).toBeCloseTo(-13, 9);
    expect(a.densityAltitude).toBeLessThan(a.pressureAltitude);
  });
});

describe("computeCloudBase", () => {
  it("400 ft por cada grado de spread", () => {
    const c = computeCloudBase({ temperatureC: 25, dewpointC: 15, elevationFt: 1000 });
    expect(c.spread).toBeCloseTo(10, 9);
    expect(c.baseAgl).toBeCloseTo(4000, 9);
    expect(c.baseMsl).toBeCloseTo(5000, 9);
    // Lapse seco de 3 °C/1000 ft hasta la condensación: 25 - 12 = 13 °C.
    expect(c.tempAtBase).toBeCloseTo(13, 9);
  });

  it("saturado: la base es el suelo, no un número negativo", () => {
    // Rocío por encima de la temperatura es niebla. Sin el `max(0)` la base daría
    // bajo tierra y el MSL quedaría por debajo del aeródromo.
    const c = computeCloudBase({ temperatureC: 10, dewpointC: 12, elevationFt: 1000 });
    expect(c.baseAgl).toBe(0);
    expect(c.baseMsl).toBe(1000);
    expect(c.tempAtBase).toBeCloseTo(10, 9);
  });
});

describe("computeGlide", () => {
  // Una altura de exactamente 1 NM en pies hace que los números se puedan seguir
  // de memoria: con relación 10 se planean 10 NM.
  const base = { heightAgl: FEET_PER_NM, glideRatio: 10, glideSpeedKt: 65, headwindKt: 0, targetNm: 0 };

  it("sin viento, la relación es la distancia", () => {
    const g = computeGlide(base);
    expect(g.glideNm).toBeCloseTo(10, 9);
    expect(g.glideWithWindNm).toBeCloseTo(10, 9);
    expect(g.lossPerNm).toBeCloseTo(FEET_PER_NM / 10, 9);
    expect(g.minutesAloft).toBeCloseTo((10 / 65) * 60, 9);
    expect(g.requiredRatio).toBeNull();
    expect(g.reachesTarget).toBeNull();
  });

  it("el viento mueve la distancia pero no el tiempo en el aire", () => {
    // El planeo desciende a la misma velocidad vertical con viento o sin él: lo que
    // cambia es cuánto suelo pasa abajo. Confundir esto es lo que hace creer que un
    // viento de cola te deja más tiempo arriba.
    const conFrente = computeGlide({ ...base, headwindKt: 15 });
    const conCola = computeGlide({ ...base, headwindKt: -15 });
    expect(conFrente.minutesAloft).toBeCloseTo(conCola.minutesAloft, 9);
    expect(conFrente.glideWithWindNm).toBeCloseTo((base.glideRatio * 50) / 65, 6);
    expect(conCola.glideWithWindNm).toBeCloseTo((base.glideRatio * 80) / 65, 6);
  });

  it("dice si el destino se alcanza y con qué relación haría falta", () => {
    const llega = computeGlide({ ...base, targetNm: 8 });
    expect(llega.reachesTarget).toBe(true);
    expect(llega.requiredRatio).toBeCloseTo(8, 9);

    const noLlega = computeGlide({ ...base, targetNm: 12 });
    expect(noLlega.reachesTarget).toBe(false);
    expect(noLlega.requiredRatio).toBeCloseTo(12, 9);
  });

  it("sin relación de planeo cargada sigue contestando qué haría falta", () => {
    // El dato que el piloto no tiene es justo el que la pregunta busca: "¿qué
    // relación necesito?" tiene respuesta aunque no sepa la del avión.
    const g = computeGlide({ ...base, glideRatio: 0, targetNm: 5 });
    expect(g.glideNm).toBe(0);
    expect(g.requiredRatio).toBeCloseTo(5, 9);
    expect(g.reachesTarget).toBe(false);
  });

  it("en el suelo no hay planeo ni relación que pedir", () => {
    const g = computeGlide({ ...base, heightAgl: 0, targetNm: 5 });
    expect(g.glideNm).toBe(0);
    expect(g.requiredRatio).toBeNull();
    expect(g.reachesTarget).toBe(false);
  });
});

describe("convertUnit", () => {
  it("distancia", () => {
    expect(convertUnit(1, "distance", "nm", "m")).toBeCloseTo(1852, 9);
    expect(convertUnit(1, "distance", "km", "m")).toBeCloseTo(1000, 9);
  });

  it("velocidad", () => {
    expect(convertUnit(100, "speed", "kt", "kmh")).toBeCloseTo(185.2, 2);
  });

  it("altitud: un nivel de vuelo son 100 ft", () => {
    expect(convertUnit(65, "altitude", "fl", "ft")).toBeCloseTo(6500, 6);
  });

  it("volumen: avgas a 0,72 kg/L", () => {
    // Se pide en litros y se pesa para la hoja de carga; por eso la unidad existe.
    expect(convertUnit(72, "volume", "kgavgas", "l")).toBeCloseTo(100, 6);
  });

  it("presión", () => {
    expect(convertUnit(29.92, "pressure", "inhg", "hpa")).toBeCloseTo(1013.2, 1);
  });

  it("temperatura, que es la excepción: tiene offset y no sólo escala", () => {
    expect(convertUnit(0, "temperature", "c", "f")).toBeCloseTo(32, 9);
    expect(convertUnit(100, "temperature", "c", "f")).toBeCloseTo(212, 9);
    expect(convertUnit(-40, "temperature", "c", "f")).toBeCloseTo(-40, 9);
    expect(convertUnit(0, "temperature", "c", "k")).toBeCloseTo(273.15, 9);
    expect(convertUnit(32, "temperature", "f", "c")).toBeCloseTo(0, 9);
    expect(convertUnit(273.15, "temperature", "k", "f")).toBeCloseTo(32, 6);
  });

  it("ida y vuelta devuelve el original", () => {
    const ida = convertUnit(123.456, "weight", "kg", "lb");
    expect(convertUnit(ida, "weight", "lb", "kg")).toBeCloseTo(123.456, 9);
  });

  it("la misma unidad no toca el valor", () => {
    expect(convertUnit(7.5, "distance", "nm", "nm")).toBe(7.5);
  });

  it("devuelve NaN ante una unidad que no existe o un valor que no es número", () => {
    expect(convertUnit(1, "distance", "nm", "parsec")).toBeNaN();
    expect(convertUnit(NaN, "distance", "nm", "km")).toBeNaN();
    expect(convertUnit(Infinity, "distance", "nm", "km")).toBeNaN();
  });
});

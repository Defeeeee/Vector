import { describe, expect, it } from "vitest";
import {
  VIENTO_ATENCION_KT,
  componentesDePista,
  mejorPista,
  pistasDesdeMadhel,
  severidadDe,
  veredictoDeRuta,
  type EstacionRuta,
  type Pista,
} from "./briefing";

/**
 * Esta lógica decide si el piloto sale o no, y hasta ahora vivía dentro de un `.tsx`
 * donde **no se podía testear** — `vitest` corre en `environment: "node"`.
 *
 * El test que da sentido a todo el archivo es el de "ninguna estación respondió": antes
 * ese caso anunciaba "Ruta 100% VFR habilitada — condiciones meteorológicas excelentes".
 */

const est = (over: Partial<EstacionRuta> = {}): EstacionRuta => ({
  icao: "SADM",
  categoria: "VFR",
  vientoKt: 5,
  notams: 0,
  respondio: true,
  ...over,
});

describe("severidadDe", () => {
  it("ordena las categorías de menos a más grave", () => {
    expect(severidadDe("VFR")).toBe(0);
    expect(severidadDe("MVFR")).toBe(1);
    expect(severidadDe("IFR")).toBe(2);
    expect(severidadDe("LIFR")).toBe(3);
  });

  it("UNK no tiene severidad: devuelve null, no cero", () => {
    /*
      **El bug entero cabe en esta línea.** En la tabla vieja `UNK` valía 0, igual que
      `VFR`, así que una estación caída puntuaba como una que reporta cielo despejado.
    */
    expect(severidadDe("UNK")).toBeNull();
    expect(severidadDe("UNK")).not.toBe(severidadDe("VFR"));
  });
});

describe("cuando no se sabe, no se afirma", () => {
  it("ninguna estación respondió: NO dice que la ruta esté bien", () => {
    // El test que motiva el archivo. Antes: "Ruta 100% VFR habilitada".
    const v = veredictoDeRuta([
      est({ icao: "SADM", categoria: "UNK", respondio: false }),
      est({ icao: "SAAJ", categoria: "UNK", respondio: false }),
    ]);
    expect(v.tono).toBe("sinDatos");
    expect(v.respondieron).toBe(0);
    expect(v.consultadas).toBe(2);
    expect(v.titulo.toLowerCase()).not.toContain("vfr habilitada");
    expect(v.detalle).toContain("no las conocemos");
  });

  it("una estación responde y otra no: avisa cuál falta, no da el OK", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM" }),
      est({ icao: "SAAJ", categoria: "UNK", respondio: false }),
    ]);
    expect(v.tono).toBe("atencion");
    expect(v.detalle).toContain("SAAJ");
    expect(v.respondieron).toBe(1);
  });

  it("responde pero sin categoría cuenta como que falta", () => {
    // `respondio: true` con `categoria: "UNK"` es un 200 sin dato útil. No alcanza.
    const v = veredictoDeRuta([est({ icao: "SADM" }), est({ icao: "SAAJ", categoria: "UNK" })]);
    expect(v.tono).toBe("atencion");
    expect(v.respondieron).toBe(1);
  });

  it("sin ruta cargada no opina", () => {
    const v = veredictoDeRuta([]);
    expect(v.tono).toBe("sinDatos");
    expect(v.consultadas).toBe(0);
  });

  it("siempre dice de cuántas estaciones habló", () => {
    for (const caso of [
      [est()],
      [est(), est({ icao: "SAAJ", categoria: "IFR" })],
      [est({ respondio: false, categoria: "UNK" })],
    ]) {
      const v = veredictoDeRuta(caso);
      expect(v.consultadas).toBe(caso.length);
      expect(v.respondieron).toBeLessThanOrEqual(v.consultadas);
    }
  });
});

describe("la precedencia de los veredictos", () => {
  it("IFR manda sobre todo lo demás", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM", vientoKt: 40, notams: 3 }),
      est({ icao: "SAAJ", categoria: "IFR" }),
    ]);
    expect(v.tono).toBe("peligro");
    expect(v.estacion).toBe("SAAJ");
  });

  it("LIFR también, y elige la peor estación", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM", categoria: "IFR" }),
      est({ icao: "SAAJ", categoria: "LIFR" }),
    ]);
    expect(v.tono).toBe("peligro");
    expect(v.estacion).toBe("SAAJ");
  });

  it("el peligro pesa más que un dato faltante", () => {
    /*
      Si una estación reporta IFR y otra no contestó, lo que hay que decir es que hay
      IFR. El dato que falta no atenúa el que sí está — pero igual se menciona.
    */
    const v = veredictoDeRuta([
      est({ icao: "SADM", categoria: "IFR" }),
      est({ icao: "SAAJ", categoria: "UNK", respondio: false }),
    ]);
    expect(v.tono).toBe("peligro");
    expect(v.detalle).toContain("SAAJ");
  });

  it("MVFR va antes que el viento", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM", vientoKt: 35 }),
      est({ icao: "SAAJ", categoria: "MVFR" }),
    ]);
    expect(v.tono).toBe("atencion");
    expect(v.titulo).toContain("MVFR");
  });

  it("el viento va antes que los NOTAMs", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM", notams: 2 }),
      est({ icao: "SAAJ", vientoKt: 25 }),
    ]);
    expect(v.titulo).toContain("Viento");
    expect(v.estacion).toBe("SAAJ");
  });

  it("elige la estación de más viento, no la primera", () => {
    const v = veredictoDeRuta([
      est({ icao: "SADM", vientoKt: 18 }),
      est({ icao: "SAAJ", vientoKt: 31 }),
    ]);
    expect(v.estacion).toBe("SAAJ");
    expect(v.detalle).toContain("31");
  });
});

describe("los umbrales", () => {
  it("15 kt justos ya son atención, 14 no", () => {
    // El límite exacto, porque un `>` en vez de un `>=` mueve el aviso un nudo entero.
    expect(veredictoDeRuta([est({ vientoKt: VIENTO_ATENCION_KT })]).tono).toBe("atencion");
    expect(veredictoDeRuta([est({ vientoKt: VIENTO_ATENCION_KT - 1 })]).tono).toBe("bien");
  });

  it("viento desconocido no dispara el aviso ni lo tapa", () => {
    const v = veredictoDeRuta([est({ vientoKt: null })]);
    expect(v.tono).toBe("bien");
  });

  it("un NOTAM alcanza para avisar", () => {
    expect(veredictoDeRuta([est({ notams: 1 })]).tono).toBe("atencion");
    expect(veredictoDeRuta([est({ notams: 0 })]).tono).toBe("bien");
  });

  it("NOTAMs desconocidos no se cuentan como cero problemas", () => {
    // `null` es "no se pudo preguntar". No dispara el aviso, pero tampoco lo silencia:
    // el veredicto sigue siendo "bien" sólo porque el resto respondió.
    const v = veredictoDeRuta([est({ notams: null })]);
    expect(v.tono).toBe("bien");
  });
});

describe("el caso bueno", () => {
  it("todo VFR y todas respondieron", () => {
    const v = veredictoDeRuta([est({ icao: "SADM" }), est({ icao: "SAAJ" })]);
    expect(v.tono).toBe("bien");
    expect(v.respondieron).toBe(2);
    expect(v.consultadas).toBe(2);
    expect(v.detalle).toContain("2 estaciones");
  });

  it("con una sola estación, la redacción es singular", () => {
    const v = veredictoDeRuta([est()]);
    expect(v.tono).toBe("bien");
    expect(v.detalle).toContain("La estación");
  });
});

/* -------------------------------------------------------------------------- */

describe("componentesDePista", () => {
  // SADM 02/20, rumbo verdadero 013 — el dato real de `runways.tsv`.
  const sadm: Pista = { le: "02", he: "20", rumboT: 13 };

  it("elige la cabecera que da viento de frente", () => {
    // Viento del norte: se opera la 02 (013T), no la 20 (193T).
    expect(componentesDePista(sadm, 10, 15)?.cabecera).toBe("02");
    // Viento del sur: al revés.
    expect(componentesDePista(sadm, 190, 15)?.cabecera).toBe("20");
  });

  it("viento alineado con la pista: todo de frente, nada cruzado", () => {
    const c = componentesDePista(sadm, 13, 20)!;
    expect(c.frenteKt).toBeCloseTo(20, 6);
    expect(c.cruzadoKt).toBeCloseTo(0, 6);
  });

  it("viento perpendicular: todo cruzado", () => {
    // 013 + 90 = 103. Entra por la derecha de quien despega por la 02.
    const c = componentesDePista(sadm, 103, 20)!;
    expect(c.cruzadoKt).toBeCloseTo(20, 6);
    expect(c.frenteKt).toBeCloseTo(0, 6);
    expect(c.desde).toBe("derecha");
  });

  it("distingue de qué lado entra", () => {
    expect(componentesDePista(sadm, 103, 20)?.desde).toBe("derecha");
    expect(componentesDePista(sadm, 283, 20)?.desde).toBe("izquierda");
  });

  it("el cruzado a 45° es la raíz de dos", () => {
    const c = componentesDePista(sadm, 13 + 45, 20)!;
    expect(c.cruzadoKt).toBeCloseTo(20 * Math.SQRT1_2, 6);
    expect(c.frenteKt).toBeCloseTo(20 * Math.SQRT1_2, 6);
  });

  it("el frente nunca es negativo: para eso se elige la cabecera", () => {
    for (let dir = 0; dir < 360; dir += 15) {
      const c = componentesDePista(sadm, dir, 12)!;
      expect(c.frenteKt).toBeGreaterThanOrEqual(0);
    }
  });

  it("con calma no hay cabecera preferida, y no se inventa una", () => {
    expect(componentesDePista(sadm, 90, 0)).toBeNull();
    expect(componentesDePista(sadm, null, 10)).toBeNull();
    expect(componentesDePista(sadm, 90, null)).toBeNull();
  });
});

describe("mejorPista", () => {
  // SAEZ tiene dos: 11/29 (102,3T) y 17/35 (164T). Datos reales del TSV.
  const saez: Pista[] = [
    { le: "11", he: "29", rumboT: 102.3 },
    { le: "17", he: "35", rumboT: 164 },
  ];

  it("elige la de menos cruzado entre varias", () => {
    // Viento del 164: alineado con la 17, perpendicular a la 11.
    const c = mejorPista(saez, 164, 18)!;
    expect(c.cabecera).toBe("17");
    expect(c.cruzadoKt).toBeCloseTo(0, 6);
  });

  it("cambia de pista cuando cambia el viento", () => {
    expect(mejorPista(saez, 102, 18)?.cabecera).toBe("11");
    expect(mejorPista(saez, 344, 18)?.cabecera).toBe("35");
  });

  it("sin pistas conocidas devuelve null, no cero", () => {
    /*
      618 de los 711 aeródromos de MADHEL no tienen pista publicada. Un cero se leería
      como "no hay cruzado", que es justo lo contrario de lo que pasa.
    */
    expect(mejorPista([], 90, 20)).toBeNull();
  });

  it("con calma también devuelve null aunque haya pistas", () => {
    expect(mejorPista(saez, 90, 0)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("pistasDesdeMadhel", () => {
  /*
    El caso que lo motivó: San Nicolás de los Arroyos (SNY) **no tiene indicador ICAO**,
    así que OurAirports no lo conoce y `runways.tsv` no lo cubre — 558 de los 711
    aeródromos de MADHEL están en esa situación. Pero la ficha de ANAC publica las dos
    pistas, y ese texto ya llegaba al briefing sin usarse.

    Las líneas son literales de la ficha real de SNY.
  */
  const SNY = [
    "18/36 1080x30 M - ASPH – AUW 23t/1 30t/2 - Limitada a aeronaves reactores y turbohélices.",
    "09/27 809x23 M - Tierra.",
  ];
  const VAR_SNY = 9.5;

  it("saca las dos pistas de la ficha de SNY", () => {
    const p = pistasDesdeMadhel(SNY, VAR_SNY);
    expect(p).toHaveLength(2);
    expect(p.map((x) => `${x.le}/${x.he}`)).toEqual(["18/36", "09/27"]);
  });

  it("convierte el designador magnético a rumbo verdadero", () => {
    // El designador es magnético: 18 son 180°M. Con 9,5° W de variación, el verdadero es
    // 180 − 9,5 = 170,5. Es la operación inversa exacta de `aMagnetico`.
    const p = pistasDesdeMadhel(SNY, VAR_SNY);
    expect(p[0].rumboT).toBeCloseTo(170.5, 6);
    expect(p[1].rumboT).toBeCloseTo(80.5, 6);
  });

  it("con variación este suma en vez de restar", () => {
    // Bariloche tiene variación negativa (este). 180 − (−5,4) = 185,4.
    expect(pistasDesdeMadhel(["18/36 1500x30 M - ASPH"], -5.4)[0].rumboT).toBeCloseTo(185.4, 6);
  });

  it("da la vuelta por el norte sin salirse del rango", () => {
    const p = pistasDesdeMadhel(["01/19 900x20 M - Tierra."], 9.5);
    expect(p[0].rumboT).toBeCloseTo(0.5, 6);
    const q = pistasDesdeMadhel(["36/18 900x20 M - Tierra."], -5);
    expect(q[0].rumboT).toBeGreaterThanOrEqual(0);
    expect(q[0].rumboT).toBeLessThan(360);
  });

  it("las marca como estimadas, no como medidas", () => {
    /*
      El designador viene redondeado a la decena y se pintó hace años, así que arrastra
      ±5° de redondeo más la deriva de la variación. Sirve, pero **no es lo mismo** que
      el rumbo verdadero publicado, y la pantalla lo dice.
    */
    for (const p of pistasDesdeMadhel(SNY, VAR_SNY)) {
      expect(p.fuente).toBe("estimada");
    }
  });

  it("saca el largo en pies de las dimensiones en metros", () => {
    // 1080 m → 3543 ft.
    expect(pistasDesdeMadhel(SNY, VAR_SNY)[0].largoFt).toBe(3543);
    expect(pistasDesdeMadhel(SNY, VAR_SNY)[1].largoFt).toBe(2654);
  });

  it("reconoce la superficie", () => {
    const p = pistasDesdeMadhel(SNY, VAR_SNY);
    expect(p[0].superficie).toBe("ASP");
    expect(p[1].superficie).toBe("TIERRA");
  });

  it("acepta sufijos de pista paralela", () => {
    const p = pistasDesdeMadhel(["01L/19R 2000x45 M - ASPH"], 10);
    expect(p[0].le).toBe("01L");
    expect(p[0].he).toBe("19R");
  });

  it("rellena a dos dígitos", () => {
    expect(pistasDesdeMadhel(["9/27 800x20 M - Tierra."], 0)[0].le).toBe("09");
  });

  it("ignora líneas que no son pistas", () => {
    const p = pistasDesdeMadhel(["Sin datos publicados.", "VER NOTAM", ""], 10);
    expect(p).toEqual([]);
  });

  it("descarta designadores imposibles", () => {
    // No existe la pista 45. Un dato así es basura, no una pista con rumbo raro.
    expect(pistasDesdeMadhel(["45/99 800x20 M"], 10)).toEqual([]);
    expect(pistasDesdeMadhel(["00/18 800x20 M"], 10)).toEqual([]);
  });

  it("sin variación magnética no estima nada", () => {
    /*
      **Es la regla de siempre.** Sin variación no se puede pasar de magnético a
      verdadero, y suponer cero sería inventar un rumbo — en Misiones son 17,8° de error,
      que con 15 kt de viento cambia el cruzado en varios nudos.
    */
    expect(pistasDesdeMadhel(SNY, undefined)).toEqual([]);
  });

  it("sin líneas devuelve vacío y no rompe", () => {
    expect(pistasDesdeMadhel([], 10)).toEqual([]);
    expect(pistasDesdeMadhel(undefined as never, 10)).toEqual([]);
  });

  it("las pistas estimadas sirven para calcular el cruzado", () => {
    // La cadena completa: texto de MADHEL → pistas → componentes.
    const p = pistasDesdeMadhel(SNY, VAR_SNY);
    // Viento perpendicular a la 18 (170,5T): 170,5 + 90 = 260,5.
    const c = mejorPista(p, 260.5, 20);
    expect(c).not.toBeNull();
    // Con dos pistas casi perpendiculares entre sí, la 09/27 queda casi alineada con
    // ese viento, así que es la que menos cruzado tiene: por eso `mejorPista` la elige.
    expect(c!.cruzadoKt).toBeLessThan(20);
  });
});

describe("un METAR viejo no cuenta como estación que informó", () => {
  /*
    La regla que impide que la PWA reintroduzca el peor bug de la app por otra puerta.
    Antes de guardar respuestas en el teléfono, un METAR tenía como mucho cinco minutos;
    con un service worker puede tener horas y renderizarse idéntico.

    Se prueba con el METAR crudo y no con un campo aparte porque **el METAR se autofecha**:
    el grupo `DDHHMMZ` viaja adentro del texto, así que una respuesta guardada sigue
    sabiendo su edad sin que nadie tenga que anotarla.
  */
  const AHORA = new Date("2026-08-21T14:30:00Z");
  const estacion = (grupo: string) => ({
    icao: "SADM",
    categoria: "VFR" as const,
    vientoKt: 5,
    notams: 0,
    respondio: true,
    metar: `METAR SADM ${grupo} 19007KT CAVOK 13/06 Q1012`,
  });

  it("un METAR reciente da el verde de siempre", () => {
    const v = veredictoDeRuta([estacion("211400Z")], AHORA);
    expect(v.tono).toBe("bien");
    expect(v.respondieron).toBe(1);
  });

  it("**uno de cuatro horas no**: la ruta queda sin datos, no en verde", () => {
    const v = veredictoDeRuta([estacion("211030Z")], AHORA);
    expect(v.tono).toBe("sinDatos");
    expect(v.respondieron).toBe(0);
    expect(v.detalle).toContain("no las conocemos");
  });

  it("con una vieja y una fresca, el conteo lo dice", () => {
    // Es la misma disciplina de "respondieron de consultadas": el veredicto sabe de
    // cuántas habló y lo muestra siempre.
    const v = veredictoDeRuta([estacion("211400Z"), estacion("211030Z")], AHORA);
    expect(v.consultadas).toBe(2);
    expect(v.respondieron).toBe(1);
    expect(v.tono).toBe("atencion");
  });

  it("una estación que no dice cuándo observó se cuenta como antes", () => {
    /*
      Ausencia del dato es "el llamador no nos lo pasó", no "es viejo". Inventar
      vencimientos donde no hay información sería el error simétrico, y dejaría sin
      veredicto a media app de un día para el otro.
    */
    const v = veredictoDeRuta(
      [{ icao: "SADM", categoria: "VFR", vientoKt: 5, notams: 0, respondio: true }],
      AHORA
    );
    expect(v.tono).toBe("bien");
    expect(v.respondieron).toBe(1);
  });
});

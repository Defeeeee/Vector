import { describe, expect, it } from "vitest";
import {
  FRESCO_MIN,
  INSERVIBLE_MIN,
  frescura,
  horaDeObservacion,
  sirveParaDecidir,
} from "./frescura";

/**
 * La antigüedad del dato meteorológico.
 *
 * Este archivo existe por el peor bug de la historia de la app: cuando se caía la
 * meteorología para toda la ruta, la pantalla anunciaba *"Ruta 100% VFR habilitada"*.
 * Se arregló contando estaciones, pero eso responde *"¿pudimos preguntar?"*, no *"¿de
 * cuándo es esto?"* — y con un service worker guardando respuestas, la segunda pregunta
 * pasa a ser la peligrosa.
 */

const AHORA = new Date("2026-08-21T14:30:00Z");
const metar = (grupo: string) => `METAR SADM ${grupo} 19007KT CAVOK 13/06 Q1012`;

describe("horaDeObservacion", () => {
  it("lee el grupo DDHHMMZ que el METAR trae adentro", () => {
    expect(horaDeObservacion(null, metar("211400Z"), AHORA)?.toISOString()).toBe(
      "2026-08-21T14:00:00.000Z"
    );
  });

  it("acepta el METAR sin el prefijo, y con COR o AUTO adelante", () => {
    expect(horaDeObservacion(null, "SADM 211400Z AUTO 19007KT", AHORA)?.toISOString()).toBe(
      "2026-08-21T14:00:00.000Z"
    );
    expect(horaDeObservacion(null, "METAR COR SADM 211400Z 19007KT", AHORA)?.toISOString()).toBe(
      "2026-08-21T14:00:00.000Z"
    );
  });

  it("**el grupo del METAR le gana al campo del proveedor**", () => {
    /*
      Son dos fuentes independientes y gana la que el piloto puede verificar: el grupo
      está escrito en el texto que tiene en pantalla y lo puede contrastar contra su
      reloj. Un cartel que dijera "hace 10 min" al lado de un texto que dice `211200Z`
      cuando son las 14:30Z sería peor que no decir nada.
    */
    const delProveedor = Math.floor(new Date("2026-08-21T14:25:00Z").getTime() / 1000);
    expect(horaDeObservacion(delProveedor, metar("211200Z"), AHORA)?.toISOString()).toBe(
      "2026-08-21T12:00:00.000Z"
    );
  });

  it("sin grupo usa el campo del proveedor, en ISO o en epoch", () => {
    expect(horaDeObservacion("2026-08-21T14:00:00Z", "sin grupo", AHORA)?.toISOString()).toBe(
      "2026-08-21T14:00:00.000Z"
    );
    const epoch = Math.floor(new Date("2026-08-21T14:00:00Z").getTime() / 1000);
    expect(horaDeObservacion(epoch, "sin grupo", AHORA)?.toISOString()).toBe(
      "2026-08-21T14:00:00.000Z"
    );
  });

  it("**el epoch en segundos no se lee como milisegundos**", () => {
    /*
      `aviationweather.gov` manda `obsTime` en segundos. Pasárselo a `new Date()` sin
      multiplicar da enero de 1970 — "hace 56 años" si sale bien, y algo peor si alguien
      lo compara mal y lo da por fresco.
    */
    const segundos = 1787263200; // 2026-08-20T22:00:00Z
    const leido = horaDeObservacion(segundos, null, new Date("2026-08-20T22:10:00Z"));
    expect(leido?.getUTCFullYear()).toBe(2026);
    expect(leido?.toISOString()).toBe("2026-08-20T22:00:00.000Z");
  });

  it("**el cruce de fin de mes**: un METAR del 31 leído el 1º es del mes pasado", () => {
    /*
      El grupo trae día pero no mes. Sin resolverlo contra el ahora, un METAR del 31 de
      julio leído el 1º de agosto se interpretaría como del 31 de agosto — treinta días
      en el futuro, o sea "recién".
    */
    const primeroDeAgosto = new Date("2026-08-01T01:00:00Z");
    expect(horaDeObservacion(null, metar("312300Z"), primeroDeAgosto)?.toISOString()).toBe(
      "2026-07-31T23:00:00.000Z"
    );
  });

  it("**un día que no existe en el mes anterior no se inventa**", () => {
    /*
      `Date.UTC(2026, 1, 31)` no falla: desborda al 3 de marzo. Y ese desborde es
      peligroso justo cuando cae en el pasado, porque entonces parece un candidato
      válido: leído el 30 de marzo, un grupo `312300Z` daría "3 de marzo 23:00" —
      veintisiete días de antigüedad presentados como una fecha cualquiera.

      El del 1º de marzo cubre el caso benigno; el del 30 es el que de verdad ejercita
      la comprobación.
    */
    expect(horaDeObservacion(null, metar("312300Z"), new Date("2026-03-01T01:00:00Z"))).toBeNull();
    expect(horaDeObservacion(null, metar("312300Z"), new Date("2026-03-30T12:00:00Z"))).toBeNull();
  });

  it("sin ninguna de las dos fuentes devuelve null, **no una fecha optimista**", () => {
    expect(horaDeObservacion(null, null, AHORA)).toBeNull();
    expect(horaDeObservacion(undefined, "No disponible", AHORA)).toBeNull();
    expect(horaDeObservacion("", "", AHORA)).toBeNull();
    expect(horaDeObservacion("no es una fecha", null, AHORA)).toBeNull();
  });

  it("un grupo con horas o minutos imposibles se descarta", () => {
    expect(horaDeObservacion(null, metar("219900Z"), AHORA)).toBeNull();
    expect(horaDeObservacion(null, metar("001400Z"), AHORA)).toBeNull();
  });
});

describe("frescura", () => {
  const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60000);

  it("dice cuánto hace, en castellano y sin hacer dividir", () => {
    expect(frescura(hace(0), AHORA)?.texto).toBe("recién");
    expect(frescura(hace(12), AHORA)?.texto).toBe("hace 12 min");
    expect(frescura(hace(60), AHORA)?.texto).toBe("hace 1 h");
    expect(frescura(hace(130), AHORA)?.texto).toBe("hace 2 h 10");
  });

  it("los tres niveles, y sus bordes exactos", () => {
    // Un METAR se emite cada hora: hasta 75 minutos lo normal es que no haya nada mejor.
    expect(frescura(hace(FRESCO_MIN), AHORA)?.nivel).toBe("fresco");
    expect(frescura(hace(FRESCO_MIN + 1), AHORA)?.nivel).toBe("viejo");
    expect(frescura(hace(INSERVIBLE_MIN - 1), AHORA)?.nivel).toBe("viejo");
    expect(frescura(hace(INSERVIBLE_MIN), AHORA)?.nivel).toBe("inservible");
  });

  it("un dato del futuro es un reloj desfasado, no un dato mejor", () => {
    // Mostrar "hace -8 min" no significa nada. Se trata como recién observado.
    const f = frescura(new Date(AHORA.getTime() + 8 * 60000), AHORA);
    expect(f?.minutos).toBe(0);
    expect(f?.texto).toBe("recién");
  });

  it("sin fecha no hay frescura: null, no un cero", () => {
    expect(frescura(null, AHORA)).toBeNull();
  });
});

describe("sirveParaDecidir", () => {
  const hace = (minutos: number) => frescura(new Date(AHORA.getTime() - minutos * 60000), AHORA);

  it("**la regla dura: un METAR viejo se muestra, pero no alimenta un veredicto**", () => {
    /*
      El briefing de ruta decide si puede opinar contando cuántas estaciones
      contestaron. Darle un dato de hace cuatro horas le haría producir un verde
      tranquilizador a partir de nada — que es peor que el "no sabemos" que produce hoy,
      y es literalmente el bug de 2026 con otro disfraz.
    */
    expect(sirveParaDecidir(hace(10))).toBe(true);
    expect(sirveParaDecidir(hace(90))).toBe(true);
    expect(sirveParaDecidir(hace(INSERVIBLE_MIN))).toBe(false);
    expect(sirveParaDecidir(hace(240))).toBe(false);
  });

  it("sin fecha tampoco sirve", () => {
    // No saber cuándo se observó es no saber si describe el cielo de ahora.
    expect(sirveParaDecidir(null)).toBe(false);
  });
});

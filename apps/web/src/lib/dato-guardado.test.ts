import { describe, expect, it } from "vitest";
import { armarEstacion } from "./briefing-pdf-datos";
import { veredictoDeRuta } from "./briefing";
import { MAX_GUARDADO_MIN, franjaDeGuardado, guardadoMostrable, haceTexto, horaUtcCorta, origenGuardado } from "./dato-guardado";
import { horaDeObservacion } from "./frescura";

/**
 * "Mostrar el METAR viejo sin señal, con su antigüedad" (3.46.0): lo que se le dice al piloto tiene
 * que ser exacto, y un dato guardado nunca puede opinar en un veredicto.
 */

const ahora = new Date("2026-11-17T18:00:00Z"); // 15:00 en Argentina

describe("haceTexto", () => {
  it("minutos enteros, sin decimales y sin 'hace -3'", () => {
    expect(haceTexto(0)).toBe("hace menos de 1 min");
    expect(haceTexto(-5)).toBe("hace menos de 1 min");
    expect(haceTexto(25.9)).toBe("hace 25 min");
    expect(haceTexto(60)).toBe("hace 1 h");
    expect(haceTexto(220)).toBe("hace 3 h 40 min");
    expect(haceTexto(30 * 60 + 5)).toBe("hace 30 h 5 min");
  });
});

describe("la edad del METAR sale de su grupo DDHHMMZ", () => {
  it("METAR de las 14:20Z, a las 18:00Z: 11:20 argentinas, hace 3 h 40 min", () => {
    const observado = horaDeObservacion(null, "METAR SADM 171420Z 19007KT 9999 SCT030 25/14 Q1012", ahora);
    expect(franjaDeGuardado({ dato: "metar", observadoEn: observado, capturadoEn: "2026-11-17T14:30:00Z", ahoraMs: ahora.getTime() })).toBe(
      "SIN SEÑAL · METAR observado a las 11:20 (hace 3 h 40 min): no sirve para decidir el vuelo",
    );
  });

  it("con el cambio de mes: un METAR del 30 leído el 1º no es del mes que viene", () => {
    const hoy = new Date("2026-12-01T05:00:00Z"); // 02:00 del 1º en Argentina
    const observado = horaDeObservacion(null, "METAR SAEZ 302350Z 00000KT CAVOK 22/12 Q1015", hoy);
    expect(observado?.toISOString()).toBe("2026-11-30T23:50:00.000Z");
    expect(franjaDeGuardado({ dato: "metar", observadoEn: observado, ahoraMs: hoy.getTime() })).toBe(
      "SIN SEÑAL · METAR observado el 30/11 a las 20:50 (hace 5 h 10 min): no sirve para decidir el vuelo",
    );
  });

  it("de otro día lleva el día; en UTC (el papel), también", () => {
    const observado = new Date("2026-11-16T22:05:00Z");
    expect(franjaDeGuardado({ dato: "metar", observadoEn: observado, ahoraMs: ahora.getTime() })).toContain("observado el 16/11 a las 19:05 (hace 19 h 55 min)");
    expect(franjaDeGuardado({ dato: "metar", observadoEn: observado, ahoraMs: ahora.getTime(), zona: "utc" })).toContain(
      "observado el 16/11 a las 22:05 UTC (hace 19 h 55 min)",
    );
    expect(horaUtcCorta("2026-11-17T14:20:00Z", ahora.getTime())).toBe("14:20 UTC");
  });
});

describe("la franja, según qué dato sea", () => {
  const base = { ahoraMs: ahora.getTime(), capturadoEn: "2026-11-17T15:00:00Z" };

  it("un METAR sin hora de observación usa la de la descarga y lo dice", () => {
    expect(franjaDeGuardado({ dato: "metar", ...base })).toBe(
      "SIN SEÑAL · METAR guardado a las 12:00 (hace 3 h), sin saber cuándo se observó: no sirve para decidir el vuelo",
    );
  });

  it("NOTAM, TAF y viento hablan de lo guardado, no de lo observado", () => {
    expect(franjaDeGuardado({ dato: "notam", ...base })).toBe("SIN SEÑAL · NOTAM guardados a las 12:00 (hace 3 h): pueden haber cambiado: revisalos antes de volar");
    expect(franjaDeGuardado({ dato: "taf", ...base })).toContain("TAF guardado a las 12:00");
    expect(franjaDeGuardado({ dato: "viento", ...base })).toContain("Viento en altura guardado a las 12:00");
  });

  it("si ANAC no contestó (hay red) no dice SIN SEÑAL", () => {
    expect(franjaDeGuardado({ dato: "notam", ...base, causa: "sin-anac" }).startsWith("ANAC NO CONTESTÓ · NOTAM guardados")).toBe(true);
  });

  it("**sin ninguna fecha no inventa una hora**", () => {
    expect(franjaDeGuardado({ dato: "metar", ahoraMs: ahora.getTime() })).toBe("SIN SEÑAL · METAR guardado, sin saber de cuándo es: no sirve para decidir el vuelo");
    expect(franjaDeGuardado({ dato: "notam", capturadoEn: "no es una fecha", ahoraMs: ahora.getTime() })).toContain("NOTAM guardados, sin saber de cuándo son");
  });
});

describe("el tope de 48 h", () => {
  it("se muestra hasta 48 h, y sin fecha de captura no", () => {
    expect(MAX_GUARDADO_MIN).toBe(2880);
    const t = (horas: number) => new Date(ahora.getTime() - horas * 3600_000).toISOString();
    expect(guardadoMostrable(t(47.9), ahora.getTime())).toBe(true);
    expect(guardadoMostrable(t(48), ahora.getTime())).toBe(true);
    expect(guardadoMostrable(t(48.1), ahora.getTime())).toBe(false);
    expect(guardadoMostrable(null, ahora.getTime())).toBe(false);
    expect(guardadoMostrable("cualquier cosa", ahora.getTime())).toBe(false);
  });
});

describe("la cabecera del service worker", () => {
  it("sólo `guardado` cuenta; sin cabecera, es la red", () => {
    expect(origenGuardado(new Headers())).toBeNull();
    expect(origenGuardado(new Headers({ "X-Vector-Origen": "paquete-local" }))).toBeNull();
    expect(origenGuardado(new Headers({ "X-Vector-Origen": "guardado", "X-Vector-Capturado-En": "2026-11-17T15:00:00Z" }))).toEqual({
      capturadoEn: "2026-11-17T15:00:00Z",
    });
    expect(origenGuardado(new Headers({ "X-Vector-Origen": "guardado" }))).toEqual({ capturadoEn: null });
  });
});

describe("un dato guardado no opina", () => {
  it("una estación VFR **guardada** no cuenta: la ruta queda sin datos", () => {
    const estacion = { icao: "SADM", categoria: "VFR" as const, vientoKt: 5, notams: 0, respondio: true, metar: null };
    expect(veredictoDeRuta([estacion], ahora).tono).toBe("bien");
    const v = veredictoDeRuta([{ ...estacion, desdeGuardado: true }], ahora);
    expect(v.tono).toBe("sinDatos");
    expect(v.respondieron).toBe(0);
  });
});

describe("el briefing en PDF dice lo mismo", () => {
  const e = {
    codigo: "SADM",
    nombre: "Morón",
    climaRespondio: true,
    metar: "METAR SADM 171420Z 19007KT 9999 SCT030 25/14 Q1012",
    taf: null,
    observadoEn: null,
    estacionCercana: null,
    notams: [],
    notamsCapturadosEn: "2026-11-17T09:00:00Z",
    notamsFuente: "navegador" as const,
  };

  it("METAR y NOTAM guardados llevan la franja, en UTC, y la fecha de abajo no dice 'consultados'", () => {
    const b = armarEstacion({ ...e, climaGuardado: { capturadoEn: "2026-11-17T14:30:00Z" }, notamsGuardados: "sin-senal" }, ahora);
    expect(b.avisos).toContain("SIN SEÑAL - METAR observado a las 14:20 UTC (hace 3 h 40 min): no sirve para decidir el vuelo");
    expect(b.avisos.some((a) => a.startsWith("SIN SEÑAL - NOTAM guardados a las 09:00 UTC (hace 9 h)"))).toBe(true);
    expect(b.fechaClima).toContain("GUARDADOS");
    expect(b.notaNotams).toContain("de lo guardado");
  });

  it("con red, nada cambia", () => {
    const b = armarEstacion(e, ahora);
    expect(b.avisos.some((a) => a.includes("SIN SEÑAL"))).toBe(false);
    expect(b.fechaClima).toContain("consultados");
  });
});

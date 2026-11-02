import { describe, expect, it } from "vitest";
import {
  aerodromosDelChip,
  fechaCompleta,
  fechaDeVuelo,
  fechaRelativa,
  iniciales,
  mensajeDeErrorApi,
  rutaLegible,
} from "./social";

describe("mensajeDeErrorApi", () => {
  it("usa el detail de un error propio del backend", () => {
    expect(mensajeDeErrorApi({ detail: "Ese @ ya lo tiene otro piloto.", extra: null }, "x")).toBe(
      "Ese @ ya lo tiene otro piloto."
    );
  });

  it("en un 400 de validación saca el motivo de extra, sin el prefijo de Pydantic", () => {
    const cuerpo = {
      detail: "Validation failed for PUT /api/perfil-publico",
      extra: [{ message: "Value error, El @ tiene que tener al menos 3 caracteres.", key: "handle", source: "body" }],
    };
    expect(mensajeDeErrorApi(cuerpo, "x")).toBe("El @ tiene que tener al menos 3 caracteres.");
  });

  it("no muestra el detail genérico de validación si no hay motivo", () => {
    expect(mensajeDeErrorApi({ detail: "Validation failed for PUT /api/x", extra: [] }, "No se pudo guardar.")).toBe(
      "No se pudo guardar."
    );
  });

  it("cae al texto por defecto con cualquier otra cosa", () => {
    expect(mensajeDeErrorApi(null, "No se pudo.")).toBe("No se pudo.");
    expect(mensajeDeErrorApi("texto", "No se pudo.")).toBe("No se pudo.");
    expect(mensajeDeErrorApi({}, "No se pudo.")).toBe("No se pudo.");
  });
});

describe("iniciales", () => {
  it("toma la primera y la última palabra", () => {
    expect(iniciales("Federico Díaz Nemeth")).toBe("FN");
    expect(iniciales("lucía")).toBe("L");
    expect(iniciales("   ")).toBe("?");
  });
});

describe("fechaRelativa", () => {
  // 22 sep 2026, 15:00 en Buenos Aires.
  const ahora = new Date("2026-09-22T18:00:00Z");

  it("dice recién, minutos y horas en el mismo día", () => {
    expect(fechaRelativa("2026-09-22T17:59:30Z", ahora)).toBe("recién");
    expect(fechaRelativa("2026-09-22T17:55:00Z", ahora)).toBe("hace 5 min");
    expect(fechaRelativa("2026-09-22T15:00:00Z", ahora)).toBe("hace 3 h");
  });

  it("una fecha del futuro, por relojes desparejos, es recién", () => {
    expect(fechaRelativa("2026-09-22T18:00:40Z", ahora)).toBe("recién");
  });

  it("cuenta horas hasta las 24 aunque haya cambiado el día", () => {
    // 22 h del 21 en Buenos Aires, mirado a la 1 del 22.
    expect(fechaRelativa("2026-09-22T01:00:00Z", new Date("2026-09-22T04:00:00Z"))).toBe("hace 3 h");
  });

  it("después de 24 h cuenta el calendario de Argentina, no el de UTC", () => {
    // 21 sep 10:00 en Buenos Aires → ayer.
    expect(fechaRelativa("2026-09-21T13:00:00Z", ahora)).toBe("ayer");
    // 20 sep 23:30 en Buenos Aires (en UTC ya es 21): son dos días de calendario.
    expect(fechaRelativa("2026-09-21T02:30:00Z", ahora)).toBe("hace 2 días");
    expect(fechaRelativa("2026-09-17T12:00:00Z", ahora)).toBe("hace 5 días");
  });

  it("de una semana para atrás muestra el día, y el año sólo si no es este", () => {
    expect(fechaRelativa("2026-09-12T12:00:00Z", ahora)).toBe("12 sep");
    expect(fechaRelativa("2025-12-31T12:00:00Z", ahora)).toBe("31 dic 2025");
  });

  it("el día es el de Argentina aunque en UTC ya sea el siguiente", () => {
    // 1 sep 01:30 UTC = 31 ago 22:30 en Buenos Aires.
    expect(fechaRelativa("2026-09-01T01:30:00Z", ahora)).toBe("31 ago");
  });

  it("una fecha ilegible no se inventa", () => {
    expect(fechaRelativa("mañana", ahora)).toBe("");
  });
});

describe("fechaCompleta", () => {
  it("da día, mes, año y hora en Buenos Aires", () => {
    expect(fechaCompleta("2026-09-22T17:05:00.123456+00:00")).toBe("22 sep 2026, 14:05");
    expect(fechaCompleta("2026-01-01T02:00:00Z")).toBe("31 dic 2025, 23:00");
    expect(fechaCompleta("")).toBe("");
  });
});

describe("fechaDeVuelo", () => {
  it("lee el día tal como viene, sin zona horaria", () => {
    expect(fechaDeVuelo("2026-09-01")).toBe("1 sep 2026");
    expect(fechaDeVuelo("2026-12-31T00:00:00")).toBe("31 dic 2026");
  });

  it("lo que no es una fecha pasa igual, y vacío es null", () => {
    expect(fechaDeVuelo("ayer")).toBe("ayer");
    expect(fechaDeVuelo(null)).toBeNull();
  });
});

describe("rutaLegible", () => {
  // Los mismos casos que `ruta_legible` del backend: si difieren, la vista previa del
  // composer promete una cosa y se publica otra.
  it("deja el primero y el último", () => {
    expect(rutaLegible("SADF SAAR")).toBe("SADF → SAAR");
    expect(rutaLegible("sadf-saaj-sazn")).toBe("SADF → SAZN");
    expect(rutaLegible("SADF, SADL")).toBe("SADF → SADL");
  });

  it("un vuelo que sale y vuelve al mismo campo es local", () => {
    expect(rutaLegible("SADF")).toBe("SADF · local");
    expect(rutaLegible("SADF SADF")).toBe("SADF · local");
    expect(rutaLegible("SADF LOCAL")).toBe("SADF · local");
  });

  it("sin aeródromos no hay ruta", () => {
    expect(rutaLegible("SIM")).toBeNull();
    expect(rutaLegible("")).toBeNull();
    expect(rutaLegible(null)).toBeNull();
  });
});

describe("aerodromosDelChip", () => {
  it("lee el formato de rutaLegible", () => {
    expect(aerodromosDelChip("SADF → SAAR")).toEqual(["SADF", "SAAR"]);
    expect(aerodromosDelChip("SADF · local")).toEqual(["SADF"]);
    expect(aerodromosDelChip(rutaLegible("SADF SAAJ SAZN"))).toEqual(["SADF", "SAZN"]);
  });

  it("descarta lo que no es un código", () => {
    expect(aerodromosDelChip("→ ?? · local")).toEqual([]);
    expect(aerodromosDelChip(null)).toEqual([]);
  });
});

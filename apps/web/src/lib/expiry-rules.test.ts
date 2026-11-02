import { describe, expect, it } from "vitest";
import type { PilotDocument } from "@/types";
import {
  ayudaAncla,
  ayudaRegla,
  descripcionRegla,
  modoDe,
  sumarOffset,
  vencimientoDerivado,
} from "./expiry-rules";

const doc = (over: Partial<PilotDocument> = {}): PilotDocument =>
  ({
    id: "d1",
    user_id: "u",
    kind: "otro",
    blocking: "nada",
    name: "Autorización del instructor",
    expiry_date: null,
    expiry_rule: "fijo",
    alert_days: [],
    created_at: "",
    updated_at: "",
    ...over,
  }) as PilotDocument;

describe("vencimientoDerivado", () => {
  it("suma los días al último vuelo", () => {
    expect(vencimientoDerivado("2026-08-01", 60)).toBe("2026-09-30");
  });

  /**
   * Sin ancla no hay fecha, y `null` significa "no vence" desde la migración 007.
   * Una cuenta que arranca con el último vuelo, sin ningún vuelo, no arrancó.
   */
  it("sin último vuelo devuelve null", () => {
    expect(vencimientoDerivado(null, 60)).toBe(null);
    expect(vencimientoDerivado(undefined, 60)).toBe(null);
  });

  it("sin offset no inventa una fecha", () => {
    expect(vencimientoDerivado("2026-08-01", null)).toBe(null);
    expect(vencimientoDerivado("2026-08-01", 0)).toBe(null);
  });

  /**
   * `sumarDias` trabaja en UTC a propósito. Con un `Date` local, el 1 de agosto a
   * las 00:00 en Argentina es el 31 de julio en UTC y la cuenta se corre un día.
   */
  it("cruza el fin de año y el bisiesto sin correrse un día", () => {
    expect(vencimientoDerivado("2023-12-20", 90)).toBe("2024-03-19");
    expect(vencimientoDerivado("2024-02-28", 1)).toBe("2024-02-29");
  });

  /** El backend manda `expiry_date` como "YYYY-MM-DD", pero un timestamp no debería romper. */
  it("tolera un ISO con hora", () => {
    expect(vencimientoDerivado("2026-08-01T12:00:00Z", 1)).toBe("2026-08-02");
  });
});

describe("modoDe", () => {
  it("una regla derivada es su propio modo", () => {
    expect(modoDe(doc({ expiry_rule: "ultimo_vuelo", expiry_offset_days: 60 }))).toBe("ultimo_vuelo");
  });

  it("con fecha y sin regla es fecha fija", () => {
    expect(modoDe(doc({ expiry_date: "2027-01-01" }))).toBe("fecha");
  });

  it("sin fecha y sin regla es no vence", () => {
    expect(modoDe(doc())).toBe("no_vence");
  });

  /** Un documento nuevo arranca pidiendo una fecha, que es el caso normal. */
  it("sin documento arranca en fecha", () => {
    expect(modoDe(undefined)).toBe("fecha");
  });

  /**
   * Un backend sin la migración 011 no manda `expiry_rule`. Ausente tiene que
   * leerse como 'fijo', que es lo que eran todas las filas antes.
   */
  it("sin expiry_rule se comporta como fijo", () => {
    const viejo = { ...doc({ expiry_date: "2027-01-01" }) } as Partial<PilotDocument>;
    delete viejo.expiry_rule;
    expect(modoDe(viejo as PilotDocument)).toBe("fecha");
  });
});

describe("descripcionRegla", () => {
  it("describe la regla derivada", () => {
    expect(descripcionRegla(doc({ expiry_rule: "ultimo_vuelo", expiry_offset_days: 60 })))
      .toBe("60 días después de tu último vuelo");
  });

  it("no pluraliza un solo día", () => {
    expect(descripcionRegla(doc({ expiry_rule: "ultimo_vuelo", expiry_offset_days: 1 })))
      .toBe("1 día después de tu último vuelo");
  });

  /** Un vencimiento fijo es la fecha y nada más: una leyenda ahí es ruido. */
  it("no dice nada de un vencimiento fijo", () => {
    expect(descripcionRegla(doc({ expiry_date: "2027-01-01" }))).toBe(null);
  });

  it("no dice nada de una regla sin offset", () => {
    expect(descripcionRegla(doc({ expiry_rule: "ultimo_vuelo" }))).toBe(null);
  });
});

describe("ayudaRegla", () => {
  it("dice que volar corre la fecha hacia adelante", () => {
    const texto = ayudaRegla(60, "2026-08-01");
    expect(texto).toContain("2026-09-30");
    expect(texto).toMatch(/corre hacia adelante/);
  });

  it("sin vuelos explica que la cuenta no empezó", () => {
    expect(ayudaRegla(60, null)).toMatch(/no empezó/);
  });
});

/**
 * Meses, que no son 30 días.
 *
 * El repaso de 61.135 son 24 meses calendario. Resolverlo con 730 días se corre uno
 * o dos según los bisiestos y los meses de 31, y en un vencimiento regulatorio esos
 * dos días son poder volar o no. Esta aritmética está duplicada en
 * `derived_expiries.sumar_offset` del backend: si una cambia, la otra también.
 */
describe("sumarOffset", () => {
  it("24 meses caen el mismo día, dos años después", () => {
    expect(sumarOffset("2026-03-15", 24, "meses")).toBe("2028-03-15");
  });

  /** El caso que rompe una implementación ingenua: no existe el 31 de febrero. */
  it("satura al último día del mes destino", () => {
    expect(sumarOffset("2026-01-31", 1, "meses")).toBe("2026-02-28");
    expect(sumarOffset("2024-01-31", 1, "meses")).toBe("2024-02-29");
  });

  it("un 29 de febrero cae en el 28 del año no bisiesto", () => {
    expect(sumarOffset("2024-02-29", 12, "meses")).toBe("2025-02-28");
  });

  /** El módulo tiene que cruzar diciembre sin dar mes 13 ni mes 0. */
  it("cruza el fin de año", () => {
    expect(sumarOffset("2026-12-15", 1, "meses")).toBe("2027-01-15");
    expect(sumarOffset("2026-12-15", 13, "meses")).toBe("2028-01-15");
  });

  it("en días delega en sumarDias", () => {
    expect(sumarOffset("2026-08-01", 60, "dias")).toBe("2026-09-30");
  });

  /**
   * Espejo exacto del backend. Si estos dos dejaran de coincidir, el formulario
   * mostraría una fecha antes de guardar y la base guardaría otra.
   */
  it("coincide con lo que calcula el backend", () => {
    expect(sumarOffset("2026-03-15", 24, "meses")).toBe("2028-03-15");
    expect(sumarOffset("2026-01-31", 1, "meses")).toBe("2026-02-28");
    expect(sumarOffset("2024-02-29", 12, "meses")).toBe("2025-02-28");
    expect(sumarOffset("2026-12-15", 1, "meses")).toBe("2027-01-15");
  });
});

describe("vencimiento anclado a un vuelo puntual", () => {
  const anclado = (over = {}) =>
    doc({
      expiry_rule: "vuelo_ancla",
      expiry_offset_days: 24,
      expiry_offset_unit: "meses",
      expiry_anchor_flight_id: "f1",
      ...over,
    });

  it("es su propio modo", () => {
    expect(modoDe(anclado())).toBe("vuelo_ancla");
  });

  it("la descripción nombra el vuelo cuando sabemos su fecha", () => {
    expect(descripcionRegla(anclado(), "2026-03-15"))
      .toBe("24 meses desde tu vuelo del 2026-03-15");
  });

  /**
   * Sin la fecha del ancla no se puede afirmar cuál vuelo es. Decir "desde un vuelo
   * que elegiste" es peor que decir la fecha, pero es lo único cierto.
   */
  it("sin la fecha del ancla no inventa cuál vuelo era", () => {
    expect(descripcionRegla(anclado(), null)).toBe("24 meses desde un vuelo que elegiste");
  });

  it("pluraliza el mes solo", () => {
    expect(descripcionRegla(anclado({ expiry_offset_days: 1 }), "2026-03-15"))
      .toBe("1 mes desde tu vuelo del 2026-03-15");
  });

  it("calcula la fecha en meses", () => {
    expect(vencimientoDerivado("2026-03-15", 24, "meses")).toBe("2028-03-15");
  });
});

/**
 * Los dos textos de ayuda dicen lo contrario a propósito, y es la única diferencia
 * visible entre los dos modos una vez guardados.
 */
describe("ayudaAncla", () => {
  it("dice que volar NO mueve la fecha", () => {
    const texto = ayudaAncla(24, "2026-03-15", "meses");
    expect(texto).toContain("2028-03-15");
    expect(texto).toMatch(/no lo mueve/i);
  });

  it("y ayudaRegla dice lo contrario", () => {
    expect(ayudaRegla(60, "2026-08-01")).toMatch(/corre hacia adelante/);
  });

  it("sin vuelo elegido pide que se elija", () => {
    expect(ayudaAncla(24, null, "meses")).toMatch(/Elegí desde qué vuelo/);
  });
});

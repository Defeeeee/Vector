import { describe, expect, it } from "vitest";
import { Aircraft, Flight } from "@/types";
import {
  RECENCY_DAYS_GENERAL,
  RECENCY_DAYS_PRIVATE,
  nightRecency,
  recencyByClass,
  recencyWindowDays,
} from "./recency";

/**
 * Los números de estos tests salen de la RAAC 61 Edición VI, secciones 61.140(a)
 * y (b). No son convenciones nuestras: si alguno cambia, cambió la norma.
 */

const HOY = new Date("2026-08-06T12:00:00Z");

const avion = (id: string, clase: string): Aircraft =>
  ({ id, user_id: "u", registration: id, icao: "", type: "", type_acft: clase }) as Aircraft;

const vuelo = (over: Partial<Flight>): Flight =>
  ({
    id: Math.random().toString(), user_id: "u", date: "2026-08-01", route: "SADF SADF",
    landings: 1, duration: 1, takeoff: "", landing: "", purpose: "VP",
    pic_day_loc: 1, ...over,
  }) as Flight;

describe("recencyWindowDays", () => {
  /** 61.140(a)(2) — privado, planeador y globo se extienden a 180 días. */
  it("da 180 días a un piloto privado", () => {
    for (const l of ["PPA", "Piloto Privado", "privado", "PPA - Avión"]) {
      expect(recencyWindowDays(l), l).toBe(RECENCY_DAYS_PRIVATE);
    }
  });

  it("da 180 a planeador y globo", () => {
    expect(recencyWindowDays("Piloto de Planeador")).toBe(RECENCY_DAYS_PRIVATE);
    expect(recencyWindowDays("GLOBO LIBRE")).toBe(RECENCY_DAYS_PRIVATE);
  });

  /** 61.140(a)(1) — el caso general. */
  it("da 90 días al resto", () => {
    expect(recencyWindowDays("PCA")).toBe(RECENCY_DAYS_GENERAL);
    expect(recencyWindowDays("TLA")).toBe(RECENCY_DAYS_GENERAL);
  });

  /**
   * `license_type` es texto libre y en la base hay valores como "-". Caer en 90
   * es caer del lado estricto: avisa de más, nunca de menos.
   */
  it("cae en 90 ante un valor desconocido o vacío", () => {
    expect(recencyWindowDays("-")).toBe(RECENCY_DAYS_GENERAL);
    expect(recencyWindowDays(null)).toBe(RECENCY_DAYS_GENERAL);
    expect(recencyWindowDays(undefined)).toBe(RECENCY_DAYS_GENERAL);
  });
});

describe("recencyByClass", () => {
  const flota = [avion("mono", "MONT-T"), avion("multi", "MULT-T")];

  it("está vigente con tres aterrizajes dentro de la ventana", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-07-20", landings: 3 })],
      flota, 90, HOY
    );
    expect(r).toHaveLength(1);
    expect(r[0].vigente).toBe(true);
    expect(r[0].landings).toBe(3);
  });

  it("no está vigente con menos de tres", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-07-20", landings: 2 })],
      flota, 90, HOY
    );
    expect(r[0].vigente).toBe(false);
  });

  /** El vencimiento es la fecha del tercer aterrizaje hacia atrás + la ventana. */
  it("vence a los 90 días del vuelo donde se completó el tercero", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-07-20", landings: 3 })],
      flota, 90, HOY
    );
    expect(r[0].expiresOn).toBe("2026-10-18");
  });

  it("usa la ventana que se le pase, no una constante", () => {
    const vuelos = [vuelo({ aircraft_id: "mono", date: "2026-07-20", landings: 3 })];
    expect(recencyByClass(vuelos, flota, 180, HOY)[0].expiresOn).toBe("2027-01-16");
  });

  /**
   * 61.140(a)(1): "en cada categoría, clase, y si correspondiere a un tipo".
   * Estar vigente en monomotor no habilita a subirse a un multimotor.
   */
  it("aísla las clases entre sí", () => {
    const r = recencyByClass(
      [
        vuelo({ aircraft_id: "mono", date: "2026-08-01", landings: 5 }),
        vuelo({ aircraft_id: "multi", date: "2026-08-01", landings: 1 }),
      ],
      flota, 90, HOY
    );
    const mono = r.find((x) => x.clase === "MONT-T")!;
    const multi = r.find((x) => x.clase === "MULT-T")!;
    expect(mono.vigente).toBe(true);
    expect(multi.vigente).toBe(false);
  });

  it("no cuenta lo que quedó fuera de la ventana", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-01-10", landings: 9 })],
      flota, 90, HOY
    );
    expect(r[0].vigente).toBe(false);
    expect(r[0].landings).toBe(0);
    // La fecha sigue existiendo: dice cuándo venció, que es más útil que null.
    expect(r[0].expiresOn).toBe("2026-04-10");
    expect(r[0].status?.tone).toBe("expired");
  });

  /**
   * 61.140(a)(1) pide haber sido "la única persona que manipula los controles".
   * Un vuelo anotado sólo como instrucción recibida no computa.
   */
  it("ignora un vuelo sin tiempo PIC ni SIC", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-08-01", landings: 5, pic_day_loc: 0 })],
      flota, 90, HOY
    );
    expect(r).toHaveLength(0);
  });

  it("cuenta el tiempo SIC, porque la sección aplica a PIC y a SIC", () => {
    const r = recencyByClass(
      [vuelo({ aircraft_id: "mono", date: "2026-08-01", landings: 3, pic_day_loc: 0, sic_day_loc: 1 })],
      flota, 90, HOY
    );
    expect(r[0].vigente).toBe(true);
  });

  it("agrupa como 'Sin clase' un vuelo sin aeronave asociada", () => {
    const r = recencyByClass([vuelo({ date: "2026-08-01", landings: 3 })], flota, 90, HOY);
    expect(r[0].clase).toBe("Sin clase");
  });

  it("no devuelve nada sin vuelos", () => {
    expect(recencyByClass([], flota, 90, HOY)).toEqual([]);
  });
});

describe("nightRecency", () => {
  /** 61.140(b)(2) — la HVI vigente cumple el requisito nocturno. */
  it("cumple si hay HVI vigente", () => {
    expect(nightRecency(true).estado).toBe("cumple_por_hvi");
  });

  /**
   * Sin HVI no se puede afirmar nada: faltan el desglose día/noche de aterrizajes
   * y si fueron hasta la detención completa. Decir "no calculable" es la respuesta
   * honesta; estimarla sería el mismo error que este plan arregla en PCATracker.
   */
  it("no inventa un número cuando no hay HVI", () => {
    const r = nightRecency(false);
    expect(r.estado).toBe("no_calculable");
    if (r.estado === "no_calculable") expect(r.motivo).toContain("no puede afirmar");
  });
});

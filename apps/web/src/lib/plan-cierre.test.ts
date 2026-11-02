import { describe, expect, it } from "vitest";
import { candidatoARegistrar, horariosDelPlan, hrefRegistrarDesdePlan, preguntarSiVolo, prefillDesdePlan, recordarAhora, yaEstaEnLaBitacora, type ResumenParaCierre } from "./plan-cierre";
import { formularioVacio } from "./formulario-plan";

// Sale de San Fernando el 20/10 a las 1830Z (15:30 en Argentina) y vuela 45 minutos.
const PLAN = {
  ...formularioVacio(),
  aircraftId: "a1",
  salida: { codigo: "SADF", nombre: "San Fernando" },
  destino: { codigo: "SADM", nombre: "Morón" },
  dofUtc: "2026-10-20",
  eobtUtc: "1830",
  eet: "0045",
};

const RESUMEN: ResumenParaCierre = { id: "p1", completo: true, dof: "2026-10-20", descargado_at: null, enviado_at: "2026-10-20T15:00:00Z" };

describe("cuándo el inicio pregunta si ya volaste", () => {
  it("antes de la llegada estimada, no; después, sí", () => {
    expect(preguntarSiVolo(PLAN, [], "2026-10-20T19:14:00Z")).toBe(false);
    expect(preguntarSiVolo(PLAN, [], "2026-10-20T19:15:00Z")).toBe(true);
  });

  it("una demora corre la pregunta", () => {
    expect(preguntarSiVolo(PLAN, [{ dof: "2026-10-20", eobt: "1930" }], "2026-10-20T19:20:00Z")).toBe(false);
    expect(preguntarSiVolo(PLAN, [{ dof: "2026-10-20", eobt: "1930" }], "2026-10-20T20:15:00Z")).toBe(true);
  });

  it("pasados tres días deja de preguntar", () => {
    expect(preguntarSiVolo(PLAN, [], "2026-10-23T19:00:00Z")).toBe(true);
    expect(preguntarSiVolo(PLAN, [], "2026-10-23T19:16:00Z")).toBe(false);
  });

  it("sin hora de salida no pregunta", () => {
    expect(preguntarSiVolo({ ...PLAN, eobtUtc: "" }, [], "2026-10-21T00:00:00Z")).toBe(false);
  });

  it("la llegada pasa la medianoche UTC", () => {
    expect(horariosDelPlan({ ...PLAN, eobtUtc: "2330", eet: "0100" }, [])).toMatchObject({ llegada: "0030" });
  });
});

describe("qué planes vale la pena mirar", () => {
  const ahora = "2026-10-21T12:00:00Z";

  it("uno presentado, sin cerrar y reciente, sí", () => {
    expect(candidatoARegistrar(RESUMEN, ahora)).toBe(true);
    expect(candidatoARegistrar({ ...RESUMEN, enviado_at: null, descargado_at: "2026-10-20T15:00:00Z" }, ahora)).toBe(true);
  });

  it("un borrador nunca presentado, no", () => {
    expect(candidatoARegistrar({ ...RESUMEN, enviado_at: null }, ahora)).toBe(false);
    expect(candidatoARegistrar({ ...RESUMEN, completo: false }, ahora)).toBe(false);
  });

  it("uno registrado, cancelado o descartado, no", () => {
    expect(candidatoARegistrar({ ...RESUMEN, vuelo_id: "f1" }, ahora)).toBe(false);
    expect(candidatoARegistrar({ ...RESUMEN, cancelado_at: "2026-10-20T16:00:00Z" }, ahora)).toBe(false);
    expect(candidatoARegistrar({ ...RESUMEN, descartado_at: "2026-10-21T10:00:00Z" }, ahora)).toBe(false);
  });

  it("uno de la semana pasada o de mañana, no", () => {
    expect(candidatoARegistrar({ ...RESUMEN, dof: "2026-10-14" }, ahora)).toBe(false);
    expect(candidatoARegistrar({ ...RESUMEN, dof: "2026-10-22" }, ahora)).toBe(false);
  });
});

describe("lo que se precarga al registrar", () => {
  it("avión, ruta y fecha argentina; los horarios no, que se escriben los reales", () => {
    expect(prefillDesdePlan(PLAN, [])).toEqual({ aircraft_id: "a1", route: "SADF SADM", date: "2026-10-20" });
  });

  it("de noche en UTC es el día anterior en Argentina", () => {
    expect(prefillDesdePlan({ ...PLAN, dofUtc: "2026-10-21", eobtUtc: "0130" }, [])).toMatchObject({ date: "2026-10-20" });
  });

  it("un local repite el aeródromo", () => {
    expect(prefillDesdePlan({ ...PLAN, destino: null }, [])?.route).toBe("SADF SADF");
  });

  it("el link lleva el plan, sin horarios", () => {
    const href = hrefRegistrarDesdePlan("p1", PLAN, []);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/dashboard/log-flight?")).toBe(true);
    expect(Object.fromEntries(q)).toEqual({ prefill: "true", plan_vuelo_id: "p1", aircraft_id: "a1", route: "SADF SADM", date: "2026-10-20" });
  });
});

describe("el mail para cargar el vuelo", () => {
  // Llega a las 1915Z: el mail sale desde las 2045Z.
  it("una hora y media después de la llegada estimada", () => {
    expect(recordarAhora(PLAN, [], "2026-10-20T20:44:00Z")).toBe(false);
    expect(recordarAhora(PLAN, [], "2026-10-20T20:45:00Z")).toBe(true);
  });

  it("al día siguiente ya no", () => {
    expect(recordarAhora(PLAN, [], "2026-10-21T20:45:00Z")).toBe(true);
    expect(recordarAhora(PLAN, [], "2026-10-21T20:46:00Z")).toBe(false);
  });

  it("con una demora, cuenta desde la nueva llegada", () => {
    expect(recordarAhora(PLAN, [{ dof: "2026-10-20", eobt: "1930" }], "2026-10-20T20:45:00Z")).toBe(false);
  });
});

describe("si el vuelo ya está en la bitácora", () => {
  it("un vuelo de ese día que sale del mismo aeródromo", () => {
    expect(yaEstaEnLaBitacora(PLAN, [], [{ date: "2026-10-20", route: "SADF SADL" }])).toBe(true);
  });

  it("de otro día u otro aeródromo, no", () => {
    expect(yaEstaEnLaBitacora(PLAN, [], [{ date: "2026-10-19", route: "SADF SADM" }, { date: "2026-10-20", route: "SADM SADF" }])).toBe(false);
  });

  it("el día es el argentino: un vuelo a las 0130Z del 21 es del 20", () => {
    expect(yaEstaEnLaBitacora({ ...PLAN, dofUtc: "2026-10-21", eobtUtc: "0130" }, [], [{ date: "2026-10-20", route: "SADF SADM" }])).toBe(true);
  });
});


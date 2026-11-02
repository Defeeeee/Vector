import { describe, expect, it } from "vitest";
import { demoraDesdeHoraUtc, dofDeDemora, eobtVigente, nombreDeCancelacion, nombreDeDemora, planConDemora, planVigente, revisarDemora, type Demora } from "./demora-plan";
import type { PlanOaci } from "./plan-de-vuelo";
import { formularioVacio } from "./formulario-plan";

// Sale el 20/10 a las 1830 UTC.
const PLAN = { ...formularioVacio(), dofUtc: "2026-10-20", eobtUtc: "1830" };

describe("la demora (AIP ENR 1.10, punto 7)", () => {
  it("la EOBT vigente es la del plan, o la de la última demora", () => {
    expect(eobtVigente(PLAN, [])).toEqual({ dof: "2026-10-20", eobt: "1830" });
    expect(eobtVigente(PLAN, [{ dof: "2026-10-20", eobt: "1930" }])).toEqual({ dof: "2026-10-20", eobt: "1930" });
    expect(eobtVigente(formularioVacio(), [])).toBeNull();
  });

  it("la nueva EOBT, en UTC, el mismo día", () => {
    expect(demoraDesdeHoraUtc(PLAN, [], "1930")).toEqual({ dof: "2026-10-20", eobt: "1930" });
    expect(demoraDesdeHoraUtc(PLAN, [], "19:30")).toEqual({ dof: "2026-10-20", eobt: "1930" });
  });

  it("una hora anterior es al día siguiente", () => {
    const tarde = { ...formularioVacio(), dofUtc: "2026-10-20", eobtUtc: "2300" };
    expect(demoraDesdeHoraUtc(tarde, [], "0030")).toEqual({ dof: "2026-10-21", eobt: "0030" });
  });

  it("de una demora a la siguiente, parte de la última", () => {
    expect(demoraDesdeHoraUtc(PLAN, [{ dof: "2026-10-20", eobt: "1930" }], "2000")).toEqual({ dof: "2026-10-20", eobt: "2000" });
  });

  it("una hora mal escrita no es una demora", () => {
    expect(demoraDesdeHoraUtc(PLAN, [], "25:00")).toBeNull();
  });

  it("la cuarta demora no se puede (7.3)", () => {
    const tres: Demora[] = [
      { dof: "2026-10-20", eobt: "1900" },
      { dof: "2026-10-20", eobt: "1930" },
      { dof: "2026-10-20", eobt: "2000" },
    ];
    expect(revisarDemora(PLAN, tres, "2026-10-20T12:00:00Z").error).toMatch(/tres demoras/);
  });

  it("con menos de 30 minutos a la salida, avisa que corresponde un plan nuevo (7.2)", () => {
    expect(revisarDemora(PLAN, [], "2026-10-20T18:10:00Z")).toMatchObject({ error: null, aviso: expect.stringMatching(/plan nuevo/) });
    expect(revisarDemora(PLAN, [], "2026-10-20T17:50:00Z")).toEqual({ error: null, aviso: null });
  });

  it("la fecha de la demora como DOF/", () => {
    expect(dofDeDemora({ dof: "2026-10-21", eobt: "0330" })).toBe("261021");
  });

  it("el plan con la demora: la nueva hora en la 13 y la nueva fecha en la DOF/", () => {
    const plan = { c7: "LVS114", c13ad: "SADF", c13hora: "2300", c16ad: "SADF", dof: "261020", c18: "DOF/261020 RMK/ESCUELA" } as PlanOaci;
    const d = { dof: "2026-10-21", eobt: "0030" };
    expect(planConDemora(plan, d)).toMatchObject({ c13hora: "0030", dof: "261021", c18: "DOF/261021 RMK/ESCUELA" });
    expect(nombreDeDemora(plan, d)).toBe("DLA-LVS114-SADF0030SADF_211026.pdf");
  });

  it("la cancelación va con la salida vigente: la de la última demora, si hubo", () => {
    const plan = { c7: "LVS114", c13ad: "SADF", c13hora: "1830", c16ad: "SADM", dof: "261020", c18: "DOF/261020" } as PlanOaci;
    expect(planVigente(plan, [])).toBe(plan);
    expect(planVigente(plan, [{ dof: "2026-10-20", eobt: "1900" }, { dof: "2026-10-20", eobt: "1930" }])).toMatchObject({ c13hora: "1930" });
    expect(nombreDeCancelacion(plan, [])).toBe("CNL-LVS114-SADF1830SADM_201026.pdf");
  });
});

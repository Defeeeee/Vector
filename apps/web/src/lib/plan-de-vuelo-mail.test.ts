import { describe, expect, it } from "vitest";
import { armarMailPlan } from "./plan-de-vuelo-mail";
import type { PlanOaci } from "./plan-de-vuelo";

const plan = {
  c7: "LVS100",
  c9tipo: "ECHO",
  c13ad: "SRDL",
  c13hora: "1815",
  c16ad: "SADM",
  dof: "261017",
  c19: { piloto: "LUCIA FERRARI PPA 12345678" },
} as unknown as PlanOaci;
const oficina = { correo: "acmor@eana.com.ar", nombre: "Morón", oaci: "SADM" };
const base = { plan, nombres: { salida: "Luján", destino: "Morón" }, piloto: "lucia@example.com", oficina };

describe("el mail del plan de vuelo", () => {
  it("a la oficina: el formato de FPL.AR, con copia y respuestas al piloto", () => {
    const m = armarMailPlan({ ...base, modo: "aro" });
    expect(m).toMatchObject({ para: "acmor@eana.com.ar", cc: ["lucia@example.com"], responderA: "lucia@example.com" });
    expect(m.asunto).toBe("LVS100-SRDL(1815)SADM_171026");
    expect(m.texto).toBe(
      [
        "Estimados,",
        "",
        "Adjunto el plan de vuelo de la aeronave LVS100 (ECHO).",
        "",
        "  Desde : LUJAN (SRDL)",
        "  Hasta : MORON (SADM)",
        "  Fecha : 17 de octubre de 2026",
        "  EOBT  : 1815 UTC",
        "",
        "Cordiales saludos,",
        "",
        "LUCIA FERRARI PPA 12345678",
        "LVS100",
        "lucia@example.com",
        "",
        "—",
        "Para cualquier consulta o respuesta, por favor escriban directamente al",
        'correo del piloto: lucia@example.com, o usen la opción "Responder a todos"',
        "para incluir al piloto en la respuesta.",
        "Este mensaje fue generado automáticamente por Vector.",
      ].join("\n")
    );
  });

  it("la prueba va sólo al piloto, marcada, y dice a dónde iría", () => {
    const m = armarMailPlan({ ...base, modo: "prueba" });
    expect(m).toMatchObject({ para: "lucia@example.com", cc: [] });
    expect(m.asunto).toBe("PRUEBA · LVS100-SRDL(1815)SADM_171026");
    expect(m.texto.split("\n")[0]).toBe("PRUEBA: en el envío real, este mail va a acmor@eana.com.ar (ARO/AIS Morón, SADM), con copia a vos.");
    expect(m.html).toContain("PRUEBA");
  });

  it("sin oficina elegida, nunca va a otro lado que al piloto", () => {
    expect(armarMailPlan({ ...base, oficina: null, modo: "aro" }).para).toBe("lucia@example.com");
  });

  it("el HTML no deja pasar etiquetas de lo que escribió el piloto", () => {
    const m = armarMailPlan({ ...base, plan: { ...plan, c19: { piloto: "<script>x</script>" } } as unknown as PlanOaci, modo: "aro" });
    expect(m.html).not.toContain("<script>");
  });

  it("la demora: DLA en el asunto, la hora nueva y la de antes", () => {
    const conDemora = { ...plan, c13hora: "1915" } as PlanOaci;
    const m = armarMailPlan({ ...base, plan: conDemora, modo: "aro", aviso: { tipo: "dla", eobtAnterior: "1815" } });
    expect(m.asunto).toBe("DLA LVS100-SRDL(1915)SADM_171026");
    expect(m.texto).toContain("Adjunto el aviso de demora (DLA) del plan de vuelo de la aeronave LVS100 (ECHO).");
    expect(m.texto).toContain("  Nueva EOBT : 1915 UTC (antes 1815 UTC)");
    expect(m).toMatchObject({ para: "acmor@eana.com.ar", cc: ["lucia@example.com"] });
    expect(armarMailPlan({ ...base, plan: conDemora, modo: "prueba", aviso: { tipo: "dla", eobtAnterior: "1815" } }).asunto).toBe(
      "PRUEBA · DLA LVS100-SRDL(1915)SADM_171026"
    );
  });

  it("la cancelación: CNL en el asunto y la EOBT de siempre", () => {
    const m = armarMailPlan({ ...base, modo: "aro", aviso: { tipo: "cnl" } });
    expect(m.asunto).toBe("CNL LVS100-SRDL(1815)SADM_171026");
    expect(m.texto).toContain("Adjunto la cancelación (CNL) del plan de vuelo de la aeronave LVS100 (ECHO).");
    expect(m.texto).toContain("  EOBT  : 1815 UTC");
    expect(m).toMatchObject({ para: "acmor@eana.com.ar", cc: ["lucia@example.com"], responderA: "lucia@example.com" });
  });
});

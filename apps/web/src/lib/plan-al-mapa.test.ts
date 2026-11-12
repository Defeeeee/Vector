import { describe, expect, it } from "vitest";
import { formularioVacio } from "./formulario-plan";
import { avisoDeSalteados, candidatoParaElMapa, coordenadaParaElMapa, planAlMapa, planParaElMapa } from "./plan-al-mapa";

const plan = (cambios: Record<string, unknown>) => ({
  ...formularioVacio(),
  salida: { codigo: "SADM", nombre: "Mariano Moreno" },
  destino: { codigo: "SRDL", nombre: "Don Torcuato" },
  ...cambios,
});

describe("planAlMapa", () => {
  it("saca DCT, reglas y grupos de velocidad y nivel", () => {
    const r = planAlMapa(plan({ ruta: "N0100VFR DCT VM DCT ATE DCT" }));
    expect(r.ruta).toBe("SADM VM ATE SRDL");
    expect(r.salteados).toEqual([]);
  });

  it("entiende los grupos con otras formas y pegados a un punto", () => {
    expect(planAlMapa(plan({ ruta: "DCT VM/N0100A015 DCT K0185M0150 DCT IFR DCT" })).ruta).toBe("SADM VM SRDL");
  });

  it("cuenta lo que no es un lugar que el Mapa conozca", () => {
    const r = planAlMapa(plan({ ruta: "DCT VM DCT SECTOR ESCUELA DCT" }));
    expect(r.ruta).toBe("SADM VM SRDL");
    expect(r.salteados).toEqual(["SECTOR ESCUELA"]);
  });

  it("pasa coordenadas y radiales en la gramática del Mapa", () => {
    expect(planAlMapa(plan({ ruta: "DCT 3441S05838W BAR045025 DCT" })).ruta).toBe("SADM S34.6833/W58.6333 BAR/045/25 SRDL");
  });

  it("un LAD con coordenadas va como punto propio; sin ellas se saltea y se cuenta", () => {
    const con = planAlMapa(plan({ salida: { codigo: "LAD2013", nombre: "X", lat: -34.4542, lon: -58.5913 } }));
    expect(con.ruta).toBe("S34.4542/W58.5913 SRDL");
    const sin = planAlMapa(plan({ destino: { codigo: "LAD2013", nombre: "X" } }));
    expect(sin.ruta).toBe("");
    expect(sin.salteados).toEqual(["LAD2013 (sin coordenadas)"]);
  });

  it("sin salida y destino no hay ruta", () => {
    expect(planAlMapa(plan({ destino: null })).ruta).toBe("");
    expect(planAlMapa(null).ruta).toBe("");
  });

  it("el avión es el del plan", () => {
    expect(planAlMapa(plan({ aircraftId: "a1" })).aircraftId).toBe("a1");
    expect(planAlMapa(plan({ aircraftId: "a1" }), "a2").aircraftId).toBe("a2");
  });

  it("coordenadaParaElMapa", () => {
    expect(coordenadaParaElMapa(-34.4091, -58.6847)).toBe("S34.4091/W58.6847");
    expect(coordenadaParaElMapa(10, 20)).toBe("N10.0000/E20.0000");
  });
});

describe("avisoDeSalteados", () => {
  it("cuenta en singular y plural", () => {
    expect(avisoDeSalteados([])).toBeNull();
    expect(avisoDeSalteados(["A"])).toBe("1 punto del plan no va al Mapa: A.");
    expect(avisoDeSalteados(["A", "B C"])).toBe("2 puntos del plan no van al Mapa: A, B C.");
  });
});

describe("Tus planes", () => {
  const ahora = "2026-11-12T12:00:00.000Z";
  const resumen = { id: "p1", salida: "SADM", destino: "SRDL", matricula: "LV-S048", dof: "2026-11-12", eobt: "1930" };

  it("arma la fila con la fecha escrita a mano", () => {
    const r = planParaElMapa(resumen, plan({ dofUtc: "2026-11-12", eobtUtc: "1930", ruta: "DCT VM DCT" }), [], ahora);
    expect(r?.titulo).toBe("SADM → SRDL · LV-S048 · 12/11 19:30Z");
    expect(r?.ruta).toBe("SADM VM SRDL");
  });

  it("cuenta la salida vigente con las demoras", () => {
    const f = plan({ dofUtc: "2026-11-01", eobtUtc: "1930" });
    expect(planParaElMapa({ ...resumen, dof: "2026-11-01" }, f, [], ahora)).toBeNull();
    const r = planParaElMapa({ ...resumen, dof: "2026-11-01" }, f, [{ dof: "2026-11-13", eobt: "1000" }], ahora);
    expect(r?.titulo).toContain("13/11 10:00Z");
  });

  it("la ventana es de 3 h atrás a 7 días adelante", () => {
    const f = (dof: string, eobt: string) => plan({ dofUtc: dof, eobtUtc: eobt });
    expect(planParaElMapa(resumen, f("2026-11-12", "0900"), [], ahora)).not.toBeNull();
    expect(planParaElMapa(resumen, f("2026-11-12", "0859"), [], ahora)).toBeNull();
    expect(planParaElMapa(resumen, f("2026-11-19", "1200"), [], ahora)).not.toBeNull();
    expect(planParaElMapa(resumen, f("2026-11-19", "1201"), [], ahora)).toBeNull();
  });

  it("no ofrece cancelados, descartados ni volados", () => {
    const f = plan({ dofUtc: "2026-11-12", eobtUtc: "1930" });
    for (const c of [{ cancelado_at: "x" }, { descartado_at: "x" }, { vuelo_id: "x" }]) {
      expect(planParaElMapa({ ...resumen, ...c }, f, [], ahora)).toBeNull();
      expect(candidatoParaElMapa({ ...resumen, ...c }, ahora)).toBe(false);
    }
  });

  it("el filtro barato deja pasar un día de más", () => {
    expect(candidatoParaElMapa(resumen, ahora)).toBe(true);
    expect(candidatoParaElMapa({ ...resumen, dof: "2026-10-01" }, ahora)).toBe(false);
    expect(candidatoParaElMapa({ ...resumen, dof: null }, ahora)).toBe(false);
  });
});

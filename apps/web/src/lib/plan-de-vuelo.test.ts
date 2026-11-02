import { describe, expect, it } from "vitest";
import {
  textoFormulario,
  asuntoDelMail,
  cuerpoDelMail,
  autonomiaHhmm,
  casilla18,
  coordenadaOaci,
  duracionHhmm,
  identificacionAeronave,
  indicadorDeLugar,
  nivelCrucero,
  rutaItem15,
  salidaUtc,
  textoAts,
  velocidadCrucero,
} from "./plan-de-vuelo";

describe("formatos de las casillas (AIP ENR 1.10, Apéndice 1)", () => {
  it("casilla 7: la matrícula sin guiones", () => {
    expect(identificacionAeronave("LV-ABC")).toBe("LVABC");
    expect(identificacionAeronave(" lv-gve ")).toBe("LVGVE");
    expect(identificacionAeronave("N2567GA-X")).toBe("N2567GA");
  });

  it("casilla 15: velocidad con N y cuatro cifras, nivel en centenares de pies o VFR", () => {
    expect(velocidadCrucero(95)).toBe("N0095");
    expect(velocidadCrucero(109.6)).toBe("N0110");
    expect(nivelCrucero(4500)).toBe("A045");
    expect(nivelCrucero(10_000)).toBe("A100");
    expect(nivelCrucero(null)).toBe("VFR");
    expect(nivelCrucero(0)).toBe("VFR");
  });

  it("coordenadas en grados y minutos, once caracteres, con el redondeo que sube de grado", () => {
    expect(coordenadaOaci(46.3333, -78.0833)).toBe("4620N07805W");
    expect(coordenadaOaci(-34.6833, -58.6333)).toBe("3441S05838W");
    // 59,7 minutos no se escriben "60": son el grado siguiente.
    expect(coordenadaOaci(-34.9995, -58.9995)).toBe("3500S05900W");
    expect(coordenadaOaci(-5.5, -8.25)).toBe("0530S00815W");
  });

  it("duraciones con cuatro cifras, y la autonomía redondeada para abajo", () => {
    expect(duracionHhmm(105)).toBe("0145");
    expect(duracionHhmm(44.6)).toBe("0045");
    expect(autonomiaHhmm(100, 24)).toBe("0410"); // 4 h 10 min exactos
    expect(autonomiaHhmm(100, 23)).toBe("0420"); // 4 h 20,8 min → 4 h 20
    expect(autonomiaHhmm(0, 24)).toBeNull();
    expect(autonomiaHhmm(80, 0)).toBeNull();
  });

  it("la hora en UTC, y DOF/ con la fecha UTC aunque en Argentina siga siendo ayer", () => {
    expect(salidaUtc("2026-10-10", "10:30")).toEqual({ hora: "1330", dof: "261010" });
    expect(salidaUtc("2026-10-10", "22:15")).toEqual({ hora: "0115", dof: "261011" });
    expect(salidaUtc("2026-12-31", "21:00")).toEqual({ hora: "0000", dof: "270101" });
    expect(salidaUtc("2026-10-10", "")).toBeNull();
    expect(salidaUtc("10/10/2026", "10:30")).toBeNull();
    expect(salidaUtc("2026-10-10", "25:00")).toBeNull();
  });

  it("el texto libre queda en mayúsculas, sin acentos ni símbolos que rompan el mensaje", () => {
    expect(textoAts("Aeroclub Cañuelas (instrucción) - vuelo/2")).toBe("AEROCLUB CANUELAS INSTRUCCION VUELO 2");
  });
});

describe("aeródromos con y sin indicador OACI (casillas 13, 16 y 18)", () => {
  it("con cuatro letras va en la casilla", () => {
    expect(indicadorDeLugar({ codigo: "sadf", nombre: "San Fernando" })).toEqual({ casilla: "SADF" });
  });

  it("con designador ANAC va ZZZZ, y el nombre y el lugar a la casilla 18", () => {
    expect(indicadorDeLugar({ codigo: "CNL", nombre: "Cañuelas", lat: -35.0, lon: -58.75 })).toEqual({
      casilla: "ZZZZ",
      otrosDatos: "CANUELAS 3500S05845W",
    });
  });
});

describe("la ruta, casilla 15 c)", () => {
  it("sin puntos intermedios es DCT", () => {
    expect(rutaItem15([])).toBe("DCT");
  });

  it("DCT entre puntos con designador", () => {
    expect(
      rutaItem15([
        { tipo: "radioayuda", codigo: "SNO" },
        { tipo: "fix", codigo: "dorvo" },
      ])
    ).toBe("DCT SNO DCT DORVO DCT");
  });

  it("sin DCT entre dos puntos geográficos (coordenadas o radial y distancia)", () => {
    expect(
      rutaItem15([
        { tipo: "coordenada", codigo: "S34.5/W58.9", lat: -34.5, lon: -58.9 },
        { tipo: "radial", codigo: "BAR/045/25" },
        { tipo: "radioayuda", codigo: "BAR" },
      ])
    ).toBe("DCT 3430S05854W BAR045025 DCT BAR DCT");
  });

  it("una aerovía va entre su punto de entrada y el de salida, sin DCT alrededor", () => {
    expect(
      rutaItem15([
        { tipo: "fix", codigo: "BCA" },
        { tipo: "aerovia", designador: "W67" },
        { tipo: "fix", codigo: "OSA" },
        { tipo: "radioayuda", codigo: "SRA" },
      ])
    ).toBe("DCT BCA W67 OSA DCT SRA DCT");
  });

  it("un aeródromo intermedio va con su código, como en el plan que aceptó EANA", () => {
    expect(rutaItem15([{ tipo: "aerodromo", codigo: "ATE", lat: -34.1, lon: -59.1 }])).toBe("DCT ATE DCT");
    expect(rutaItem15([{ tipo: "aerodromo", codigo: "SAAJ", lat: -34.5458, lon: -60.9306 }])).toBe("DCT SAAJ DCT");
  });

  it("termina sin DCT si termina en una aerovía: el destino la deja", () => {
    expect(rutaItem15([{ tipo: "fix", codigo: "BCA" }, { tipo: "aerovia", designador: "W67" }])).toBe("DCT BCA W67");
  });

  it("un punto que no se puede escribir frena la ruta en vez de saltearlo", () => {
    expect(rutaItem15([{ tipo: "coordenada", codigo: "S34/W58" }])).toBeNull();
    expect(rutaItem15([{ tipo: "radial", codigo: "BAR/045/1200" }])).toBeNull();
  });
});

describe("casilla 18", () => {
  it("cero si no hay nada, y los indicadores en el orden de la ENR 1.10", () => {
    expect(casilla18({})).toBe("0");
    expect(casilla18({ RMK: "INSTRUCCION", DOF: "261010", DEP: "CANUELAS 3500S05845W", OPR: "AEROCLUB" })).toBe(
      "DEP/CANUELAS 3500S05845W DOF/261010 OPR/AEROCLUB RMK/INSTRUCCION"
    );
  });
});

describe("el mail, con el formato de FPL.AR", () => {
  const plan = { c7: "LVS100", c9tipo: "ECHO", c13ad: "SRDL", c13hora: "1815", c16ad: "SADM", dof: "261017", c19: { piloto: "LUCIA FERRARI PPA 12345678" } };

  it("el asunto: matrícula, salida (EOBT) destino y fecha", () => {
    expect(asuntoDelMail(plan)).toBe("LVS100-SRDL(1815)SADM_171026");
  });

  it("el cuerpo", () => {
    expect(cuerpoDelMail(plan, { salida: "Luján", destino: "Morón" })).toBe(
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
      ].join("\n")
    );
  });
});

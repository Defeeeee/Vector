import { describe, expect, it } from "vitest";
import { nombreSugerido } from "./rutas-guardadas";

describe("el nombre que se propone para guardar una ruta", () => {
  it("salida y llegada", () => {
    expect(nombreSugerido(["SADF", "DCT", "SADM"])).toBe("SADF → SADM");
  });
  it("un punto en el medio se nombra; varios no", () => {
    expect(nombreSugerido(["SADF", "BENAVIDEZ", "SAAK"])).toBe("SADF → SAAK por BENAVIDEZ");
    expect(nombreSugerido(["SADF", "UGIMI", "W18", "BCA", "SAZB"])).toBe("SADF → SAZB");
  });
  it("un local", () => {
    expect(nombreSugerido(["SADF", "SADF"])).toBe("SADF local");
    expect(nombreSugerido(["SADF", "DIQUELUJAN", "SADF"])).toBe("SADF local por DIQUELUJAN");
  });
  it("vacío o un solo punto", () => {
    expect(nombreSugerido([])).toBe("");
    expect(nombreSugerido(["SADF"])).toBe("SADF");
  });
});

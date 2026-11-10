import { describe, expect, it } from "vitest";
import { sumarDias } from "./fechas-iso";

describe("sumarDias", () => {
  it("cruza el mes y el año en UTC", () => {
    expect(sumarDias("2026-08-14", 1)).toBe("2026-08-15");
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("también resta", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

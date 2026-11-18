import { describe, expect, it } from "vitest";
import { alturaDelSol } from "./sol";

describe("alturaDelSol", () => {
  // San Fernando, 6 de julio de 2025: el sol se pone cerca de las 17:58 hora argentina (20:58 UTC).
  const SADF: [number, number] = [-34.453, -58.589];
  it("arriba antes de la puesta y abajo después", () => {
    expect(alturaDelSol(new Date("2025-07-06T20:30:00Z"), ...SADF)).toBeGreaterThan(2);
    expect(alturaDelSol(new Date("2025-07-06T21:30:00Z"), ...SADF)).toBeLessThan(-4);
  });
  it("al mediodía de verano está alto", () => {
    expect(alturaDelSol(new Date("2025-12-21T16:00:00Z"), ...SADF)).toBeGreaterThan(70);
  });
});

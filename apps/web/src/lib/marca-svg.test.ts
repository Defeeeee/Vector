import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARCA_FLECHA, MARCA_TEXTO, MARCA_VIEWBOX } from "./marca-svg";

describe("la marca en datos", () => {
  it("es la misma que public/marca/logo-horizontal-color.svg", () => {
    const svg = readFileSync("public/marca/logo-horizontal-color.svg", "utf8");
    expect(svg).toContain(`viewBox="${MARCA_VIEWBOX}"`);
    for (const p of MARCA_FLECHA) expect(svg).toContain(`points="${p}"`);
    expect(svg).toContain(`d="${MARCA_TEXTO.d}"`);
    expect(svg).toContain(`transform="${MARCA_TEXTO.transform}"`);
  });
});

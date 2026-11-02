import { describe, expect, it } from "vitest";
import { esErrorDeRedirect } from "./redirect-error";

describe("esErrorDeRedirect", () => {
  it("reconoce el digest real que tira Next", () => {
    expect(esErrorDeRedirect({ digest: "NEXT_REDIRECT;push;/dashboard/history;307;" })).toBe(true);
  });

  it("alcanza con que empiece así, no hace falta el string exacto", () => {
    // El digest trae el tipo, la URL y el status code pegados atrás; comparar con
    // `===` nunca daría true para ningún redirect real.
    expect(esErrorDeRedirect({ digest: "NEXT_REDIRECTX" })).toBe(true);
  });

  it("un Error común, sin digest, no es un redirect", () => {
    expect(esErrorDeRedirect(new Error("algo falló"))).toBe(false);
  });

  it("un digest de otra cosa no cuenta", () => {
    expect(esErrorDeRedirect({ digest: "NEXT_NOT_FOUND" })).toBe(false);
  });

  it("un digest que no es texto no cuenta", () => {
    expect(esErrorDeRedirect({ digest: 12345 })).toBe(false);
  });

  it("null y undefined no rompen nada", () => {
    expect(esErrorDeRedirect(null)).toBe(false);
    expect(esErrorDeRedirect(undefined)).toBe(false);
  });

  it("un valor que no es un objeto tampoco rompe nada", () => {
    expect(esErrorDeRedirect("NEXT_REDIRECT")).toBe(false);
    expect(esErrorDeRedirect(42)).toBe(false);
  });
});

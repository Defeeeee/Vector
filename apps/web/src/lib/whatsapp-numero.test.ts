import { describe, expect, it } from "vitest";
import { mostrarWhatsapp, normalizarWhatsapp } from "./whatsapp-numero";

const ok = (entrada: string) => {
  const r = normalizarWhatsapp(entrada);
  return r.ok ? r.numero : `ERROR: ${r.error}`;
};

describe("normalizarWhatsapp", () => {
  it("el caso del 2026-09-24: sin el 54 ni el 9", () => {
    expect(ok("1123456789")).toBe("5491123456789");
    expect(ok("11 2345-6789")).toBe("5491123456789");
  });

  it("con 0 y 15, como se dicta un celular", () => {
    expect(ok("011 15 2345-6789")).toBe("5491123456789");
    expect(ok("11 15 2345 6789")).toBe("5491123456789");
    expect(ok("0351 15 123-4567")).toBe("5493511234567");
    expect(ok("02944 15 12-3456")).toBe("5492944123456");
  });

  it("con el código de país, con o sin el 9", () => {
    expect(ok("+54 9 11 2345 6789")).toBe("5491123456789");
    expect(ok("5491123456789")).toBe("5491123456789");
    expect(ok("+54 11 2345 6789")).toBe("5491123456789");
    expect(ok("54 11 2345 6789")).toBe("5491123456789");
    expect(ok("0054 9 351 123 4567")).toBe("5493511234567");
  });

  it("uno ya bien guardado no cambia", () => {
    expect(ok("5493511234567")).toBe("5493511234567");
  });

  it("vacío es borrar el número", () => {
    expect(normalizarWhatsapp("")).toEqual({ ok: true, numero: "" });
    expect(normalizarWhatsapp("   ")).toEqual({ ok: true, numero: "" });
  });

  it("un número incompleto o sin código de área se rechaza, con ayuda", () => {
    expect(ok("2345-6789")).toMatch(/^ERROR: .*código de área/);
    expect(ok("15 2345 6789")).toMatch(/^ERROR/);
    expect(ok("11 2345 678")).toMatch(/^ERROR/);
  });

  it("un extranjero con + se guarda tal cual", () => {
    expect(ok("+598 94 123 456")).toBe("59894123456");
    expect(ok("+1 (415) 555-0100")).toBe("14155550100");
  });
});

describe("mostrarWhatsapp", () => {
  it("lo escribe como se lee", () => {
    expect(mostrarWhatsapp("5491123456789")).toBe("+54 9 11 2345-6789");
    expect(mostrarWhatsapp("5493511234567")).toBe("+54 9 351 123-4567");
    expect(mostrarWhatsapp("")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { guardarConsentimiento, leerConsentimiento, pixelPermitidoEn } from "./pixel-meta";

describe("dónde se carga el píxel de Meta", () => {
  it("en la portada y las guías", () => {
    for (const r of ["/", "/guias", "/guias/requisitos-pca", "/guias/", "/?utm_source=meta&utm_campaign=ppa"]) {
      expect(pixelPermitidoEn(r)).toBe(true);
    }
  });

  it("nunca adentro de la app, en perfiles de otros, en el login ni donde hay tokens", () => {
    for (const r of [
      "/dashboard", "/dashboard/settings", "/dashboard/admin",
      "/u/defee", "/login", "/register", "/recover",
      "/update-password", "/auth/callback", "/mail/baja", "/legal/privacidad",
      "/api/mail/c", "/guiasfalsas", "", null, undefined,
    ]) {
      expect(pixelPermitidoEn(r)).toBe(false);
    }
  });
});

describe("el consentimiento", () => {
  const almacen = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("sin elección, pregunta", () => {
    expect(leerConsentimiento(almacen())).toBeNull();
  });

  it("guarda el sí y el no, y se puede volver a preguntar", () => {
    const a = almacen();
    guardarConsentimiento(a, "si");
    expect(leerConsentimiento(a)).toBe("si");
    guardarConsentimiento(a, "no");
    expect(leerConsentimiento(a)).toBe("no");
    guardarConsentimiento(a, null);
    expect(leerConsentimiento(a)).toBeNull();
  });

  it("un valor raro no cuenta como sí", () => {
    const a = almacen();
    a.setItem("vector:consentimiento-meta", "quizas");
    expect(leerConsentimiento(a)).toBeNull();
  });

  it("si el navegador bloquea el almacenamiento, no rompe y pregunta", () => {
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => { throw new Error("bloqueado"); } };
    expect(leerConsentimiento(roto)).toBeNull();
    expect(() => guardarConsentimiento(roto, "si")).not.toThrow();
    expect(leerConsentimiento(null)).toBeNull();
  });
});

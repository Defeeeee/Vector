import { describe, expect, it } from "vitest";
import {
  conArroba,
  normalizarHandle,
  problemaDelHandle,
  rutaPerfil,
  rutaPerfilApp,
  sugerirHandle,
  urlPerfil,
} from "./handle";

/**
 * Los mismos casos que `test_social.py` del backend. Si un lado acepta lo que el otro
 * rechaza, el piloto se entera recién al guardar.
 */
describe("problemaDelHandle", () => {
  it.each(["fede.dn", "piloto_01", "abc", "a".repeat(20), "  @Fede.DN "])("acepta %j", (h) => {
    expect(problemaDelHandle(h)).toBeNull();
  });

  it.each([
    ["ab", "al menos 3"],
    ["a".repeat(21), "como mucho 20"],
    ["fedé", "sin acento"],
    ["fe de", "sin acento"],
    ["fe-de", "sin acento"],
    ["_fede", "empezar y terminar"],
    ["fede.", "empezar y terminar"],
    ["fe..de", "dos puntos"],
    ["vector", "reservado"],
    ["@ANAC", "reservado"],
    ["", "al menos 3"],
  ])("rechaza %j", (h, motivo) => {
    expect(problemaDelHandle(h)).toContain(motivo);
  });
});

describe("cómo se muestra y adónde lleva", () => {
  it("normaliza igual que el backend", () => {
    expect(normalizarHandle("  @@Fede.DN ")).toBe("fede.dn");
    expect(normalizarHandle(undefined)).toBe("");
  });

  it("en la interfaz lleva arroba", () => {
    expect(conArroba("Fede.DN")).toBe("@fede.dn");
    expect(conArroba("@fede")).toBe("@fede");
  });

  it("en la URL va sin arroba, bajo /u", () => {
    expect(rutaPerfil("@Fede.DN")).toBe("/u/fede.dn");
    expect(urlPerfil("fede", "https://vector.fdiaznem.com.ar/")).toBe("https://vector.fdiaznem.com.ar/u/fede");
  });
});

describe("las pantallas de Pilotos", () => {
  it.each(["buscar", "actividad", "publicar", "red", "solicitudes"])("reserva %j, que taparía un perfil", (h) => {
    // `/dashboard/pilotos/buscar` es una pantalla fija: un @buscar no tendría perfil.
    expect(problemaDelHandle(h)).toBe("Ese @ está reservado.");
  });

  it("el perfil adentro de la app va sin arroba y codificado", () => {
    expect(rutaPerfilApp("@Fede.DN")).toBe("/dashboard/pilotos/fede.dn");
  });
});

describe("sugerirHandle", () => {
  it("arma el @ con el nombre, sin tildes ni eñes", () => {
    expect(sugerirHandle("Lucía Prueba")).toBe("lucia.prueba");
    expect(sugerirHandle("Ñandú Pérez")).toBe("nandu.perez");
    expect(sugerirHandle("  José   María  ")).toBe("jose.maria");
  });

  it("corta a 20 sin dejar un punto al final", () => {
    expect(sugerirHandle("Federico Díaz Nemeth")).toBe("federico.diaz.nemeth");
    expect(sugerirHandle("Maximiliano Bartolomeo Fernández")).toBe("maximiliano.bartolom");
    // El corte cae justo en un punto: "carolina.fernandezz." → sin el punto.
    expect(sugerirHandle("Carolina Fernandezz Ruiz")).toBe("carolina.fernandezz");
    expect(problemaDelHandle(sugerirHandle("Anastasia Constantinopla"))).toBeNull();
  });

  it("si no sale un @ válido, no propone nada", () => {
    expect(sugerirHandle("Al")).toBe("");
    expect(sugerirHandle("Admin")).toBe("");
    expect(sugerirHandle("")).toBe("");
    expect(sugerirHandle(null)).toBe("");
  });
});

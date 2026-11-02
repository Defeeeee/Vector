import { describe, expect, it } from "vitest";
import { compararVersion, estadoExtension, navegadorParaCad, VERSION_EXTENSION } from "./extension-cad";

describe("compararVersion", () => {
  it("número por número", () => {
    expect(compararVersion("1.10.0", "1.9.2")).toBe(1);
    expect(compararVersion("1.1", "1.1.0")).toBe(0);
    expect(compararVersion("1.0.1", "1.1.0")).toBe(-1);
  });
});

describe("estadoExtension", () => {
  it("sin extensión, sin puente, vieja y al día", () => {
    expect(estadoExtension(null, "1.2.0")).toBe("falta");
    expect(estadoExtension("1.0.1", "1.2.0")).toBe("sin-puente");
    expect(estadoExtension("1.1.0", "1.2.0")).toBe("vieja");
    expect(estadoExtension("1.2.0", "1.2.0")).toBe("al-dia");
  });
  it("la que se baja hoy tiene puente", () => {
    expect(estadoExtension(VERSION_EXTENSION)).toBe("al-dia");
  });
});

describe("navegadorParaCad", () => {
  const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
  const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
  const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

  it("la extensión, sólo en un Chrome de compu", () => {
    expect(navegadorParaCad(MAC_CHROME)).toBe("extension");
    expect(navegadorParaCad(WIN_EDGE)).toBe("extension");
  });
  it("Safari y Firefox, el marcador", () => {
    expect(navegadorParaCad(MAC_SAFARI)).toBe("marcador");
    expect(navegadorParaCad(FIREFOX)).toBe("marcador");
  });
  it("teléfonos y tablets, a la compu", () => {
    for (const ua of [IPHONE, IPHONE_CHROME, ANDROID, ANDROID_TABLET]) expect(navegadorParaCad(ua)).toBe("compu");
  });
  it("el iPad se hace pasar por una Mac, pero es táctil", () => {
    expect(navegadorParaCad(MAC_SAFARI, 5)).toBe("compu");
    expect(navegadorParaCad(MAC_SAFARI, 0)).toBe("marcador");
  });
  it("sin user agent, lo de siempre", () => {
    expect(navegadorParaCad("")).toBe("extension");
  });
});

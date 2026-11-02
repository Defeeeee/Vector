import { describe, it, expect } from "vitest";
import { calcularDimensiones, nombreConExtension } from "./imagen-cliente";

describe("nombreConExtension", () => {
  it("cambia la extensión por la del formato en que quedó", () => {
    expect(nombreConExtension("IMG_2041.HEIC", "image/webp")).toBe("IMG_2041.webp");
    // Safari: el WebP volvió como JPEG.
    expect(nombreConExtension("foto.png", "image/jpeg")).toBe("foto.jpg");
    expect(nombreConExtension("sin-extension", "image/png")).toBe("sin-extension.png");
    expect(nombreConExtension(".webp", "image/webp")).toBe("foto.webp");
  });
});

describe("calcularDimensiones", () => {
  it("no hace nada si es más chica que el máximo", () => {
    expect(calcularDimensiones(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("achica imágenes anchas respetando el aspect ratio", () => {
    expect(calcularDimensiones(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it("achica imágenes altas respetando el aspect ratio", () => {
    expect(calcularDimensiones(1000, 2000, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it("redondea dimensiones a enteros", () => {
    expect(calcularDimensiones(3000, 2000, 1600)).toEqual({ width: 1600, height: 1067 });
  });
});

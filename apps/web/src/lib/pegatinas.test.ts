import { describe, expect, it } from "vitest";
import { hojaDePegatinas } from "./pegatinas-hoja";
import { codigosDeLaHoja, destinoDelEscaneo, leerCookieQr, normalizarCodigo, valorCookieQr } from "./pegatinas";

describe("las pegatinas con QR", () => {
  it("normaliza el código como el backend", () => {
    expect(normalizarCodigo(" k7p2 ")).toBe("K7P2");
    expect(normalizarCodigo("../../x")).toBeNull();
    expect(normalizarCodigo("AB")).toBeNull();
    expect(normalizarCodigo(undefined)).toBeNull();
  });

  it("la cookie guarda el código y la hora del escaneo", () => {
    const v = valorCookieQr("K7P2", new Date("2026-10-23T15:00:00Z"));
    expect(leerCookieQr(v)).toEqual({ codigo: "K7P2", escaneadoAt: "2026-10-23T15:00:00.000Z" });
    expect(leerCookieQr("K7P2")).toBeNull();
    expect(leerCookieQr("<script>.1")).toBeNull();
    expect(leerCookieQr(null)).toBeNull();
  });

  it("el admin va a la pegatina, y sólo el visitante se lleva la cookie", () => {
    const base = { codigo: "K7P2", existe: true };
    expect(destinoDelEscaneo({ ...base, conSesion: true, esAdmin: true })).toEqual({ destino: "/dashboard/admin/pegatinas/K7P2", cookie: false });
    expect(destinoDelEscaneo({ ...base, conSesion: true, esAdmin: false })).toEqual({ destino: "/dashboard", cookie: false });
    const visitante = destinoDelEscaneo({ ...base, conSesion: false, esAdmin: false });
    expect(visitante.cookie).toBe(true);
    expect(visitante.destino).toBe("/?utm_source=qr&utm_medium=pegatina&utm_content=K7P2");
  });

  it("un código que no existe lleva a la portada, sin cookie", () => {
    expect(destinoDelEscaneo({ codigo: "ZZZZ", existe: false, conSesion: false, esAdmin: false })).toEqual({ destino: "/", cookie: false });
    expect(destinoDelEscaneo({ codigo: null, existe: false, conSesion: true, esAdmin: true })).toEqual({ destino: "/dashboard", cookie: false });
  });

  it("la hoja toma sólo códigos válidos, sin repetir", () => {
    expect(codigosDeLaHoja("k7p2,M3XA,,k7p2,<x>")).toEqual(["K7P2", "M3XA"]);
    expect(codigosDeLaHoja(Array.from({ length: 300 }, (_, i) => `A${String(i).padStart(3, "0")}`).join(","))).toHaveLength(200);
  });

  it("la hoja lleva cada código con su QR a /q/<código>, de a diez por A4", async () => {
    const codigos = Array.from({ length: 12 }, (_, i) => `C${String(i).padStart(3, "0")}`);
    const html = await hojaDePegatinas(codigos, "https://vector.fdiaznem.com.ar");
    expect(html.match(/class="pegatina"/g)).toHaveLength(12);
    expect(html.match(/class="hoja"/g)).toHaveLength(2);
    expect(html).toContain(">C011<");
    // Un QR por pegatina: el trazo oscuro de cada uno.
    expect(html.match(/<path stroke="#18181b"/g)).toHaveLength(12);
  });
});

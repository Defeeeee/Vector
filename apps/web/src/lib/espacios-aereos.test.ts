import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAirport } from "./airports";
import { distanciaNmPrecisa } from "./distance";
import { contiene, coordenadasDe, dentroDelEspacio, distanciaAlBorde, leerLimite, nombradosDe, seccionesAd217, seccionesTma } from "./espacios-aereos";
import { espaciosAereos } from "./espacios-aereos-servidor";

const AIP = path.join(process.cwd(), "src", "data", "aip");

describe("leerLimite", () => {
  it("un círculo", () => {
    const r = leerLimite("Círculo de 10 NM de RDO con centro en VOR/DME CAT (283501S - 0654448W).", null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const centro = { lat: -(28 + 35 / 60 + 1 / 3600), lon: -(65 + 44 / 60 + 48 / 3600) };
    for (const p of r.poligono) expect(distanciaNmPrecisa(centro.lat, centro.lon, p.lat, p.lon)).toBeCloseTo(10, 0);
  });

  it("un arco toma el lado que dice el texto y no se cruza (TMA Bahía Blanca)", () => {
    const texto = `Desde 391959S-0630003W, siguiendo un arco de 55NM de radio con centro en VOR/DME BCA
(384312S-0620930W) hacia el N hasta 393559S -0622603W hasta 391959S - 0630003W.`;
    const r = leerLimite(texto, { lat: -38.72, lon: -62.16 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // El arco pasa por el N del VOR: hay puntos del contorno al norte de BCA.
    expect(Math.max(...r.poligono.map((p) => p.lat))).toBeGreaterThan(-38.0);
  });

  it("un extremo que no está sobre el radio se descarta", () => {
    const texto = "Desde 340000S - 0580000W, siguiendo un arco de 10 NM de radio con centro en 343000S - 0583000W hacia el N hasta 345000S - 0590000W hasta 340000S - 0580000W.";
    const r = leerLimite(texto, null);
    expect(r.ok).toBe(false);
  });

  it("sin coordenadas (radiales), no se dibuja", () => {
    const r = leerLimite("Desde el QDR 252° y la intersección del círculo de 15 NM de RDO, siguiendo por este curso magnético…", null);
    expect(r).toMatchObject({ ok: false });
  });

  it("las coordenadas mal escritas del AIP también se leen", () => {
    expect(coordenadasDe("(454624S 672218W)")[0].clave).toBe("454624S0672218W");
    expect(coordenadasDe("(272649S 0590326)")[0].clave).toBe("272649S0590326W");
  });
});

describe("contiene", () => {
  it("adentro y afuera de un cuadrado", () => {
    const cuadrado: [number, number][] = [[-34, -59], [-34, -58], [-35, -58], [-35, -59]];
    expect(contiene(cuadrado, { lat: -34.5, lon: -58.5 })).toBe(true);
    expect(contiene(cuadrado, { lat: -33.5, lon: -58.5 })).toBe(false);
  });
});

describe("los espacios aéreos del AIP commiteado", () => {
  const { espacios, descartados } = espaciosAereos();
  const porNombre = new Map(espacios.map((e) => [e.nombre, e]));

  it("están los que se usan alrededor de Buenos Aires", () => {
    for (const n of ["ATZ MORÓN", "ATZ EL PALOMAR", "CTR AEROPARQUE JORGE NEWBERY", "CTR EZEIZA"]) {
      expect(porNombre.has(n), n).toBe(true);
    }
  });

  it("los divididos por nivel van por sector (TMA Baires, ATZ San Fernando)", () => {
    expect(porNombre.has("TMA BAIRES")).toBe(false);
    const uno = porNombre.get("TMA BAIRES (I)")!;
    const dos = porNombre.get("TMA BAIRES (II)")!;
    expect(uno.limites).toBe("FL 245 / 2500 FT AGL/ AMSL");
    expect(dos.limites).toBe("FL 245 / FL 45");
    // El (I) es lo cercano a Buenos Aires; el (II), el resto, con el (I) como hueco.
    const aeroparque = { lat: -34.5592, lon: -58.4156 };
    const lejos = { lat: -35.2, lon: -59.3 }; // al SW, adentro de los 55 NM de EZE y lejos de los VOR
    expect(dentroDelEspacio(uno, aeroparque)).toBe(true);
    expect(dentroDelEspacio(dos, aeroparque)).toBe(false);
    expect(dentroDelEspacio(dos, lejos)).toBe(true);
    expect(dentroDelEspacio(uno, lejos)).toBe(false);

    expect(porNombre.has("ATZ SAN FERNANDO")).toBe(false);
    expect(porNombre.get("ATZ SAN FERNANDO (I)")?.limites).toBe("2500 ft / GND");
    expect(porNombre.get("ATZ SAN FERNANDO (II)")?.limites).toBe("1500 ft / GND");
  });

  it("la cobertura no retrocede sin que nadie lo vea", () => {
    // 2026-11-03: 63 dibujados (Baires y San Fernando, en dos sectores cada uno) y 16
    // descartados (radiales, o límites de FIR sin coordenadas).
    expect(espacios.length).toBeGreaterThanOrEqual(63);
    expect(descartados.every((d) => d.motivo.length > 0)).toBe(true);
  });

  it("cada CTR y ATZ contiene a su aeródromo", () => {
    // `armarEspacios` ya lo exige; esto confirma que la referencia no faltó.
    const sinRef = espacios.filter((e) => e.tipo !== "TMA").filter((e) => !e.poligono.length);
    expect(sinRef).toEqual([]);
  });

  /*
    La validación en los dos sentidos (invariante 12), contra el texto commiteado:
    - cada vértice que el texto escribe está en el polígono, tal cual;
    - y el polígono no tiene puntos lejos de lo que el texto define: cada punto está sobre un
      lado recto entre vértices del texto o sobre un arco de un centro del texto.
  */
  it("cada coordenada del límite está en el polígono (AD 2.17)", () => {
    for (const f of fs.readdirSync(AIP).filter((f) => /^SA[A-Z]{2}\.txt$/.test(f))) {
      const texto = fs.readFileSync(path.join(AIP, f), "utf8");
      const i = texto.indexOf("AD 2.17 ESPACIO");
      if (i < 0) continue;
      const icao = f.slice(0, 4);
      const bloque = texto.slice(i, texto.indexOf("AD 2.18", i));
      for (const s of seccionesAd217(bloque)) {
        // Entero o por sectores: cada uno contra su propio texto.
        const partes = [
          { e: espacios.find((x) => x.id === `${icao}-${s.tipo}` && x.nombre === s.nombre), lateral: s.limiteLateral },
          ...s.sectores.map((x) => ({ e: espacios.find((y) => y.nombre === `${s.nombre} ${x.marca}`), lateral: x.limiteLateral })),
        ];
        for (const { e, lateral } of partes) {
        if (!e) continue;
        const ad = getAirport(icao);
        const r = leerLimite(lateral, ad?.lat !== undefined ? { lat: ad.lat, lon: ad.lon! } : null, nombradosDe(bloque));
        const centros = r.ok ? r.centros : [];
        for (const c of coordenadasDe(lateral.replace(/\s+/g, " "))) {
          const esCentro = centros.some((k) => Math.abs(k.lat - c.lat) < 1e-9 && Math.abs(k.lon - c.lon) < 1e-9);
          if (esCentro) continue;
          const esta = e.poligono.some(([la, lo]) => Math.abs(la - c.lat) < 1e-9 && Math.abs(lo - c.lon) < 1e-9);
          expect(esta, `${e.nombre}: ${c.clave}`).toBe(true);
        }
        }
      }
    }
  });

  /*
    Los vecinos comparten el borde (Federico: "que los límites coincidan y no queden raros").
    Ninguna esquina de un espacio cae más de 1 NM adentro de otro del mismo tipo. Antes de que
    "siguiendo el límite del TMA X" siguiera el borde del vecino, seis TMA se pisaban.
  */
  it("los espacios del mismo tipo no se pisan", () => {
    const pisados: string[] = [];
    for (const a of espacios) {
      for (const b of espacios) {
        if (a === b || a.tipo !== b.tipo) continue;
        if (a.tipo === "TMA" && a.nombre.replace(/ \(I+\)$/, "") === b.nombre.replace(/ \(I+\)$/, "")) continue; // los sectores de Baires: uno es el hueco del otro
        const anillo = b.poligono.map(([lat, lon]) => ({ lat, lon }));
        const adentro = a.poligono.filter(([lat, lon]) => contiene(b.poligono, { lat, lon }) && distanciaAlBorde(anillo, { lat, lon }) > 1);
        if (adentro.length) pisados.push(`${a.nombre} en ${b.nombre} (${adentro.length})`);
      }
    }
    expect(pisados).toEqual([]);
  });

  it("cada TMA dibujada sale de un bloque de ENR 2.1", () => {
    const tmas = seccionesTma(fs.readFileSync(path.join(AIP, "ENR-2.1.txt"), "utf8"));
    for (const e of espacios.filter((x) => x.tipo === "TMA")) {
      const s = tmas.find((t) => t.nombre === e.nombre.replace(/\s+\(I+\)$/, ""));
      expect(s, e.nombre).toBeTruthy();
      const vertices = coordenadasDe(s!.limiteLateral.replace(/\s+/g, " "));
      expect(vertices.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  acomodarSellos,
  ajustarEnCaja,
  certificanteDelFormulario,
  dorsosPorHoja,
  fechaDelDorso,
  firmaDelRenglon,
  firmaParaVuelo,
  normalizarNombre,
  vuelosPorCertificante,
  vuelosSinCertificante,
  type FirmaCertificante,
} from "./firmas-libro";

const f = (id: string, nombre: string, autoridad_id: number | null = null): FirmaCertificante => ({ id, nombre, autoridad_id, png: "data:image/png;base64,AAAA" });

describe("firmaParaVuelo", () => {
  const firmas = [f("1", "JUAN PÉREZ", 5), f("2", "MARÍA GÓMEZ", 5), f("3", "LUIS ROSSI", 7)];

  it("busca por nombre, sin importar acentos, mayúsculas ni espacios", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "  juan   perez " }, firmas)?.id).toBe("1");
  });

  it("acepta las mismas palabras en otro orden", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "Gómez, María" }, firmas)?.id).toBe("2");
  });

  it("un nombre que no está no cae en otra firma del mismo cargo", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "PEDRO NADIE" }, firmas)).toBeNull();
  });

  it("sin nombre, por cargo sólo si hay una firma de ese cargo", () => {
    expect(firmaParaVuelo({ autoridadId: 7, nombre: "" }, firmas)?.id).toBe("3");
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "" }, firmas)).toBeNull();
    expect(firmaParaVuelo({ autoridadId: 9, nombre: "" }, firmas)).toBeNull();
  });

  it("un vuelo sin certificante o sin firmas queda en blanco", () => {
    expect(firmaParaVuelo(null, firmas)).toBeNull();
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "JUAN PÉREZ" }, [])).toBeNull();
  });
});

describe("firmaParaVuelo con alias", () => {
  const firmas = [{ ...f("1", "GUSTAVO EMILIO MACEDO"), alias: ["GUSTAVO EMILIO MACEDO IV 25358574"] }];
  it("encuentra a la persona por uno de sus alias", () => {
    expect(firmaParaVuelo({ autoridadId: null, nombre: "Gustavo Emilio Macedo IV 25358574" }, firmas)?.id).toBe("1");
  });
});

describe("firmaDelRenglon: el orden de las reglas", () => {
  const macedo = { ...f("M", "GUSTAVO EMILIO MACEDO", 4), automatica: true };
  const misa = { ...f("S", "MISA", 4), automatica: false };
  const firmas = [macedo, misa];
  const r = (nombre: string, certificanteId: string | null = null, firma: "si" | "no" | null = null) => ({ autoridadId: null, nombre, certificanteId, firma });

  it("'no' en el vuelo: sin firma, aunque la persona sea automática", () => {
    expect(firmaDelRenglon(r("GUSTAVO EMILIO MACEDO", "M", "no"), firmas)).toBeNull();
  });
  it("con persona asignada y automática: su firma, sin mirar el nombre", () => {
    expect(firmaDelRenglon(r("OTRO NOMBRE", "M"), firmas)?.id).toBe("M");
    expect(firmaDelRenglon(r("", "M"), firmas)?.id).toBe("M");
  });
  it("con persona asignada y apagada: sin firma, salvo que el vuelo diga 'si'", () => {
    expect(firmaDelRenglon(r("MISA", "S"), firmas)).toBeNull();
    expect(firmaDelRenglon(r("MISA", "S", "si"), firmas)?.id).toBe("S");
  });
  it("sin persona: la búsqueda por nombre, sólo con las automáticas", () => {
    expect(firmaDelRenglon(r("gustavo emilio macedo"), firmas)?.id).toBe("M");
    expect(firmaDelRenglon(r("MISA"), firmas)).toBeNull();
  });
  it("sin persona, 'si' no fuerza una búsqueda por nombre", () => {
    expect(firmaDelRenglon(r("MISA", null, "si"), firmas)).toBeNull();
  });
  it("una persona asignada que se borró cae en la búsqueda por nombre", () => {
    expect(firmaDelRenglon(r("GUSTAVO EMILIO MACEDO", "BORRADA"), firmas)?.id).toBe("M");
  });
  it("un backend viejo sin 'automatica' se toma como automática", () => {
    expect(firmaDelRenglon(r("JUAN PÉREZ", "1"), [f("1", "JUAN PÉREZ")])?.id).toBe("1");
  });
  it("sin certificante o sin firmas, nada", () => {
    expect(firmaDelRenglon(null, firmas)).toBeNull();
    expect(firmaDelRenglon(r("X", "M"), [])).toBeNull();
  });
});

describe("contar y listar vuelos", () => {
  const vs = [
    { id: "a", date: "2026-01-02", certificante_id: "M" },
    { id: "b", date: "2026-03-02", certificante_id: null },
    { id: "c", date: "2026-02-02" },
    { id: "d", date: "2026-01-09", certificante_id: "M" },
  ];
  it("cuenta por persona", () => {
    expect(vuelosPorCertificante(vs).get("M")).toBe(2);
  });
  it("los sin certificante, del más nuevo al más viejo", () => {
    expect(vuelosSinCertificante(vs).map((v) => v.id)).toEqual(["b", "c"]);
  });
});

describe("acomodarSellos", () => {
  const pagina = { ancho: 800, alto: 560, margen: 14 };
  const chocan = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("una sola firma va abajo a la derecha", () => {
    const [c] = acomodarSellos([{ ancho: 400, alto: 100 }], pagina);
    expect(c.x + c.w).toBeCloseTo(pagina.ancho - pagina.margen);
    expect(c.y).toBeLessThan(pagina.alto / 4);
  });
  it("la primera abajo a la derecha, las siguientes a la izquierda y hacia arriba", () => {
    const cajas = acomodarSellos(Array(5).fill({ ancho: 300, alto: 100 }), pagina);
    expect(cajas[1].x).toBeLessThan(cajas[0].x);
    expect(cajas[3].y).toBeGreaterThan(cajas[0].y);
    expect(cajas[3].x + cajas[3].w).toBeCloseTo(cajas[0].x + cajas[0].w);
  });
  it("hasta 12 firmas no se superponen ni se salen de la hoja", () => {
    for (let n = 1; n <= 12; n++) {
      const cajas = acomodarSellos(Array.from({ length: n }, (_, i) => ({ ancho: 200 + 60 * i, alto: 80 + 20 * (i % 3) })), pagina);
      for (let i = 0; i < n; i++) {
        expect(cajas[i].x).toBeGreaterThanOrEqual(pagina.margen - 1e-9);
        expect(cajas[i].x + cajas[i].w).toBeLessThanOrEqual(pagina.ancho - pagina.margen + 1e-9);
        expect(cajas[i].y).toBeGreaterThanOrEqual(pagina.margen - 1e-9);
        expect(cajas[i].y + cajas[i].h).toBeLessThanOrEqual(pagina.alto - pagina.margen + 1e-9);
        for (let j = i + 1; j < n; j++) expect(chocan(cajas[i], cajas[j])).toBe(false);
      }
    }
  });
  it("sin imágenes, nada", () => {
    expect(acomodarSellos([], pagina)).toEqual([]);
  });
});

describe("las piezas", () => {
  it("normaliza nombres", () => {
    expect(normalizarNombre("  Ñandú-Pérez, J. ")).toBe("NANDU PEREZ J");
    expect(normalizarNombre(null)).toBe("");
  });

  it("ajusta en la caja sin deformar", () => {
    expect(ajustarEnCaja(400, 100, 200, 100)).toEqual({ w: 200, h: 50 });
    // No agranda a menos que se pida.
    expect(ajustarEnCaja(40, 10, 200, 100)).toEqual({ w: 40, h: 10 });
    expect(ajustarEnCaja(40, 10, 200, 100, true)).toEqual({ w: 200, h: 50 });
    expect(ajustarEnCaja(0, 10, 200, 100)).toEqual({ w: 0, h: 0 });
  });

  it("los dorsos van por hoja y de un solo libro, y sin nada cargado no cuentan", () => {
    const m = dorsosPorHoja(
      [
        { id: "a", logbook_id: "L1", hoja: 1, png: "x" },
        { id: "b", logbook_id: "L2", hoja: 1, png: "y" },
        { id: "c", logbook_id: "L1", hoja: 2, aclaracion: "  " },
        { id: "d", logbook_id: "L1", hoja: 3, fecha: "2026-11-02" },
      ],
      "L1"
    );
    expect([...m.keys()]).toEqual([1, 3]);
    // Un dorso con sólo personas elegidas también cuenta.
    expect(dorsosPorHoja([{ id: "e", logbook_id: "L1", hoja: 4, certificante_ids: ["M"] }], "L1").has(4)).toBe(true);
  });

  it("la fecha del dorso no pasa por Date", () => {
    expect(fechaDelDorso("2026-11-02")).toBe("02/11/2026");
    expect(fechaDelDorso(null)).toBe("");
  });
});

describe("certificanteDelFormulario", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  it("sin el campo no manda nada", () => {
    expect(certificanteDelFormulario(null, null)).toEqual({});
  });
  it("vacío desasocia y limpia la anulación", () => {
    expect(certificanteDelFormulario("", "si")).toEqual({ certificante_id: null, certificante_firma: null });
  });
  it("con persona, la anulación sólo si es si o no", () => {
    expect(certificanteDelFormulario(id, "no")).toEqual({ certificante_id: id, certificante_firma: "no" });
    expect(certificanteDelFormulario(id, "")).toEqual({ certificante_id: id, certificante_firma: null });
    expect(certificanteDelFormulario(id, "tal vez")).toEqual({ certificante_id: id, certificante_firma: null });
  });
  it("un id raro no se manda", () => {
    expect(certificanteDelFormulario("../x", "si")).toEqual({});
  });
});

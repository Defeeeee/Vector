import { describe, expect, it } from "vitest";
import {
  acomodarDorso,
  bloquesDelDorso,
  CAJA_SELLO,
  MM,
  ajustarEnCaja,
  certificanteDelFormulario,
  dorsosPorHoja,
  fechaDelDorso,
  firmaDelRenglon,
  firmaParaVuelo,
  nombreDeSello,
  normalizarNombre,
  opcionesDeCertificante,
  repartirPorSello,
  SEGUN_CARGO,
  selloParaCargo,
  sellosDeLosVuelos,
  valorDeOpcion,
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

describe("acomodarDorso: a tamaño real, desde arriba a la izquierda", () => {
  // La hoja del libro: 35,5 × 16,5 cm, margen de 0,5 cm.
  const CM = 28.3465;
  const pagina = { ancho: 35.5 * CM, alto: 16.5 * CM, margen: 0.5 * CM };
  type Caja = { x: number; y: number; w: number; h: number };
  const chocan = (a: Caja, b: Caja) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
  const mm = (pt: number) => pt / MM;
  // Una medida de mentira: 0,5 × tamaño por letra, partido por palabras.
  const medir = (texto: string, ancho: number, tamano: number) => {
    const lineas: string[] = [];
    let actual = "";
    for (const p of texto.split(/\s+/)) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (prueba.length * tamano * 0.5 <= ancho || !actual) actual = prueba;
      else (lineas.push(actual), (actual = p));
    }
    if (actual) lineas.push(actual);
    return lineas;
  };
  const foto = { imagen: { ancho: 1200, alto: 500 } };
  const solo = (bloques: Parameters<typeof acomodarDorso>[0], pag = pagina) => acomodarDorso(bloques, pag, medir);
  // La caja de un bloque entero (texto e imagen), para ver que no se pisen.
  const cajaDe = (b: ReturnType<typeof acomodarDorso>[number]): Caja => {
    const ys = [...b.renglones.map((r) => r.y), ...(b.imagen ? [b.imagen.y, b.imagen.y + b.imagen.h] : [])];
    const tope = b.renglones.length ? b.renglones[0].y + b.tamano : b.imagen!.y + b.imagen!.h;
    const x = b.imagen?.x ?? b.renglones[0].x;
    // El ancho: el de la imagen o el del renglón más largo (con la medida de mentira).
    const w = Math.max(b.imagen?.w ?? 0, ...b.renglones.map((r) => r.texto.length * b.tamano * 0.5));
    return { x, y: Math.min(...ys) - (b.renglones.length && !b.imagen ? b.tamano * 0.3 : 0), w, h: tope - Math.min(...ys) };
  };

  it("la caja de una firma es de 70 × 35 mm", () => {
    expect(mm(CAJA_SELLO.ancho)).toBeCloseTo(70);
    expect(mm(CAJA_SELLO.alto)).toBeCloseTo(35);
  });
  it("una sola firma va arriba a la izquierda y no pasa de 7 × 3,5 cm", () => {
    const [b] = solo([foto]);
    expect(b.imagen!.x).toBeCloseTo(pagina.margen);
    expect(b.imagen!.y + b.imagen!.h).toBeGreaterThan(pagina.alto * 0.8);
    expect(mm(b.imagen!.w)).toBeCloseTo(70);
    expect(b.imagen!.w / b.imagen!.h).toBeCloseTo(1200 / 500);
  });
  it("una imagen alta se ajusta por el alto, y una chica no se agranda", () => {
    expect(mm(solo([{ imagen: { ancho: 400, alto: 800 } }])[0].imagen!.h)).toBeCloseTo(35);
    expect(solo([{ imagen: { ancho: 60, alto: 25 } }])[0].imagen!.w).toBeCloseTo(60);
  });
  it("la segunda va a la derecha de la primera, a la misma altura; cuando no entran, la fila sigue abajo", () => {
    const bs = solo(Array(6).fill(foto));
    expect(bs[1].imagen!.x).toBeGreaterThan(bs[0].imagen!.x);
    expect(bs[1].imagen!.y).toBeCloseTo(bs[0].imagen!.y);
    const abajo = bs.find((b) => b.imagen!.y < bs[0].imagen!.y - 1)!;
    expect(abajo).toBeDefined();
    expect(abajo.imagen!.x).toBeCloseTo(pagina.margen);
  });
  it("el texto va arriba de su firma, en el ancho de la columna", () => {
    const texto = "EN EL DÍA DE LA FECHA 12/03/26 EL TITULAR DEL PRESENTE LIBRO QUEDA HABILITADO PARA TRANSPORTAR PASAJEROS";
    const [b, c] = solo([{ ...foto, texto }, foto]);
    expect(b.renglones.length).toBeGreaterThan(1);
    for (const r of b.renglones) {
      expect(r.y).toBeGreaterThan(b.imagen!.y + b.imagen!.h);
      expect(r.texto.length * b.tamano * 0.5).toBeLessThanOrEqual(CAJA_SELLO.ancho + 1e-6);
    }
    // La firma de al lado, sin texto, arranca arriba de su celda: más alta que la que lleva texto.
    expect(c.imagen!.y + c.imagen!.h).toBeGreaterThan(b.imagen!.y + b.imagen!.h);
  });
  it("un texto sin firma ocupa su lugar en la grilla", () => {
    const [a, b] = solo([foto, { texto: "Readaptación en vuelo nocturno" }]);
    expect(b.imagen).toBeNull();
    expect(b.renglones[0].x).toBeGreaterThan(a.imagen!.x);
  });
  it("de 1 a 16 bloques, con y sin texto: entran en la hoja y no se pisan", () => {
    for (const n of [1, 2, 4, 5, 8, 12, 16]) {
      const bs = solo(Array.from({ length: n }, (_, i) => (i % 3 === 0 ? { ...foto, texto: "Habilitado para transportar pasajeros ".repeat(1 + (i % 2)) } : i % 3 === 1 ? foto : { imagen: { ancho: 900, alto: 460 } })));
      expect(bs).toHaveLength(n);
      const cajas = bs.map(cajaDe);
      for (let i = 0; i < n; i++) {
        if (bs[i].imagen) {
          expect(mm(bs[i].imagen!.w)).toBeLessThanOrEqual(70 + 1e-6);
          expect(mm(bs[i].imagen!.h)).toBeLessThanOrEqual(35 + 1e-6);
          expect(bs[i].imagen!.y).toBeGreaterThanOrEqual(pagina.margen - 1e-6);
        }
        expect(cajas[i].x).toBeGreaterThanOrEqual(pagina.margen - 1e-9);
        expect(cajas[i].x + cajas[i].w).toBeLessThanOrEqual(pagina.ancho - pagina.margen + 1e-6);
        expect(cajas[i].y + cajas[i].h).toBeLessThanOrEqual(pagina.alto - pagina.margen + 1e-6);
        for (let j = i + 1; j < n; j++) expect(chocan(cajas[i], cajas[j])).toBe(false);
      }
    }
  });
  it("en esta hoja, 12 firmas sin texto entran sin achicarse", () => {
    const bs = solo(Array(12).fill(foto));
    expect(Math.max(...bs.map((b) => b.imagen!.w))).toBeCloseTo(CAJA_SELLO.ancho);
  });
  it("si no entran, se achica todo junto (nunca se agranda)", () => {
    const chica = { ancho: 300, alto: 150, margen: 10 };
    const bs = solo(Array(12).fill(foto), chica);
    for (const b of bs) {
      expect(b.imagen!.w).toBeLessThan(CAJA_SELLO.ancho);
      expect(b.imagen!.y).toBeGreaterThanOrEqual(0);
    }
  });
  it("con una franja reservada abajo, nada baja de ella", () => {
    const bs = acomodarDorso(Array(12).fill(foto), { ...pagina, reservaAbajo: 70 }, medir);
    for (const b of bs) expect(b.imagen!.y).toBeGreaterThanOrEqual(pagina.margen + 70 - 1e-6);
  });
  it("sin bloques, nada", () => {
    expect(solo([])).toEqual([]);
  });
});

describe("bloquesDelDorso: cada texto arriba de su firma", () => {
  const S1 = "11111111-1111-1111-1111-111111111111";
  const S2 = "22222222-2222-2222-2222-222222222222";
  const fotos = [{ id: "f2", png: "", orden: 1 }, { id: "f1", png: "", orden: 0 }];
  it("fotos por orden, después los sellos elegidos, y los textos sin firma al final", () => {
    const b = bloquesDelDorso({ fotos, sello_ids: [S1], textos: [{ texto: "Suelto" }, { texto: "Con la foto", firma: "foto:f1" }] }, new Set([S1]));
    expect(b).toEqual([
      { firma: "foto:f1", texto: "Con la foto" },
      { firma: "foto:f2", texto: null },
      { firma: `sello:${S1}`, texto: null },
      { firma: null, texto: "Suelto" },
    ]);
  });
  it("un texto avalado por un sello no elegido suma ese sello", () => {
    const b = bloquesDelDorso({ textos: [{ texto: "Habilitado", firma: `sello:${S2}` }] }, new Set([S1, S2]));
    expect(b).toEqual([{ firma: `sello:${S2}`, texto: "Habilitado" }]);
  });
  it("dos textos con la misma firma van juntos, uno abajo del otro", () => {
    const b = bloquesDelDorso({ fotos: [fotos[1]], textos: [{ texto: "Uno", firma: "foto:f1" }, { texto: "Dos", firma: "foto:f1" }] }, new Set());
    expect(b).toEqual([{ firma: "foto:f1", texto: "Uno\nDos" }]);
  });
  it("si la firma ya no existe, el texto no se pierde: va solo", () => {
    const b = bloquesDelDorso({ textos: [{ texto: "Sin su foto", firma: "foto:borrada" }, { texto: "Sin su sello", firma: `sello:${S2}` }] }, new Set([S1]));
    expect(b).toEqual([{ firma: null, texto: "Sin su foto" }, { firma: null, texto: "Sin su sello" }]);
  });
  it("no pasa de 12 firmas", () => {
    const muchas = Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, png: "", orden: i }));
    expect(bloquesDelDorso({ fotos: muchas }, new Set()).filter((b) => b.firma)).toHaveLength(12);
  });
});

describe("sellos por cargo", () => {
  const jefe = { id: "s1", etiqueta: "Jefe de instructores", autoridad_id: 6, orden: 0 };
  const iv = { id: "s2", etiqueta: "Instructor de vuelo", autoridad_id: 5, orden: 1 };
  const libre = { id: "s3", etiqueta: "Con sello", autoridad_id: null, orden: 2 };
  it("el sello de un vuelo es el del mismo cargo", () => {
    expect(selloParaCargo([jefe, iv], 6)?.id).toBe("s1");
    expect(selloParaCargo([jefe, iv], 5)?.id).toBe("s2");
  });
  it("sin el cargo, el que no declara cargo; si no hay, ninguno", () => {
    expect(selloParaCargo([jefe, iv, libre], 9)?.id).toBe("s3");
    expect(selloParaCargo([jefe, iv], 9)).toBeNull();
    expect(selloParaCargo(undefined, 6)).toBeNull();
  });
  const macedo = { id: "p1", nombre: "GUSTAVO EMILIO MACEDO", sellos: [iv, jefe] };
  const sola = { id: "p2", nombre: "PEDRO", sellos: [] };
  it("una opción por sello, con el cargo en el nombre, en orden", () => {
    expect(opcionesDeCertificante([macedo, sola]).map((o) => [o.valor, o.texto])).toEqual([
      ["p1|s1", "GUSTAVO EMILIO MACEDO · Jefe de instructores"],
      ["p1|s2", "GUSTAVO EMILIO MACEDO · Instructor de vuelo"],
      ["p2", "PEDRO"],
    ]);
  });
  it("para varios vuelos suma 'según el cargo de cada vuelo' sólo a quien tiene varios sellos", () => {
    const una = { id: "p3", nombre: "ANA", sellos: [libre] };
    const o = opcionesDeCertificante([macedo, una], { segunCargo: true }).map((x) => x.valor);
    expect(o).toEqual(["p1|auto", "p1|s1", "p1|s2", "p3|s3"]);
  });
  it("reparte los vuelos entre los sellos según su cargo del CAD", () => {
    const vs = [
      { id: "v1", cad_autoridad_id: 6 },
      { id: "v2", cad_autoridad_id: 5 },
      { id: "v3", cad_autoridad_id: 6 },
      { id: "v4", cad_autoridad_id: 9 },
    ];
    expect(repartirPorSello(vs, [jefe, iv], SEGUN_CARGO)).toEqual([
      { selloId: "s1", ids: ["v1", "v3"] },
      { selloId: "s2", ids: ["v2"] },
      { selloId: null, ids: ["v4"] },
    ]);
    expect(repartirPorSello(vs, [jefe, iv], "s2")).toEqual([{ selloId: "s2", ids: ["v1", "v2", "v3", "v4"] }]);
    expect(repartirPorSello(vs, undefined, null)).toEqual([{ selloId: null, ids: ["v1", "v2", "v3", "v4"] }]);
  });
  it("la opción de un vuelo: su sello, o el del cargo, o el primero", () => {
    expect(valorDeOpcion([macedo], "p1", "s2")).toBe("p1|s2");
    expect(valorDeOpcion([macedo], "p1", null, 5)).toBe("p1|s2");
    expect(valorDeOpcion([macedo], "p1", null, 99)).toBe("p1|s1");
    expect(valorDeOpcion([sola], "p2", null)).toBe("p2");
    expect(valorDeOpcion([macedo], null, null)).toBe("");
  });
  it("el nombre de un sello sólo lleva el cargo si la persona tiene sellos", () => {
    expect(nombreDeSello(macedo, jefe)).toBe("GUSTAVO EMILIO MACEDO · Jefe de instructores");
    expect(nombreDeSello(sola, null)).toBe("PEDRO");
  });
  it("los sellos de los vuelos de una hoja, sin repetir y en orden", () => {
    expect(sellosDeLosVuelos([{ certificante_sello_id: "s1" }, { certificante_sello_id: null }, { certificante_sello_id: "s2" }, { certificante_sello_id: "s1" }, {}])).toEqual(["s1", "s2"]);
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
        { id: "a", logbook_id: "L1", hoja: 1, fotos: [{ id: "f1", png: "x" }] },
        { id: "b", logbook_id: "L2", hoja: 1, fotos: [{ id: "f2", png: "y" }] },
        { id: "c", logbook_id: "L1", hoja: 2, aclaracion: "  " },
        { id: "d", logbook_id: "L1", hoja: 3, fecha: "2026-11-02" },
      ],
      "L1"
    );
    expect([...m.keys()]).toEqual([1, 3]);
    // Un dorso con sólo sellos elegidos también cuenta.
    expect(dorsosPorHoja([{ id: "e", logbook_id: "L1", hoja: 4, sello_ids: ["M"] }], "L1").has(4)).toBe(true);
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
    expect(certificanteDelFormulario("", "si")).toEqual({ certificante_id: null, certificante_firma: null, certificante_sello_id: null });
  });
  it("con persona, la anulación sólo si es si o no", () => {
    expect(certificanteDelFormulario(id, "no")).toEqual({ certificante_id: id, certificante_firma: "no", certificante_sello_id: null });
    expect(certificanteDelFormulario(id, "")).toEqual({ certificante_id: id, certificante_firma: null, certificante_sello_id: null });
    expect(certificanteDelFormulario(id, "tal vez")).toEqual({ certificante_id: id, certificante_firma: null, certificante_sello_id: null });
  });
  it("el sello viaja con la persona, y uno raro no se manda", () => {
    const sello = "22222222-2222-2222-2222-222222222222";
    expect(certificanteDelFormulario(id, "", sello)).toEqual({ certificante_id: id, certificante_firma: null, certificante_sello_id: sello });
    expect(certificanteDelFormulario(id, "", "../x").certificante_sello_id).toBeNull();
    expect(certificanteDelFormulario("", "", sello).certificante_sello_id).toBeNull();
  });
  it("un id raro no se manda", () => {
    expect(certificanteDelFormulario("../x", "si")).toEqual({});
  });
});

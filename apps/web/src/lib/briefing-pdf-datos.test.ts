import { describe, expect, it } from "vitest";
import {
  MAX_NOTAMS,
  armarEstacion,
  armarResumenPiloto,
  cortar,
  envolver,
  fechaCorta,
  fechaHoraUtc,
  fechasLegibles,
  lineasDeEspacios,
  lineasDelPiloto,
  nombreBriefing,
  type EstacionBriefing,
} from "./briefing-pdf-datos";
import type { Aircraft, Flight, PilotDocument, Profile } from "@/types";

const AHORA = new Date("2026-11-11T14:05:00Z");

const doc = (kind: string, name: string, expiry: string | null): PilotDocument =>
  ({ id: name, user_id: "u", kind, blocking: "nada", name, expiry_date: expiry }) as unknown as PilotDocument;

const perfil = { id: "u", first_name: "A", last_name: "B", license_type: "PPA" } as Profile;
const documentos = [
  doc("cma", "CMA clase 2", "2027-03-12"),
  doc("repaso_vuelo", "Repaso de vuelo", "2027-01-05"),
];

describe("fechas a mano", () => {
  it("escribe en UTC sin toLocaleString", () => {
    expect(fechaHoraUtc(AHORA)).toBe("11/11/2026 14:05 UTC");
    expect(fechaCorta("2027-03-12")).toBe("12/03/2027");
    expect(fechaCorta("2027-03-12T00:00:00Z")).toBe("12/03/2027");
    expect(fechasLegibles("vence el 2026-12-01 y el 2027-01-02")).toBe("vence el 01/12/2026 y el 02/01/2027");
  });
});

describe("armarResumenPiloto", () => {
  it("con todo leído responde con pilotStatus y lista vencimientos", () => {
    const r = armarResumenPiloto({ profile: perfil, documents: documentos, flights: [], aircraft: [], unavailable: [] }, AHORA);
    expect(r.puede).toBeTruthy();
    expect(r.noLeido).toEqual([]);
    expect(r.items.map((i) => i.etiqueta)).toContain("CMA clase 2");
    expect(r.items.find((i) => i.etiqueta === "CMA clase 2")?.valor).toContain("12/03/2027");
  });

  it("invariante 2: si algo no se pudo leer NO hay respuesta, y se dice qué", () => {
    for (const seccion of ["documents", "flights", "profile", "aircraft"]) {
      const r = armarResumenPiloto(
        { profile: perfil, documents: documentos, flights: [], aircraft: [], unavailable: [seccion] },
        AHORA
      );
      expect(r.puede).toBeNull();
      expect(r.noLeido.length).toBe(1);
      const l = lineasDelPiloto(r).lineas.join(" ");
      expect(l).toContain("No se pudo leer");
      expect(l.toLowerCase()).not.toContain("podés volar como");
    }
  });

  it("sin perfil tampoco responde", () => {
    const r = armarResumenPiloto({ profile: null, documents: [], flights: [], aircraft: [], unavailable: [] }, AHORA);
    expect(r.puede).toBeNull();
    expect(r.noLeido).toEqual(["tu perfil"]);
  });

  it("sin CMA cargado dice que no lo sabe, no que puede volar", () => {
    const r = armarResumenPiloto({ profile: perfil, documents: [], flights: [] as Flight[], aircraft: [] as Aircraft[], unavailable: [] }, AHORA);
    expect(r.puede).toContain("No podemos confirmar");
  });

  it("si no se leyó nada (null), la hoja no afirma nada", () => {
    expect(lineasDelPiloto(null).lineas.join(" ")).toContain("No se pudo leer");
  });

  it("las fechas ISO del detalle salen legibles", () => {
    const vencido = [doc("cma", "CMA", "2026-01-01"), ...documentos.slice(1)];
    const r = armarResumenPiloto({ profile: perfil, documents: vencido, flights: [], aircraft: [], unavailable: [] }, AHORA);
    expect(r.detalle ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

const base: EstacionBriefing = {
  codigo: "SADF",
  nombre: "San Fernando",
  climaRespondio: true,
  metar: "METAR SADF 111400Z 18008KT 9999 SCT030 24/14 Q1015=",
  taf: "TAF SADF 111100Z 1112/1212 18010KT 9999 SCT030=",
  observadoEn: null,
  estacionCercana: null,
  notams: [],
  notamsCapturadosEn: "2026-11-11T13:50:00Z",
  notamsFuente: "descarga",
};

describe("armarEstacion", () => {
  it("METAR reciente: sin avisos, con la hora de consulta", () => {
    const b = armarEstacion(base, AHORA);
    expect(b.avisos).toEqual([]);
    expect(b.metar).toContain("SADF");
    expect(b.fechaClima).toBe("METAR y TAF consultados a las 14:05 UTC.");
    expect(b.notaNotams).toBe("Sin NOTAM vigentes.");
    expect(b.fechaNotams).toContain("13:50 UTC");
    expect(b.fechaNotams).toContain("hace 15 min");
    expect(b.fechaNotams).toContain("descarga de ANAC");
  });

  it("METAR viejo avisa que no sirve", () => {
    const b = armarEstacion({ ...base, metar: "METAR SADF 110800Z 18008KT 9999 SCT030 24/14 Q1015=" }, AHORA);
    expect(b.avisos.join(" ")).toContain("METAR VIEJO");
  });

  it("invariante 2: NOTAM sin consultar no es 'sin NOTAM'", () => {
    const b = armarEstacion({ ...base, notams: null, notamsCapturadosEn: null }, AHORA);
    expect(b.notaNotams).toContain("No se pudo consultar");
    expect(b.notaNotams).not.toContain("Sin NOTAM");
    expect(b.notams).toEqual([]);
  });

  it("el clima que no contestó dice que no se pudo leer", () => {
    const b = armarEstacion({ ...base, climaRespondio: false, metar: null, taf: null }, AHORA);
    expect(b.notaClima).toContain("No se pudo leer");
    expect(b.fechaClima).toBe("");
  });

  it("METAR de otra estación se dice", () => {
    const b = armarEstacion({ ...base, estacionCercana: { icao: "SADP", name: "El Palomar", distanceNm: 12 } }, AHORA);
    expect(b.avisos[0]).toContain("SADP");
    expect(b.avisos[0]).toContain("12 NM");
  });

  it("NOTAM sin fecha de captura dice que no se sabe de cuándo son", () => {
    const b = armarEstacion(
      { ...base, notams: [{ code: "A1/26", from: "a", to: "b", textEsp: "x" }], notamsCapturadosEn: null },
      AHORA
    );
    expect(b.fechaNotams).toContain("No se sabe de cuándo");
  });

  it("corta la lista y el texto largo, diciéndolo", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ code: `A${i}/26`, from: "d", to: "h", textEsp: "palabra ".repeat(200) }));
    const b = armarEstacion({ ...base, notams: muchos }, AHORA);
    expect(b.notams).toHaveLength(MAX_NOTAMS);
    expect(b.notaNotams).toContain("Faltan 5");
    expect(b.notams[0].texto).toContain("cortado");
    expect(b.notams[0].texto.length).toBeLessThan(700);
  });

  it("saca lo que la fuente estándar del PDF no escribe", () => {
    const b = armarEstacion({ ...base, notams: [{ code: "A1/26", from: "a", to: "b", textEsp: "PISTA → CERRADA ✈" }] }, AHORA);
    expect(b.notams[0].texto).toBe("PISTA - CERRADA");
  });
});

describe("cortar, envolver y espacios", () => {
  it("cortar no parte palabras", () => {
    expect(cortar("uno dos tres", 100)).toBe("uno dos tres");
    expect(cortar("uno dos tres cuatro", 10)).toMatch(/^uno dos \[/);
  });

  it("envolver respeta el ancho, incluso con una palabra larguísima", () => {
    const medir = (s: string) => s.length;
    const r = envolver("hola mundo " + "x".repeat(25) + " fin", medir, 10);
    expect(r.every((l) => l.length <= 10)).toBe(true);
    expect(r.join("").replace(/ /g, "")).toBe("holamundo" + "x".repeat(25) + "fin");
  });

  it("espacios: null no es 'ninguno'", () => {
    expect(lineasDeEspacios(null).lineas[0]).toContain("No se pudieron calcular");
    expect(lineasDeEspacios([]).lineas[0]).toContain("Ninguno");
    const e = lineasDeEspacios([{ tipo: "CTR", nombre: "CTR SAN FERNANDO", clase: "D", limites: "2500 FT / GND", aproximado: false }]);
    expect(e.lineas[0]).toBe("CTR SAN FERNANDO, clase D: 2500 FT / GND");
  });

  it("nombre del archivo", () => {
    expect(nombreBriefing(["SADF", "DCT", "SADM"])).toBe("Briefing-SADF-SADM.pdf");
    expect(nombreBriefing([])).toBe("Briefing-ruta.pdf");
  });
});

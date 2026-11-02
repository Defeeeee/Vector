import { describe, expect, it } from "vitest";
import {
  RENGLONES_POR_HOJA,
  apellidoYNombre,
  armarLibro,
  claseOficial,
  fechaDeGeneracion,
  formatoLibro,
  horaUtc,
  renglonesDeLaHoja,
  itinerario,
  totalHorasDeVuelo,
  valoresDeApertura,
  valoresEnCero,
} from "./libro-anac";
import { altosDeLaHoja } from "./libro-anac-pdf";
import type { Aircraft, Flight, Logbook } from "@/types";

/**
 * El libro de vuelo con la hoja de siempre. Los casos salen de la norma vigente
 * (`docs/normativa/libro-de-vuelo-anac.md`): RAAC 61.120 y Res. ANAC 470/2025.
 */

const avion = (extra: Partial<Aircraft> = {}): Aircraft => ({
  id: "a1",
  user_id: "u",
  registration: "LV-S001",
  icao: "C152",
  type: "Cessna 152",
  type_acft: "MONT-T",
  potencia_hp: 110,
  ...extra,
});

let seq = 0;
const vuelo = (extra: Partial<Flight> = {}): Flight => ({
  id: `f${seq++}`,
  user_id: "u",
  aircraft_id: "a1",
  date: "2026-09-12",
  route: "SADF SAAR",
  landings: 1,
  duration: 1.2,
  takeoff: "2026-09-12T13:05:00Z",
  landing: "2026-09-12T14:17:00Z",
  purpose: "INST",
  pic_day_tra: 1.2,
  ...extra,
});

describe("itinerario", () => {
  it("desde el primero hasta el último punto", () => {
    expect(itinerario("SADF SAAR", false)).toEqual({ desde: "SADF", hasta: "SAAR" });
    expect(itinerario("sadf-saaj-sazn", false)).toEqual({ desde: "SADF", hasta: "SAZN" });
  });

  it("un vuelo local lleva su aeródromo en desde y en hasta, como el libro del CAD", () => {
    expect(itinerario("SADF", false)).toEqual({ desde: "SADF", hasta: "SADF" });
    expect(itinerario("SADF SADF", false)).toEqual({ desde: "SADF", hasta: "SADF" });
    expect(itinerario("SADF LOCAL", false)).toEqual({ desde: "SADF", hasta: "SADF" });
    expect(itinerario("LOCAL", false)).toEqual({ desde: "", hasta: "" });
  });

  it("un simulador lleva la lección, o SIMULADOR: el CAD lo registra aparte", () => {
    expect(itinerario("LOCAL", true)).toEqual({ desde: "SIMULADOR", hasta: "" });
    expect(itinerario("ifr 3", true)).toEqual({ desde: "IFR 3", hasta: "" });
  });
});

describe("claseOficial", () => {
  it("escribe la clase con las siglas del libro (Res. ANAC 470/2025, Anexo I, 5)", () => {
    expect(claseOficial("MONT-T")).toBe("MONT-T");
    expect(claseOficial("MULT-T")).toBe("MULT-T");
    expect(claseOficial("MONT-H")).toBe("MONT-A");
    expect(claseOficial("MULT-H")).toBe("MULT-A");
    expect(claseOficial(undefined)).toBe("");
  });
});

describe("horaUtc", () => {
  it("escribe la hora en UTC, como pide la nota del Adjunto A", () => {
    expect(horaUtc("2026-09-12T13:05:00Z")).toBe("13:05");
    expect(horaUtc("2026-09-12T10:05:00-03:00")).toBe("13:05");
    expect(horaUtc("")).toBe("");
  });
});

describe("armarLibro", () => {
  it("copia cada columna de Vector a la de la hoja", () => {
    const [hoja] = armarLibro({
      vuelos: [
        vuelo({
          pic_day_loc: 0.3,
          sic_day_loc: 0.2,
          pic_night_loc: 0.4,
          sic_night_loc: 0.5,
          pic_day_tra: 1.1,
          sic_day_tra: 0.6,
          pic_night_tra: 0.7,
          sic_night_tra: 0.8,
          imc_pil: 0.9,
          imc_cop: 0.1,
          capota: 0.2,
          landings: 3,
        }),
      ],
      aeronaves: [avion()],
      apertura: valoresEnCero(),
    });
    const r = hoja.renglones[0];
    expect(r).toMatchObject({
      dia: "12",
      mes: "09",
      horaSalida: "13:05",
      horaLlegada: "14:17",
      desde: "SADF",
      hasta: "SAAR",
      finalidad: "INST",
      marcaModelo: "C152",
      matricula: "LV-S001",
      potencia: "110",
      clase: "MONT-T",
    });
    expect(r.valores).toMatchObject({
      aeroDiaPiloto: 0.3,
      aeroDiaCopiloto: 0.2,
      aeroNochePiloto: 0.4,
      aeroNocheCopiloto: 0.5,
      travDiaPiloto: 1.1,
      travDiaCopiloto: 0.6,
      travNochePiloto: 0.7,
      travNocheCopiloto: 0.8,
      aterrizajes: 3,
      imcPiloto: 0.9,
      imcCopiloto: 0.1,
      capota: 0.2,
    });
  });

  it("parte en hojas de 15 renglones y arrastra los totales", () => {
    const vuelos = Array.from({ length: 16 }, (_, i) =>
      vuelo({ date: `2026-03-${String(i + 1).padStart(2, "0")}`, pic_day_tra: 1.1, landings: 2 })
    );
    const hojas = armarLibro({ vuelos, aeronaves: [avion()], apertura: valoresEnCero() });
    expect(hojas.map((h) => h.renglones.length)).toEqual([RENGLONES_POR_HOJA, 1]);
    expect(hojas[0].siguiente.travDiaPiloto).toBe(16.5);
    expect(hojas[1].anterior).toEqual(hojas[0].siguiente);
    expect(hojas[1].siguiente.travDiaPiloto).toBe(17.6);
    expect(hojas[1].siguiente.aterrizajes).toBe(32);
  });

  it("suma sin ruido de punto flotante", () => {
    const hojas = armarLibro({
      vuelos: [vuelo({ pic_day_tra: 0.1 }), vuelo({ pic_day_tra: 0.2 })],
      aeronaves: [avion()],
      apertura: valoresEnCero(),
    });
    expect(hojas[0].siguiente.travDiaPiloto).toBe(0.3);
  });

  it("empieza hoja nueva al cambiar de año: el año va en el encabezado", () => {
    const hojas = armarLibro({
      vuelos: [vuelo({ date: "2025-12-30" }), vuelo({ date: "2026-01-02" })],
      aeronaves: [avion()],
      apertura: valoresEnCero(),
    });
    expect(hojas.map((h) => [h.anio, h.renglones.length])).toEqual([
      [2025, 1],
      [2026, 1],
    ]);
  });

  it("ordena por fecha y hora de salida, aunque lleguen desordenados", () => {
    const hojas = armarLibro({
      vuelos: [
        vuelo({ date: "2026-09-12", takeoff: "2026-09-12T18:00:00Z", route: "SAAR SADF" }),
        vuelo({ date: "2026-09-12", takeoff: "2026-09-12T13:00:00Z", route: "SADF SAAR" }),
        vuelo({ date: "2026-09-01", route: "SADF" }),
      ],
      aeronaves: [avion()],
      apertura: valoresEnCero(),
    });
    expect(hojas[0].renglones.map((r) => `${r.desde}-${r.hasta}`)).toEqual(["SADF-SADF", "SADF-SAAR", "SAAR-SADF"]);
  });

  it("la primera hoja arrastra las horas del libro de papel", () => {
    const libro = {
      opening_pic_day_loc: 8.5,
      opening_pic_day_tra: 2,
      opening_landings: 40,
      opening_capota: 1,
    } as unknown as Logbook;
    const [hoja] = armarLibro({ vuelos: [vuelo({ pic_day_tra: 1.2 })], aeronaves: [avion()], apertura: valoresDeApertura(libro) });
    expect(hoja.anterior.aeroDiaPiloto).toBe(8.5);
    expect(totalHorasDeVuelo(hoja.anterior)).toBe(10.5);
    expect(totalHorasDeVuelo(hoja.siguiente)).toBe(11.7);
    expect(hoja.siguiente.aterrizajes).toBe(41);
  });

  it("un simulador sólo llena las columnas de adiestrador: no es hora de vuelo", () => {
    const sim = avion({ id: "s1", registration: "SIM-01", type: "ALSIM", is_simulator: true, potencia_hp: null });
    const [hoja] = armarLibro({
      vuelos: [
        vuelo({
          aircraft_id: "s1",
          route: "LOCAL",
          duration: 0,
          pic_day_tra: 0,
          landings: 0,
          sim_pil_en_inst: 1,
          imc_pil: 1,
        }),
      ],
      aeronaves: [sim],
      apertura: valoresEnCero(),
    });
    const r = hoja.renglones[0];
    expect(r.desde).toBe("SIMULADOR");
    expect(r.valores.simPilotoEnInstruccion).toBe(1);
    expect(totalHorasDeVuelo(r.valores)).toBe(0);
    expect(r.valores.imcPiloto).toBe(0);
    expect(r.potencia).toBe("");
  });

  it("discrimina multimotor, instructor y aeroaplicador sin sumarlos al total", () => {
    const multi = avion({ id: "m1", type_acft: "MULT-T", type: "Piper Seneca" });
    const [hoja] = armarLibro({
      vuelos: [
        vuelo({ aircraft_id: "m1", pic_day_tra: 1.5 }),
        vuelo({ purpose: "I", pic_day_loc: 1, pic_day_tra: 0 }),
        vuelo({ purpose: "AER", pic_day_loc: 0.8, pic_day_tra: 0 }),
      ],
      aeronaves: [avion(), multi],
      apertura: valoresEnCero(),
    });
    expect(hoja.renglones.map((r) => [r.valores.multimotor, r.valores.instructor, r.valores.aeroaplicador])).toEqual([
      [1.5, 0, 0],
      [0, 1, 0],
      [0, 0, 0.8],
    ]);
    // El total del libro es sólo "Tiempos de vuelo": 1,5 + 1 + 0,8.
    expect(totalHorasDeVuelo(hoja.siguiente)).toBe(3.3);
  });

  it("en marca y modelo va el tipo, como en el libro; sin tipo, el nombre", () => {
    const [hoja] = armarLibro({
      vuelos: [vuelo({ aircraft_id: "e1" }), vuelo({ aircraft_id: "x1" })],
      aeronaves: [avion({ id: "e1", icao: "echo", type: "Tecnam P92 Echo" }), avion({ id: "x1", icao: "", type: "Aero Boero 115" })],
      apertura: valoresEnCero(),
    });
    expect(hoja.renglones.map((r) => r.marcaModelo)).toEqual(["ECHO", "Aero Boero 115"]);
  });

  it("corta la hoja donde la corta el libro del piloto", () => {
    const vuelos = Array.from({ length: 13 }, (_, i) => vuelo({ date: `2026-03-${String(i + 1).padStart(2, "0")}` }));
    const hojas = armarLibro({ vuelos, aeronaves: [avion()], apertura: valoresEnCero(), renglonesPorHoja: 12 });
    expect(hojas.map((h) => [h.capacidad, h.renglones.length, h.cerrada])).toEqual([
      [12, 12, false],
      [12, 1, false],
    ]);
  });

  it("un vuelo que cierra la hoja es su último renglón, y lo vacío se tacha", () => {
    const vuelos = [
      vuelo({ date: "2026-03-01", pic_day_tra: 1 }),
      vuelo({ date: "2026-03-02", pic_day_tra: 1, cierra_hoja: true }),
      vuelo({ date: "2026-03-03", pic_day_tra: 1 }),
    ];
    const hojas = armarLibro({ vuelos, aeronaves: [avion()], apertura: valoresEnCero() });
    expect(hojas.map((h) => [h.renglones.length, h.cerrada])).toEqual([
      [2, true],
      [1, false],
    ]);
    // Los totales siguen su camino: la hoja cerrada pasa lo suyo a la siguiente.
    expect(hojas[1].anterior.travDiaPiloto).toBe(2);
    expect(hojas[1].siguiente.travDiaPiloto).toBe(3);
  });

  it("cerrar la última hoja la deja tachada; cerrar una hoja llena no tacha nada", () => {
    const llena = Array.from({ length: RENGLONES_POR_HOJA }, (_, i) =>
      vuelo({ date: `2026-04-${String(i + 1).padStart(2, "0")}`, cierra_hoja: i === RENGLONES_POR_HOJA - 1 })
    );
    const ultima = vuelo({ date: "2026-05-01", cierra_hoja: true });
    const hojas = armarLibro({ vuelos: [...llena, ultima], aeronaves: [avion()], apertura: valoresEnCero() });
    expect(hojas.map((h) => [h.renglones.length, h.cerrada])).toEqual([
      [RENGLONES_POR_HOJA, false],
      [1, true],
    ]);
  });

  it("la hoja que corta el cambio de año también se tacha; la última abierta, no", () => {
    const hojas = armarLibro({
      vuelos: [vuelo({ date: "2025-12-30" }), vuelo({ date: "2026-01-02" })],
      aeronaves: [avion()],
      apertura: valoresEnCero(),
    });
    expect(hojas.map((h) => h.cerrada)).toEqual([true, false]);
  });

  it("sin vuelos no hay hojas", () => {
    expect(armarLibro({ vuelos: [], aeronaves: [], apertura: valoresEnCero() })).toEqual([]);
  });
});

describe("formatoLibro", () => {
  it("escribe horas con coma y un decimal, como la hoja", () => {
    expect(formatoLibro(1.2, "travDiaPiloto", true)).toBe("1,2");
    expect(formatoLibro(12, "travDiaPiloto", false)).toBe("12,0");
  });

  it("en un renglón el cero va en blanco; en los totales se escribe", () => {
    expect(formatoLibro(0, "capota", true)).toBe("");
    expect(formatoLibro(0, "capota", false)).toBe("0,0");
    expect(formatoLibro(0, "aterrizajes", false)).toBe("0");
    expect(formatoLibro(3, "aterrizajes", true)).toBe("3");
  });
});

describe("encabezado y pie", () => {
  it("el titular va como APELLIDO, Nombre", () => {
    expect(apellidoYNombre("Federico", "Díaz Nemeth")).toBe("DÍAZ NEMETH, Federico");
    expect(apellidoYNombre("Lucía", "")).toBe("Lucía");
    expect(apellidoYNombre(null, null)).toBe("");
  });

  it("la fecha de generación es la de Argentina", () => {
    // 1:30 UTC del 24 es todavía el 23 en Buenos Aires.
    expect(fechaDeGeneracion(new Date("2026-09-24T01:30:00Z"))).toBe("23/09/2026");
  });
});

describe("renglones por hoja", () => {
  it("usa los del libro, dentro de lo razonable; si no, los 15 de la hoja", () => {
    expect(renglonesDeLaHoja({ renglones_por_hoja: 12 } as Logbook)).toBe(12);
    expect(renglonesDeLaHoja(null)).toBe(15);
    expect(renglonesDeLaHoja({ renglones_por_hoja: 3 } as Logbook)).toBe(15);
    expect(renglonesDeLaHoja({ renglones_por_hoja: 99 } as Logbook)).toBe(15);
  });

  it("la tabla ocupa siempre lo mismo: con 15 renglones, 20 pt cada uno", () => {
    expect(altosDeLaHoja(15)).toEqual({ totales: 20, renglon: 20 });
    for (const n of [5, 10, 12, 15, 20, 25, 40]) {
      const a = altosDeLaHoja(n);
      expect(2 * a.totales + n * a.renglon).toBeLessThanOrEqual(17 * 20 + 1e-9);
    }
  });
});

import { describe, expect, it } from "vitest";
import { clasificarNotam, horarioDelNotam, parsearTaf, tafALaHora, ventanaDelVuelo, vigenciaNotam, type NotamAnac } from "./meteo-plan";

const ms = (iso: string) => Date.parse(iso);

// TAF reales del 20/10/2026 (aviationweather.gov).
const SADF = `TAF SADF 201100Z 2012/2112 07010KT CAVOK TX20/2018Z TN13/2109Z
  BECMG 2017/2019 10015KT
  BECMG 2101/2102 06010KT`;
const SAEZ = `TAF SAEZ 201100Z 2012/2112 07010KT CAVOK TX20/2018Z TN14/2110Z
  TEMPO 2013/2019 02015KT 9999 SCT030`;

describe("el TAF, a la hora del vuelo", () => {
  it("lee la validez y los grupos", () => {
    const t = parsearTaf(SADF, "2026-10-20T12:00:00Z")!;
    expect(t.estacion).toBe("SADF");
    expect(t.desde).toBe(ms("2026-10-20T12:00:00Z"));
    expect(t.hasta).toBe(ms("2026-10-21T12:00:00Z"));
    expect(t.grupos.map((g) => g.tipo)).toEqual(["BASE", "BECMG", "BECMG"]);
  });

  it("antes del BECMG, sólo la base (sin las temperaturas)", () => {
    const t = parsearTaf(SADF, "2026-10-20T12:00:00Z")!;
    expect(tafALaHora(t, ms("2026-10-20T15:00:00Z"))).toEqual(["07010KT CAVOK"]);
  });

  it("después de un BECMG que empezó, la base y el cambio", () => {
    const t = parsearTaf(SADF, "2026-10-20T12:00:00Z")!;
    expect(tafALaHora(t, ms("2026-10-20T18:30:00Z"))).toEqual(["07010KT CAVOK", "BECMG 2017/2019 10015KT"]);
  });

  it("un TEMPO que cubre la hora va; fuera de su período, no", () => {
    const t = parsearTaf(SAEZ, "2026-10-20T12:00:00Z")!;
    expect(tafALaHora(t, ms("2026-10-20T18:30:00Z"))).toEqual(["07010KT CAVOK", "TEMPO 2013/2019 02015KT 9999 SCT030"]);
    expect(tafALaHora(t, ms("2026-10-20T19:30:00Z"))).toEqual(["07010KT CAVOK"]);
  });

  it("un FM reemplaza a la base desde su hora", () => {
    const t = parsearTaf("TAF SAZS 201700Z 2018/2118 27015KT 9999 FEW030 FM202300 30025G40KT 6000 -SHRA BKN015 PROB30 TEMPO 2100/2104 2000 SHRA OVC008", "2026-10-20T18:00:00Z")!;
    expect(tafALaHora(t, ms("2026-10-20T20:00:00Z"))).toEqual(["27015KT 9999 FEW030"]);
    expect(tafALaHora(t, ms("2026-10-21T01:00:00Z"))).toEqual(["FM202300 30025G40KT 6000 -SHRA BKN015", "PROB30 TEMPO 2100/2104 2000 SHRA OVC008"]);
  });

  it("fuera de la validez no inventa", () => {
    const t = parsearTaf(SADF, "2026-10-20T12:00:00Z")!;
    expect(tafALaHora(t, ms("2026-10-21T13:00:00Z"))).toBeNull();
  });

  it("un TAF que cruza fin de mes", () => {
    const t = parsearTaf("TAF SADF 311700Z 3118/0118 09005KT CAVOK", "2026-10-31T17:30:00Z")!;
    expect(t.hasta).toBe(ms("2026-11-01T18:00:00Z"));
  });

  it("lo que no es un TAF, no se recorta", () => {
    expect(parsearTaf("No disponible", "2026-10-20T12:00:00Z")).toBeNull();
  });
});

// NOTAM reales de ANAC del 20/10/2026.
const notam = (codigo: string, desde: string, hasta: string | null, texto: string): NotamAnac => ({ codigo, desde, hasta, texto });
const PISTA = notam("A4174/2026", "2026-10-07 05:30:00", "2026-10-30 08:30:00", "RWY 05/23 CLSD WIP MAINT 07 0530-0830 09, 14, 16, 21, 23, 28 AND 30 0430-0830");
const PLATAFORMA = notam("A4197/2026", "2026-10-08 15:28:00", "2026-10-31 22:00:00", "ACFT STAND PSN 4B AND H4 CLSD 1000-2200");
const RODAJE = notam("A4385/2026", "2026-10-21 01:00:00", "2026-10-21 08:00:00", "TWY A CLSD FM HANGAR 15 TIL PSN 1)");
const OBSTACULO = notam("A1937/2025", "2025-05-07 17:00:00", null, "OBST BUILDING COORD GEO 342808.87S/0583345.55W HGT 38M PENALIZES INNER HORIZONTAL SFC IN 6.5 M");

describe("el horario de un NOTAM", () => {
  it("días del mes con su hora, de atrás para adelante", () => {
    expect(horarioDelNotam(PISTA.texto)).toEqual([
      { dias: [7], desde: "0530", hasta: "0830" },
      { dias: [9, 14, 16, 21, 23, 28, 30], desde: "0430", hasta: "0830" },
    ]);
  });

  it("una hora sola es todos los días", () => {
    expect(horarioDelNotam(PLATAFORMA.texto)).toEqual([{ dias: [], desde: "1000", hasta: "2200" }]);
  });

  it("sin horario al final, vale toda la vigencia", () => {
    expect(horarioDelNotam(RODAJE.texto)).toEqual([]);
  });
});

describe("si un NOTAM pega en tu vuelo", () => {
  // Sale el 21/10 a las 0500Z y llega a las 0545Z: la ventana va de 0400Z a 0645Z.
  const madrugada = ventanaDelVuelo(ms("2026-10-21T05:00:00Z"), ms("2026-10-21T05:45:00Z"));
  // Sale el 20/10 a las 1830Z: ventana de 1730Z a 2015Z.
  const tarde = ventanaDelVuelo(ms("2026-10-20T18:30:00Z"), ms("2026-10-20T19:15:00Z"));

  it("la pista cerrada de 0430 a 0830 los días 21: afecta de madrugada, no a la tarde", () => {
    expect(clasificarNotam(PISTA, madrugada)).toBe("afecta");
    expect(clasificarNotam(PISTA, tarde)).toBe("noEnTuHorario");
  });

  it("el día 20 no está en la lista: no afecta aunque sea de madrugada", () => {
    const madrugada20 = ventanaDelVuelo(ms("2026-10-20T05:00:00Z"), ms("2026-10-20T05:45:00Z"));
    expect(clasificarNotam(PISTA, madrugada20)).toBe("noEnTuHorario");
  });

  it("la plataforma de 1000 a 2200 todos los días: afecta a la tarde, no de madrugada", () => {
    expect(clasificarNotam(PLATAFORMA, tarde)).toBe("afecta");
    expect(clasificarNotam(PLATAFORMA, madrugada)).toBe("noEnTuHorario");
  });

  it("uno sin horario afecta si su vigencia toca la ventana", () => {
    expect(clasificarNotam(RODAJE, madrugada)).toBe("afecta");
    expect(clasificarNotam(RODAJE, tarde)).toBe("fuera");
  });

  it("los permanentes van aparte", () => {
    expect(clasificarNotam(OBSTACULO, tarde)).toBe("permanente");
  });

  it("un horario con días de la semana o sol no se adivina: revisar", () => {
    expect(clasificarNotam(notam("X", "2026-10-01 00:00:00", "2026-11-01 00:00:00", "AD CLSD MON-FRI SR-SS"), tarde)).toBe("revisar");
  });

  it("uno que empieza después del vuelo, no", () => {
    expect(clasificarNotam(notam("X", "2026-11-03 04:00:00", "2026-11-28 08:00:00", "RWY 13/31 CLSD 0400-0700"), tarde)).toBe("fuera");
  });

  it("la vigencia, en UTC", () => {
    expect(vigenciaNotam(RODAJE)).toBe("21/10 0100Z – 21/10 0800Z");
    expect(vigenciaNotam(OBSTACULO)).toBe("desde 07/05 1700Z, permanente");
  });
});

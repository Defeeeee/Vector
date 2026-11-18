import { describe, expect, it } from "vitest";
import { leerHojaDigital, leerLibroDigital, type ItemTexto } from "./libro-digital";

// Una hoja de ANAC armada a mano, con las posiciones relativas de un libro exportado de una planilla.
const it_ = (s: string, x: number, y: number): ItemTexto => ({ s, x, y });
function hoja(filas: string[][], totalesAnt: [number, string][], totalesSig: [number, string][]): ItemTexto[] {
  const xs = { pil: [680, 701, 720, 740, 800], cop: [690, 709, 728, 745, 807] };
  const items: ItemTexto[] = [
    it_("AÑO", 570, 5510), it_("2025", 570, 5506),
    it_("DIA", 569, 5497), it_("MES", 573, 5497), it_("SALIDA", 579, 5502), it_("LLEGADA", 608, 5502),
    it_("FINALIDAD", 618, 5502), it_("MARCA", 628, 5505), it_("MATRICULA", 641, 5505), it_("POTENCIA", 655, 5505), it_("CLASE", 669, 5505),
    it_("ATERRI-", 757, 5509), it_("INSTRUC", 766, 5508), it_("CAPOTA", 816, 5503), it_("ADIEST.", 826, 5505), it_("CERTIFICACIONES", 839, 5507),
    ...xs.pil.map((x) => it_("PILOTO", x, 5502)), ...xs.cop.map((x) => it_("COPILOTO", x, 5502)),
    it_("TOTALES PAGINA ANTERIOR", 624, 5497), ...totalesAnt.map(([x, v]) => it_(v, x, 5497)),
    it_("TOTALES A LA PAGINA SIGUIENTE", 606, 5431), ...totalesSig.map(([x, v]) => it_(v, x, 5431)),
  ];
  filas.forEach((f, i) => {
    const y = 5493 - i * 4;
    const [d, m, sal, ruta, lle, fin, marca, mat, ...nums] = f;
    items.push(it_(d, 570, y), it_(m, 573, y), it_(sal, 578, y), it_(ruta, 590, y), it_(lle, 608, y), it_(fin, 617, y), it_(marca, 628, y), it_(mat, 641, y), it_("MONT-T", 668, y));
    for (const n of nums) { const [x, v] = n.split("="); items.push(it_(v, Number(x), y)); }
  });
  return items;
}

describe("libro digital", () => {
  const h = hoja(
    [
      ["2", "6", "22:19", "SADF SADF", "23:30", "INST", "ASTO", "LV-S024", "702=1,2", "759=5", "817=0,8"],
      ["6", "`7", "19:50", "SADF SADF", "20:50", "VP", "ECHO", "LV-S114", "682=1,0", "759=1"],
      ["26", "10", "13:30", "GEO SIMULADORES", "14:30", "INST", "GEOSIM", "C172", "827=1,0"],
    ],
    [[681, "19,1"], [701, "0,0"], [759, "122"], [817, "1,0"], [827, "0,0"]],
    [[681, "20,1"], [701, "1,2"], [759, "128"], [817, "1,8"], [827, "1,0"]],
  );
  it("lee cada columna por su rótulo: día o noche, capota, adiestrador", () => {
    const r = leerHojaDigital(h)!;
    expect(r.vuelos).toHaveLength(3);
    expect(r.vuelos[1]).toMatchObject({ date: "2025-07-06", takeoff: "19:50", route: "SADF SADF", aircraft_registration: "LV-S114", aircraft_model: "ECHO", pic_day_loc: 1, duration: 1, landings: 1 });
    expect(r.vuelos[0]).toMatchObject({ date: "2025-06-02", pic_night_loc: 1.2, capota: 0.8, landings: 5, purpose: "INST" });
    expect(r.vuelos[0].pic_day_loc).toBeUndefined();
    expect(r.vuelos[2].date).toBe("2025-10-26");
  });
  it("un simulador queda sin matrícula, con su modelo y sus horas", () => {
    expect(leerHojaDigital(h)!.vuelos[2]).toMatchObject({ aircraft_registration: "", aircraft_model: "C172", duration: 1, sim_pil_en_inst: 1 });
  });
  it("coteja con los totales de la hoja", () => {
    expect(leerHojaDigital(h)!.diferencias).toEqual([]);
    const mal = hoja([["6", "7", "19:50", "SADF SADF", "20:50", "VP", "ECHO", "LV-S114", "682=1,0", "759=1"]], [[681, "19,1"], [759, "122"]], [[681, "20,5"], [759, "123"]]);
    expect(leerHojaDigital(mal)!.diferencias).toEqual(["aeródromo de día (piloto): la hoja suma 1 y sus totales dicen 1,4"]);
  });
  it("una hoja sin la forma de ANAC no se lee (la lee el lector de imágenes)", () => {
    expect(leerHojaDigital([it_("Hola", 1, 1)])).toBeNull();
    expect(leerLibroDigital([[it_("Hola", 1, 1)]])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { avisosDelLibro, cotejarHoja, mejorLectura, parsearHojas, pedidoDeRelectura, sumaLeida, textoDeCotejo, totalEsperado, type HojaLeida } from "./cotejo-hojas";
import { deduplicar, type VueloLeido } from "./importar-libro";

const v = (duration: number, extra: Partial<VueloLeido> = {}): VueloLeido => ({ date: "2026-03-01", aircraft_registration: "LV-S153", route: "FDO FDO", duration, takeoff: "15:00", landing: "15:30", landings: 1, purpose: "VP", ...extra });
const hoja = (vuelos: VueloLeido[], extra: Partial<HojaLeida> = {}): HojaLeida => ({ vuelos, ...extra });

describe("lo que dice la hoja", () => {
  it("usa el total de la página si está, o lo acumulado menos lo de antes", () => {
    expect(totalEsperado(hoja([], { total_hoja: 6.2 }))).toBe(6.2);
    expect(totalEsperado(hoja([], { total_anterior: 80.1, total_a_la_fecha: 86.3 }))).toBe(6.2);
  });
  it("sin página anterior, el acumulado sólo vale en la primera hoja (chico)", () => {
    expect(totalEsperado(hoja([], { total_a_la_fecha: 7.5 }))).toBe(7.5);
    expect(totalEsperado(hoja([], { total_a_la_fecha: 170 }))).toBeNull();
  });
  it("sin totales no hay qué cotejar", () => {
    expect(totalEsperado(hoja([]))).toBeNull();
  });
});

describe("cotejar una hoja", () => {
  it("cierra si la suma da el total (con redondeo)", () => {
    const h = hoja([v(1), v(1.2), v(0.9)], { total_anterior: 10, total_a_la_fecha: 13.1 });
    expect(cotejarHoja(h).estado).toBe("ok");
  });
  it("no cierra si se salteó un renglón (el caso de las 8 fotos)", () => {
    const h = hoja([v(1), v(1.2)], { total_anterior: 10, total_a_la_fecha: 13.1, renglones: 3 });
    const c = cotejarHoja(h);
    expect(c.estado).toBe("no-coincide");
    expect(textoDeCotejo("Foto 3", c)).toBe("Foto 3: los vuelos leídos suman 2,2 h y la hoja dice 3,1 h, y leímos 2 de los 3 vuelos escritos. Revisá esa hoja antes de importar: agregá o corregí lo que falte.");
  });
  it("aunque no haya totales, faltan renglones", () => {
    expect(cotejarHoja(hoja([v(1)], { renglones: 2 })).estado).toBe("no-coincide");
  });
  it("las filas de totales y los simuladores no suman como vuelo", () => {
    const h = hoja([v(1), v(5, { aircraft_registration: "Totales a la página siguiente" }), v(1.5, { aircraft_registration: "", sim_pil_en_inst: 1.5 })]);
    expect(sumaLeida(h)).toBe(1);
  });
});

describe("releer y elegir", () => {
  const mala = [hoja([v(1)], { total_hoja: 2, renglones: 2 })];
  const buena = [hoja([v(1), v(1, { takeoff: "16:00" })], { total_hoja: 2, renglones: 2 })];
  it("el pedido de relectura dice qué faltó", () => {
    expect(pedidoDeRelectura(mala)).toContain("Leíste 1 vuelos que suman 1,0 h, pero sus totales escritos dan 2,0 h y la hoja tiene 2 renglones con vuelos.");
    expect(pedidoDeRelectura(buena)).toBe("");
  });
  it("se queda con la lectura que cierra", () => {
    expect(mejorLectura(mala, buena)).toBe(buena);
    expect(mejorLectura(buena, mala)).toBe(buena);
  });
  it("si ninguna cierra, con la que más se acerca", () => {
    const cerca = [hoja([v(1), v(0.8, { takeoff: "16:00" })], { total_hoja: 2 })];
    expect(mejorLectura(mala, cerca)).toBe(cerca);
  });
});

describe("la respuesta de Gemini", () => {
  it("lee las hojas con sus totales", () => {
    const h = parsearHojas(JSON.stringify({ hojas: [{ renglones: 1, total_anterior: 10, total_a_la_fecha: 11, vuelos: [v(1)] }] }));
    expect(h).toHaveLength(1);
    expect(h![0].total_a_la_fecha).toBe(11);
    expect(h![0].vuelos).toHaveLength(1);
  });
  it("acepta la forma vieja, un arreglo de vuelos", () => {
    expect(parsearHojas(JSON.stringify([v(1), v(2)]))![0].vuelos).toHaveLength(2);
  });
  it("rescata los vuelos de una respuesta cortada", () => {
    const cortada = JSON.stringify({ hojas: [{ renglones: 2, vuelos: [v(1), v(2)] }] }).slice(0, -30);
    expect(parsearHojas(cortada)![0].vuelos).toHaveLength(1);
  });
});

describe("el libro entero", () => {
  it("avisa de una hoja que falta y de las horas de antes", () => {
    const avisos = avisosDelLibro([
      { nombre: "La foto 2", anterior: 20, a_la_fecha: 31 },
      { nombre: "La foto 1", anterior: 10, a_la_fecha: 20 },
      { nombre: "La foto 3", anterior: 42, a_la_fecha: 50 },
    ]);
    expect(avisos[0]).toBe("Parece que falta una hoja: la foto 2 termina con 31,0 h y la foto 3 arranca con 42,0 h. Si no la subiste, agregá esas 11,0 h subiendo la hoja que falta.");
    expect(avisos[1]).toContain("Tu primera hoja (la foto 1) trae 10,0 h de antes.");
  });
  it("un libro completo desde cero no avisa nada", () => {
    expect(avisosDelLibro([{ nombre: "La foto 1", anterior: 0, a_la_fecha: 9 }, { nombre: "La foto 2", anterior: 9, a_la_fecha: 18 }])).toEqual([]);
  });
});

describe("repetidos", () => {
  it("sin hora de salida no se saca ningún vuelo (dos locales el mismo día)", () => {
    expect(deduplicar([v(1, { takeoff: "" }), v(1, { takeoff: "" })])).toHaveLength(2);
  });
  it("la misma hoja en dos fotos sí se saca", () => {
    expect(deduplicar([v(1), v(1)])).toHaveLength(1);
  });
});

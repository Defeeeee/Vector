import { describe, expect, it } from "vitest";
import {
  anomaliasConElCad,
  borradorCad,
  diferenciasConElCad,
  firmaDeRevision,
  paraLeerEnDetalle,
  type BorradorCad,
  type ItemCad,
  type LugarParaCad,
  type VueloEnElCad,
} from "./cad";

// El directorio de aeródromos, reducido: SADF también es FDO para ANAC, SADM es MOR.
const lugar = (codigo: string): LugarParaCad => {
  const otros: Record<string, string> = { SADF: "FDO", SADM: "MOR" };
  return { codigo, candidatos: otros[codigo] ? [codigo, otros[codigo]] : [codigo], nombre: null };
};
const avion = { registration: "LV-ABC", type_acft: "MONT-T" };
const vuelo = {
  id: "v1",
  date: "2026-10-17",
  route: "SADF SADM",
  landings: 2,
  duration: 1.2,
  takeoff: "2026-10-17T18:00:00Z",
  landing: "2026-10-17T19:12:00Z",
  purpose: "VP",
  pic_day_tra: 1.2,
};
const b: BorradorCad = borradorCad(vuelo, avion, lugar);
const finalidades: ItemCad[] = [
  { key: "71", value: "VUELO PRIVADO" },
  { key: "68", value: "INSTRUCCIÓN" },
];
// La fila de la lista, como la devuelve GetPagedList: la salida en UTC sin zona.
const fila = {
  vueloTripulanteID: 900,
  fechaSalida: "2026-10-17T18:00:00",
  fechaLlegada: "2026-10-17T19:12:00",
  matricula: "LV-ABC",
  origenDesc: "SADF -  FDO -  FDO (SAN FERNANDO)",
  destinoDesc: "SADM -  MOR -  MOR (MORON)",
  tiempoTotal: "1.2 hs",
};
const detalle = { aterrizajes: 2, horasDia: 1.2, horasNoche: 0, finalidadID: "71", cargoID: 1, tipoVueloID: 2 };

describe("diferenciasConElCad", () => {
  it("no marca nada si los dos lados dicen lo mismo", () => {
    expect(b.problema).toBeNull();
    expect(diferenciasConElCad(b, fila, detalle, finalidades)).toEqual([]);
  });

  it("acepta el aeródromo por su designador de ANAC", () => {
    const conDesignador = { ...fila, origenDesc: " FDO (SAN FERNANDO)", destinoDesc: " MOR (MORON)" };
    expect(diferenciasConElCad(b, conDesignador, null, finalidades)).toEqual([]);
  });

  it("marca la salida, la llegada, el tiempo y el destino distintos", () => {
    const otra = { ...fila, fechaSalida: "2026-10-17T18:30:00", fechaLlegada: "2026-10-17T19:42:00", destinoDesc: "SADP -  PAL -  PAL (EL PALOMAR)", tiempoTotal: "1.2 hs" };
    const difs = diferenciasConElCad(b, otra, null, finalidades);
    expect(difs.map((d) => d.campo)).toEqual(["salida", "llegada", "destino"]);
    expect(difs[0]).toMatchObject({ enVector: "17/10 18:00 UTC", enElCad: "17/10 18:30 UTC" });
    expect(difs[2]).toMatchObject({ enVector: "SADM", enElCad: "SADP" });
  });

  it("marca el tiempo de la lista distinto", () => {
    const difs = diferenciasConElCad(b, { ...fila, tiempoTotal: "1.5 hs" }, null, finalidades);
    expect(difs).toEqual([{ campo: "horas", nombre: "Tiempo de vuelo", enVector: "1,2 h", enElCad: "1,5 h" }]);
  });

  it("del detalle: aterrizajes, día y noche, finalidad, cargo y tipo", () => {
    const otro = { aterrizajes: 3, horasDia: 0.7, horasNoche: 0.5, finalidadID: "68", cargoID: 2, tipoVueloID: 1 };
    const difs = diferenciasConElCad(b, fila, otro, finalidades);
    expect(difs.map((d) => d.campo)).toEqual(["aterrizajes", "diaNoche", "finalidad", "cargo", "tipo"]);
    expect(difs.find((d) => d.campo === "finalidad")).toMatchObject({ enVector: "VUELO PRIVADO", enElCad: "INSTRUCCIÓN" });
    expect(difs.find((d) => d.campo === "cargo")).toMatchObject({ enVector: "piloto", enElCad: "copiloto" });
  });

  it("lo que el CAD no trajo no es una diferencia (invariante 2)", () => {
    const pobre = { vueloTripulanteID: 900, fechaSalida: "2026-10-17T18:00:00" };
    expect(diferenciasConElCad(b, pobre, {}, finalidades)).toEqual([]);
    expect(diferenciasConElCad(b, { ...fila, matricula: null, origenDesc: "", tiempoTotal: "—" }, null, finalidades)).toEqual([]);
  });

  it("la matrícula se compara sin guiones ni mayúsculas", () => {
    expect(diferenciasConElCad(b, { ...fila, matricula: "lvabc" }, null, finalidades)).toEqual([]);
    expect(diferenciasConElCad(b, { ...fila, matricula: "LV-XYZ" }, null, finalidades)[0]).toMatchObject({ campo: "matricula", enElCad: "LV-XYZ" });
  });
});

describe("anomaliasConElCad", () => {
  const marcado = { ...b, cadId: 900 };
  const enElCad = [fila as unknown as VueloEnElCad];

  it("junta las diferencias de cada vuelo marcado que está en el CAD", () => {
    const a = anomaliasConElCad([marcado], [{ ...fila, tiempoTotal: "2.0 hs" } as unknown as VueloEnElCad], new Map(), new Map(), finalidades);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ vectorId: "v1", cadId: 900, ruta: b.ruta });
  });

  it("un vuelo borrado del CAD no es una anomalía (lo resuelve borradosDelCad)", () => {
    expect(anomaliasConElCad([marcado], [], new Map(), new Map(), finalidades)).toEqual([]);
  });

  it("sin leer el detalle, usa lo que se encontró en el detalle la vez anterior", () => {
    const anteriores = new Map([[900, [{ campo: "aterrizajes" as const, nombre: "Aterrizajes", enVector: "2", enElCad: "3" }, { campo: "salida" as const, nombre: "Salida", enVector: "x", enElCad: "y" }]]]);
    const a = anomaliasConElCad([marcado], enElCad, new Map(), anteriores, finalidades);
    // La salida se vuelve a comparar con la lista de hoy (y coincide); de antes queda sólo lo del detalle.
    expect(a[0].diferencias.map((d) => d.campo)).toEqual(["aterrizajes"]);
  });
});

describe("paraLeerEnDetalle", () => {
  const ahora = new Date("2026-11-04T12:00:00Z");
  const viejo = { ...borradorCad({ ...vuelo, id: "v0", takeoff: "2026-10-01T18:00:00Z", landing: "2026-10-01T19:12:00Z", date: "2026-10-01" }, avion, lugar), cadId: 800 };
  const nuevo = { ...b, cadId: 900 };
  const enElCad = [fila, { ...fila, vueloTripulanteID: 800, fechaSalida: "2026-10-01T18:00:00" }] as unknown as VueloEnElCad[];

  it("lee los que nunca se revisaron, del más nuevo al más viejo", () => {
    expect(paraLeerEnDetalle([viejo, nuevo], enElCad, {}, ahora)).toEqual([900, 800]);
  });

  it("no vuelve a leer uno revisado que no cambió", () => {
    const guardadas = { "900": { firma: firmaDeRevision(nuevo, enElCad[0]), cuando: "2026-11-01T00:00:00Z", diferencias: [] } };
    expect(paraLeerEnDetalle([viejo, nuevo], enElCad, guardadas, ahora)).toEqual([800]);
  });

  it("vuelve a leer si cambió de algún lado o pasaron 30 días", () => {
    const cambiado = { "900": { firma: "otra", cuando: "2026-11-01T00:00:00Z", diferencias: [] } };
    expect(paraLeerEnDetalle([nuevo], enElCad, cambiado, ahora)).toEqual([900]);
    const vencido = { "900": { firma: firmaDeRevision(nuevo, enElCad[0]), cuando: "2026-09-01T00:00:00Z", diferencias: [] } };
    expect(paraLeerEnDetalle([nuevo], enElCad, vencido, ahora)).toEqual([900]);
  });

  it("respeta el tope por conexión", () => {
    expect(paraLeerEnDetalle([viejo, nuevo], enElCad, {}, ahora, 1)).toEqual([900]);
  });
});

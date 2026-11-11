import { describe, expect, it } from "vitest";
import {
  actualizacionParaElCad,
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

describe("la autoridad certificante contra el CAD (3.17.0)", () => {
  const conAutoridad: BorradorCad = { ...b, autoridad: { id: "5", nombre: "JUAN PÉREZ" } };
  const detalleCad = { ...detalle, autoridadCertificanteID: 5, observaciones: "Juan Perez" };

  it("no marca nada si es la misma (sin mirar mayúsculas ni tildes)", () => {
    expect(diferenciasConElCad(conAutoridad, fila, detalleCad, finalidades)).toEqual([]);
  });

  it("salta si en Vector se cambió la persona o el tipo", () => {
    const otra: BorradorCad = { ...b, autoridad: { id: "6", nombre: "ANA GÓMEZ" } };
    expect(diferenciasConElCad(otra, fila, detalleCad, finalidades)).toEqual([
      { campo: "autoridad", nombre: "Autoridad", enVector: "JEFE DE INSTRUCTORES · ANA GÓMEZ", enElCad: "INSTRUCTOR DE VUELO · JUAN PEREZ" },
    ]);
  });

  it("sin autoridad en Vector, o sin la del CAD, no es una diferencia", () => {
    expect(diferenciasConElCad(b, fila, detalleCad, finalidades)).toEqual([]);
    expect(diferenciasConElCad(conAutoridad, fila, detalle, finalidades)).toEqual([]);
  });

  it("cambiar la autoridad cambia la firma (se vuelve a leer), y sin autoridad la firma no cambia", () => {
    const f = fila as unknown as VueloEnElCad;
    expect(firmaDeRevision(conAutoridad, f)).not.toBe(firmaDeRevision({ ...conAutoridad, autoridad: { id: "5", nombre: "OTRO" } }, f));
    expect(firmaDeRevision(b, f)).toBe(firmaDeRevision({ ...b, autoridad: null }, f));
  });

  it("los que cambiaron se leen antes que los vencidos", () => {
    const ahora = new Date("2026-11-10T12:00:00Z");
    const viejo = { ...b, vectorId: "a", cadId: 1, fechaHoraSalida: "2026-10-20T10:00:00Z" };
    const cambiado = { ...conAutoridad, vectorId: "b", cadId: 2, fechaHoraSalida: "2026-01-05T10:00:00Z" };
    const enElCad = [{ ...fila, vueloTripulanteID: 1 }, { ...fila, vueloTripulanteID: 2 }] as unknown as VueloEnElCad[];
    const guardadas = {
      "1": { firma: firmaDeRevision(viejo, enElCad[0]), cuando: "2026-09-01T00:00:00Z", diferencias: [] },
      "2": { firma: "otra", cuando: "2026-11-09T00:00:00Z", diferencias: [] },
    };
    expect(paraLeerEnDetalle([viejo, cambiado], enElCad, guardadas, ahora)).toEqual([2, 1]);
  });

  it("los cambiados se leen todos, aunque sean más que el tope de rutina", () => {
    const ahora = new Date("2026-11-10T12:00:00Z");
    const muchos = Array.from({ length: 24 }, (_, i) => ({ ...conAutoridad, vectorId: `v${i}`, cadId: 1000 + i, fechaHoraSalida: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
    const enElCad = muchos.map((m) => ({ ...fila, vueloTripulanteID: m.cadId })) as unknown as VueloEnElCad[];
    const guardadas = Object.fromEntries(muchos.map((m) => [String(m.cadId), { firma: "la de antes", cuando: "2026-11-09T00:00:00Z", diferencias: [] }]));
    expect(paraLeerEnDetalle(muchos, enElCad, guardadas, ahora)).toHaveLength(24);
  });
});

describe("Actualizar en el CAD (3.19.0)", () => {
  const lugares: ItemCad[] = [
    { key: "101", value: "SADF -  FDO -  FDO (SAN FERNANDO)" },
    { key: "102", value: "SADM -  MOR -  MOR (MORON)" },
  ];
  const listas = { finalidades, lugares };
  const anomalia = (campos: string[], estado = "PENDIENTE DE DDJJ") => ({
    vectorId: "v1",
    cadId: 900,
    fecha: "17/10/2026",
    ruta: "SADF → SADM",
    estado,
    diferencias: campos.map((campo) => ({ campo, nombre: campo, enVector: "a", enElCad: "b" })),
  }) as unknown as Parameters<typeof actualizacionParaElCad>[1];

  it("los horarios van con día, noche y la discriminación", () => {
    const r = actualizacionParaElCad(b, anomalia(["salida"]), listas);
    expect(r && r.ok && Object.keys(r.cambios).sort()).toEqual(["Discriminaciones", "fechaHoraLlegada", "fechaHoraSalida", "horasDia", "horasNoche"]);
    expect(r && r.ok && r.cambios.fechaHoraSalida).toBe(b.fechaHoraSalida);
  });

  it("los lugares con el tipo de vuelo y los ids del CAD", () => {
    const r = actualizacionParaElCad(b, anomalia(["destino"]), listas);
    expect(r && r.ok && r.cambios).toMatchObject({ origenID: "101", destinoID: "102", tipoVueloID: "2" });
  });

  it("la finalidad por su id, los aterrizajes solos", () => {
    const r = actualizacionParaElCad(b, anomalia(["finalidad", "aterrizajes"]), listas);
    expect(r && r.ok && r.cambios).toEqual({ finalidadID: "71", aterrizajes: 2 });
    expect(r && r.ok && r.soloAutoridad).toBe(false);
  });

  it("lo declarado no se ofrece", () => {
    expect(actualizacionParaElCad(b, anomalia(["aterrizajes"], "DECLARADO"), listas)).toBeNull();
  });

  it("si el CAD no conoce el lugar o la finalidad, dice por qué", () => {
    const r = actualizacionParaElCad(b, anomalia(["destino"]), { finalidades, lugares: [lugares[0]] });
    expect(r && !r.ok && r.motivo).toMatch(/SADM/);
    const f = actualizacionParaElCad({ ...b, finalidad: "VUELO RARO" }, anomalia(["finalidad"]), listas);
    expect(f && !f.ok && f.motivo).toMatch(/finalidad/);
  });

  it("sólo la autoridad, marcada como tal (la extensión 1.2.0 sabe hacerla)", () => {
    const r = actualizacionParaElCad({ ...b, autoridad: { id: "5", nombre: "ANA" } }, anomalia(["autoridad"]), listas);
    expect(r).toEqual({ ok: true, cambios: { autoridadCertificanteID: "5", observaciones: "ANA" }, soloAutoridad: true });
  });
});

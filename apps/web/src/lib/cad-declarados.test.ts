import { describe, expect, it } from "vitest";
import {
  anomaliasConElCad,
  armarPanelCad,
  borradorCad,
  diferenciasConElCad,
  firmaDeRevision,
  firmaDeSolicitud,
  paraLeerEnDetalle,
  solicitudesParaLeer,
  unirConDeclarados,
  vueloDeclaradoComoFila,
  vuelosDeSolicitud,
  type BorradorCad,
  type LugarParaCad,
  type SolicitudGuardada,
  type VueloEnElCad,
} from "./cad";

// Un vuelo de `detalleVuelos` de GetTramiteFoliado (2026-11-17, con la sesión de Federico).
const declarado = {
  vueloID: 933627,
  tipo: "TRAVESIA",
  anac_Origen: "GEZ",
  anac_Dest: "GEZ",
  oaci_Origen: "SRDR",
  oaci_Dest: "SRDR",
  origen: "GEZ / SRDR",
  destino: "GEZ / SRDR",
  salida: "2026-05-17T14:25:00",
  llegada: "2026-05-17T16:00:00",
  estadoVueloId: 3,
  estadoVuelo: "DECLARADO",
  matriculaAeronave: "LV-S024",
  nombreSim: "-",
};

describe("vueloDeclaradoComoFila", () => {
  it("lo pasa a la forma de la lista de ingresados y lo marca declarado", () => {
    expect(vueloDeclaradoComoFila(declarado)).toEqual({
      vueloTripulanteID: 933627,
      fechaSalida: "2026-05-17T14:25:00",
      fechaLlegada: "2026-05-17T16:00:00",
      matricula: "LV-S024",
      origenDesc: "GEZ",
      destinoDesc: "GEZ",
      estadoDesc: "DECLARADO",
      declarado: true,
      simulador: null,
    });
  });
  it("un simulador no tiene matrícula en el CAD", () => {
    const f = vueloDeclaradoComoFila({ ...declarado, nombreSim: "C172 -- CIAC", matriculaAeronave: "-" });
    expect(f).toMatchObject({ matricula: null, simulador: "C172 -- CIAC" });
  });
  it("sin id o sin salida no es un vuelo", () => {
    expect(vueloDeclaradoComoFila({ ...declarado, vueloID: 0 })).toBeNull();
    expect(vueloDeclaradoComoFila({ ...declarado, salida: undefined })).toBeNull();
  });
  it("lee el detalle de la solicitud, con o sin el envoltorio", () => {
    expect(vuelosDeSolicitud({ detalleVuelos: [declarado, { vueloID: 0 }] })).toHaveLength(1);
    expect(vuelosDeSolicitud({ data: { detalleVuelos: [declarado] } })).toHaveLength(1);
    expect(vuelosDeSolicitud(null)).toEqual([]);
  });
});

describe("solicitudesParaLeer", () => {
  const ahora = new Date("2026-11-17T12:00:00Z");
  const h = { solicitudFoliadoID: 8779, estadoID: 4, cantidadVuelos: 42 };
  const guardada = (cuando: string, s = h): SolicitudGuardada => ({ firma: firmaDeSolicitud(s), cuando, vuelos: [] });

  it("la primera vez pide todas, las más nuevas primero y como mucho 3", () => {
    const hist = [1, 2, 3, 4, 5].map((n) => ({ solicitudFoliadoID: n, estadoID: 4, cantidadVuelos: 1 }));
    const r = solicitudesParaLeer(hist, null, {}, ahora);
    expect(r.ids).toEqual([5, 4, 3]);
    expect(r.completo).toBe(false); // faltan dos sin nada guardado: no se desmarca
  });
  it("una cerrada y ya guardada no se vuelve a pedir", () => {
    const r = solicitudesParaLeer([h], null, { "8779": guardada("2026-11-16T10:00:00Z") }, ahora);
    expect(r).toEqual({ ids: [], completo: true });
  });
  it("se vuelve a pedir si cambió su estado o su cantidad de vuelos", () => {
    const g = { "8779": guardada("2026-11-16T10:00:00Z") };
    expect(solicitudesParaLeer([{ ...h, cantidadVuelos: 43 }], null, g, ahora).ids).toEqual([8779]);
    expect(solicitudesParaLeer([{ ...h, estadoID: 5 }], null, g, ahora).ids).toEqual([8779]);
  });
  it("se vuelve a pedir pasados 30 días, y mientras tanto sirve lo guardado", () => {
    const g = { "8779": guardada("2026-10-01T10:00:00Z") };
    const r = solicitudesParaLeer([h], null, g, ahora);
    expect(r.ids).toEqual([8779]);
    expect(r.completo).toBe(true);
  });
  it("la que está en trámite se pide siempre, aunque no esté en el historial", () => {
    const r = solicitudesParaLeer([h], 9000, { "8779": guardada("2026-11-16T10:00:00Z") }, ahora);
    expect(r.ids).toEqual([9000]);
  });
  it("sin historial no hay nada que leer y está completo", () => {
    expect(solicitudesParaLeer([], null, {}, ahora)).toEqual({ ids: [], completo: true });
  });
});

describe("lo declarado no se toca", () => {
  const lugar = (codigo: string): LugarParaCad => ({ codigo, candidatos: [codigo], nombre: null });
  const vuelo = {
    id: "v1", date: "2026-05-17", route: "SADF SADF", landings: 2, duration: 1.6,
    takeoff: "2026-05-17T14:25:00Z", landing: "2026-05-17T16:00:00Z", purpose: "VP", pic_day_tra: 1.6,
  };
  const b: BorradorCad & { cadId: number } = { ...borradorCad(vuelo, { registration: "LV-S024", type_acft: "MONT-T" }, lugar), cadId: 933627 };
  const fila = vueloDeclaradoComoFila(declarado) as VueloEnElCad;

  it("no se buscan diferencias, aunque no coincida nada", () => {
    expect(diferenciasConElCad(b, { ...fila, matricula: "LV-OTRA", fechaSalida: "2026-05-17T10:00:00" } as never, null, [])).toEqual([]);
    expect(anomaliasConElCad([b], [{ ...fila, matricula: "LV-OTRA" }], new Map(), new Map(), [])).toEqual([]);
  });
  it("no se piden en detalle", () => {
    expect(paraLeerEnDetalle([b], [fila], {}, new Date("2026-11-17T12:00:00Z"))).toEqual([]);
    expect(firmaDeRevision(b, fila)).toBeTypeOf("string");
  });
  it("un vuelo del CAD que no está en Vector se ofrece para traer, como un pendiente", () => {
    const panel = armarPanelCad({ borradores: [], omitidos: [], conocidos: [] }, [], { finalidades: [], autoridades: [], lugares: [], simuladores: [] }, [fila], null);
    expect(panel.sinTraer).toBe(1);
  });
  it("unir no repite ids: manda la lista de ingresados", () => {
    const ingresado: VueloEnElCad = { vueloTripulanteID: 933627, fechaSalida: "2026-05-17T14:25:00", matricula: "LV-S024", estadoDesc: "PENDIENTE DE DDJJ" };
    const u = unirConDeclarados([ingresado], [fila, { ...fila, vueloTripulanteID: 1 }]);
    expect(u.map((v) => v.vueloTripulanteID)).toEqual([933627, 1]);
    expect(u[0].declarado).toBeUndefined();
  });
});

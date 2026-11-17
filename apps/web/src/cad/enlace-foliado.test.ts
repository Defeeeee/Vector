import { afterEach, describe, expect, it, vi } from "vitest";
import { atender } from "./enlace-comun";

const pedir = (ruta: string, params: Record<string, string>) => atender({ tipo: "vector-cad:pedido", id: "t", accion: "leer", ruta, params });

afterEach(() => vi.unstubAllGlobals());

describe("lecturas de lo declarado en la lista blanca", () => {
  it("sólo esas dos rutas, con sus parámetros, y nada más de /foliadoweb/api/", async () => {
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      llamadas.push(url);
      return { ok: true, status: 200, redirected: false, json: async () => ({}) };
    });
    expect((await pedir("SolicitudFoliado/GetDatosFoliado", { tipoFoliado: "TM" })).ok).toBe(true);
    expect((await pedir("FoliadoGestion/GetTramiteFoliado", { id: "8779" })).ok).toBe(true);
    expect(llamadas).toEqual([
      "/foliadoweb/api/SolicitudFoliado/GetDatosFoliado?tipoFoliado=TM",
      "/foliadoweb/api/FoliadoGestion/GetTramiteFoliado?id=8779",
    ]);
    for (const [ruta, p] of [
      ["SolicitudFoliado/GetDatosFoliado", { tipoFoliado: "TA" }],
      ["FoliadoGestion/GetTramiteFoliado", { id: "8779/../x" }],
      ["FoliadoGestion/GetTramiteFoliado", {}],
      ["FoliadoGestion/Anular", { id: "1" }],
      ["SolicitudFoliado/Crear", {}],
      ["../VueloTripulante/Get", { id: "1" }],
      ["constructor", {}],
    ] as const) {
      const r = await pedir(ruta, { ...p });
      expect(r.ok, ruta).toBe(false);
    }
    expect(llamadas).toHaveLength(2);
  });
});

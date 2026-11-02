import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchUndici, ProxyAgent } = vi.hoisted(() => ({
  fetchUndici: vi.fn(),
  ProxyAgent: vi.fn(function (this: { url: string }, url: string) {
    this.url = url;
  }),
}));
vi.mock("undici", () => ({ fetch: fetchUndici, ProxyAgent }));

import { fetchAnac, olvidarGuardadosAnac } from "./anac";

const MADHEL = "https://datos.anac.gob.ar/madhel/api/v2/airports/FDO/";

beforeEach(() => {
  olvidarGuardadosAnac();
  fetchUndici.mockReset();
  ProxyAgent.mockClear();
  fetchUndici.mockImplementation(async () => new Response('{"ok":1}', { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchAnac", () => {
  it("sin ANAC_PROXY es el fetch de siempre, con las opciones de Next", async () => {
    vi.stubEnv("ANAC_PROXY", "");
    const global = vi.fn(async () => new Response("x"));
    vi.stubGlobal("fetch", global);
    await fetchAnac(MADHEL, { next: { revalidate: 3600 } });
    expect(global).toHaveBeenCalledWith(MADHEL, { next: { revalidate: 3600 } });
    expect(fetchUndici).not.toHaveBeenCalled();
  });

  it("con ANAC_PROXY sale por el proxy, sin las opciones que sólo entiende Next", async () => {
    vi.stubEnv("ANAC_PROXY", "http://100.71.80.77:8899");
    const res = await fetchAnac(MADHEL, { headers: { "User-Agent": "x" }, next: { revalidate: 60 }, cache: "no-store" });
    expect(await res.json()).toEqual({ ok: 1 });
    const [url, init] = fetchUndici.mock.calls[0];
    expect(url).toBe(MADHEL);
    expect(init).not.toHaveProperty("next");
    expect(init).not.toHaveProperty("cache");
    expect(init.dispatcher.url).toBe("http://100.71.80.77:8899");
  });

  it("respeta revalidate en memoria: no le pregunta dos veces a ANAC", async () => {
    vi.stubEnv("ANAC_PROXY", "http://100.71.80.77:8899");
    await fetchAnac(MADHEL, { next: { revalidate: 3600 } });
    const segunda = await fetchAnac(MADHEL, { next: { revalidate: 3600 } });
    expect(fetchUndici).toHaveBeenCalledTimes(1);
    expect(segunda.headers.get("content-type")).toBe("application/json");
    expect(await segunda.text()).toBe('{"ok":1}');
  });

  it("los NOTAM de aeródromos distintos no se mezclan (el cuerpo es parte de la clave)", async () => {
    vi.stubEnv("ANAC_PROXY", "http://100.71.80.77:8899");
    const notam = (body: string) => fetchAnac("https://ais.anac.gob.ar/notam/json", { method: "POST", body, next: { revalidate: 300 } });
    await notam("indicador=FDO");
    await notam("indicador=MOR");
    await notam("indicador=FDO");
    expect(fetchUndici).toHaveBeenCalledTimes(2);
  });

  it("no guarda un error ni lo que se pidió sin cache", async () => {
    vi.stubEnv("ANAC_PROXY", "http://100.71.80.77:8899");
    fetchUndici.mockImplementationOnce(async () => new Response("caído", { status: 503 }));
    await fetchAnac(MADHEL, { next: { revalidate: 3600 } });
    await fetchAnac(MADHEL, { next: { revalidate: 3600 } });
    await fetchAnac("https://ais.anac.gob.ar/notam/json", { method: "POST", body: "indicador=FDO", cache: "no-store" });
    await fetchAnac("https://ais.anac.gob.ar/notam/json", { method: "POST", body: "indicador=FDO", cache: "no-store" });
    expect(fetchUndici).toHaveBeenCalledTimes(4);
  });
});

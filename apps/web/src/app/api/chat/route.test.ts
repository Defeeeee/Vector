import { beforeEach, describe, expect, it, vi } from "vitest";
import { leerEventos, type EventoCopiloto } from "@/lib/copiloto-stream";

/*
  El copiloto de la web de punta a punta, sin red: Gemini, el backend y la sesión son de
  mentira. Lo que se prueba es la ruta: qué eventos manda, en qué orden, y qué escribe.
*/
const { guion, apiFetch, revalidar } = vi.hoisted(() => ({
  /** Cada vuelta del modelo: sus pedazos, cada uno con texto o con llamadas a herramientas. */
  guion: [] as Array<Array<{ text?: string; functionCalls?: { name: string; args: Record<string, unknown> }[] }>>,
  apiFetch: vi.fn(),
  revalidar: vi.fn(),
}));

vi.mock("@/actions/auth", () => ({ getSessionToken: async () => "token" }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/lib/revalidar-vuelo", () => ({ revalidarLoQueCambiaUnVuelo: revalidar }));
vi.mock("@/lib/gemini", () => ({
  chatConRespaldo: () => ({
    async *sendMessageStream() {
      for (const p of guion.shift() ?? []) {
        yield {
          functionCalls: p.functionCalls,
          candidates: [{ content: { parts: p.text ? [{ text: p.text }] : [] } }],
        };
      }
    },
  }),
}));

import { POST } from "./route";

const AVION = { id: "a1", registration: "LV-ABC" };
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

async function preguntar(message: string, history: unknown[] = []) {
  const res = await POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ message, history }) }) as never);
  if (!res.headers.get("content-type")?.includes("ndjson")) return { status: res.status, eventos: [] as EventoCopiloto[] };
  return { status: res.status, eventos: leerEventos(await res.text()).eventos };
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "clave");
  guion.length = 0;
  apiFetch.mockReset();
  revalidar.mockReset();
  apiFetch.mockImplementation(async (ruta: string) =>
    ruta === "/dashboard" ? json({ flights: [], aircraft: [AVION], profile: { first_name: "Lucía" } }) : json({}),
  );
});

describe("/api/chat, de a pedazos", () => {
  it("avisa qué hace al instante y escribe la respuesta a medida que llega", async () => {
    guion.push([{ text: "Tenés " }, { text: "6,4 h de noche." }]);
    const { eventos } = await preguntar("¿cuántas horas de noche tengo?");
    expect(eventos[0]).toEqual({ tipo: "estado", texto: "Leyendo tu bitácora…" });
    expect(eventos.filter((e) => e.tipo === "texto").map((e) => (e as { texto: string }).texto)).toEqual([
      "Tenés",
      "Tenés 6,4 h de noche.",
    ]);
    expect(eventos.at(-1)).toEqual({ tipo: "fin", texto: "Tenés 6,4 h de noche." });
  });

  it("dice qué herramienta usa, y sigue con la respuesta", async () => {
    guion.push([{ functionCalls: [{ name: "consultar_raac", args: { consulta: "pasajeros" } }] }]);
    guion.push([{ text: "Según la RAAC…" }]);
    const { eventos } = await preguntar("¿puedo llevar pasajeros?");
    expect(eventos).toContainEqual({ tipo: "estado", texto: "Buscando en la RAAC…" });
    expect(eventos.at(-1)).toEqual({ tipo: "fin", texto: "Según la RAAC…" });
  });

  it("nunca deja ver un ID interno, ni a medio escribir", async () => {
    guion.push([{ text: "El vuelo [ID: d8342011-1b2c-" }, { text: "4d5e-8f90-a1b2c3d4e5f6] de ayer." }]);
    const { eventos } = await preguntar("¿cuál fue mi último vuelo?");
    for (const e of eventos) expect(JSON.stringify(e)).not.toMatch(/d8342011/);
    expect(eventos.at(-1)).toEqual({ tipo: "fin", texto: "El vuelo de ayer." });
  });

  it("propone el vuelo con el resumen del código, y no lo escribe", async () => {
    guion.push([
      {
        functionCalls: [
          {
            name: "log_flight",
            args: { aircraft_registration: "LV-ABC", date: "2026-11-01", route: "SADF SADF", takeoff: "14:00", landing: "15:00", landings: 3, purpose: "VP", pic_day_loc: 1 },
          },
        ],
      },
    ]);
    guion.push([{ text: "Listo, ¿lo cargo?" }]);
    const { eventos } = await preguntar("cargá el vuelo de ayer");
    const fin = eventos.at(-1) as Extract<EventoCopiloto, { tipo: "fin" }>;
    expect(fin.pendingFlight).toMatchObject({ aircraft_id: "a1", route: "SADF SADF" });
    expect(fin.texto).toContain("Vuelo a registrar");
    expect(apiFetch).not.toHaveBeenCalledWith("/flights", expect.anything());
  });

  it("con el \"sí\", escribe la propuesta tal cual, sin preguntarle al modelo, y revalida", async () => {
    const propuesta = { aircraft_id: "a1", date: "2026-11-01", route: "SADF SADF", takeoff: "14:00", landing: "15:00", duration: 1, landings: 3, purpose: "VP", pic_day_loc: 1 };
    const { eventos } = await preguntar("dale", [
      { role: "user", content: "cargá el vuelo" },
      { role: "assistant", content: "¿Lo cargo?", pendingFlight: propuesta },
    ]);
    const escritura = apiFetch.mock.calls.find(([ruta]) => ruta === "/flights");
    expect(escritura?.[1].method).toBe("POST");
    expect(JSON.parse(escritura?.[1].body)).toMatchObject({ aircraft_id: "a1", route: "SADF SADF" });
    expect(revalidar).toHaveBeenCalled();
    expect(eventos.at(-1)).toMatchObject({ tipo: "fin", texto: expect.stringContaining("Vuelo registrado") });
    expect(guion).toHaveLength(0);
  });

  it("un \"sí\" a una propuesta vieja no escribe nada", async () => {
    guion.push([{ text: "¿Qué vuelo?" }]);
    await preguntar("sí", [
      { role: "assistant", content: "¿Lo cargo?", pendingFlight: { route: "SADF SADF" } },
      { role: "user", content: "no, esperá" },
      { role: "assistant", content: "Ok." },
    ]);
    expect(apiFetch).not.toHaveBeenCalledWith("/flights", expect.anything());
  });

  it("sin sesión en el backend, avisa en el stream", async () => {
    apiFetch.mockImplementation(async () => json({}, 401));
    const { eventos } = await preguntar("hola");
    expect(eventos.at(-1)).toEqual({ tipo: "error", error: "Tu sesión venció. Volvé a entrar." });
  });

  it("lo que se rechaza sin pensar sigue siendo JSON con su código", async () => {
    expect((await preguntar("  ")).status).toBe(400);
  });
});

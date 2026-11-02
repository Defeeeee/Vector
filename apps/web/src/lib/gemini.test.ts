import { describe, expect, it, vi } from "vitest";
import { chatConRespaldo, ESPERA_GEMINI_MS, esSaturacion, generarConRespaldo, MODELOS_GEMINI, noContesto } from "./gemini";

const [PRINCIPAL, RESPALDO, TERCERO, ULTIMO] = MODELOS_GEMINI;

/** El error que tira el SDK (`ApiError`): el JSON de Google como mensaje, y `status`. */
function errorDeGoogle(status: number, texto = "") {
  return Object.assign(new Error(`{"error":{"code":${status},"message":"${texto}"}}`), { status });
}

/**
 * Un Gemini de mentira: cada modelo contesta según `respuestas[modelo]`, en orden, y
 * como el SDK, la historia sólo crece con los mensajes que salieron bien.
 */
function geminiFalso(respuestas: Record<string, Array<Error | string>>) {
  const llamadas: Array<{ modelo: string; pedido: unknown; history: unknown[]; config?: { httpOptions?: { timeout?: number } } }> = [];
  const ai = {
    chats: {
      create: vi.fn(({ model, history = [], config }: { model: string; history?: unknown[]; config?: { httpOptions?: { timeout?: number } } }) => {
        const historia = [...history];
        return {
          getHistory: () => historia,
          sendMessage: async ({ message }: { message: unknown }) => {
            llamadas.push({ modelo: model, pedido: message, history: [...historia], config });
            const r = (respuestas[model] ?? []).shift() ?? new Error(`sin respuesta para ${model}`);
            if (r instanceof Error) throw r;
            historia.push({ role: "user", parts: message }, { role: "model", parts: r });
            return { text: r };
          },
        };
      }),
    },
    models: {
      generateContent: vi.fn(async ({ model, contents, config }: { model: string; contents: unknown; config?: { httpOptions?: { timeout?: number } } }) => {
        llamadas.push({ modelo: model, pedido: contents, history: [], config });
        const r = (respuestas[model] ?? []).shift() ?? new Error(`sin respuesta para ${model}`);
        if (r instanceof Error) throw r;
        return { text: r };
      }),
    },
  };
  return { genAI: ai as never, llamadas };
}

describe("esSaturacion", () => {
  it("toma 503, 500 y 429 como capacidad de Google", () => {
    expect(esSaturacion(errorDeGoogle(503, "Service Unavailable"))).toBe(true);
    expect(esSaturacion(errorDeGoogle(500, "Internal Server Error"))).toBe(true);
    expect(esSaturacion(errorDeGoogle(429, "Too Many Requests"))).toBe(true);
    // El tope de espera vencido del lado de Google.
    expect(esSaturacion(errorDeGoogle(504, "Deadline expired before operation could complete."))).toBe(true);
  });

  it("no cambia de modelo por un pedido mal armado o una clave inválida", () => {
    expect(esSaturacion(errorDeGoogle(400, "Bad Request"))).toBe(false);
    expect(esSaturacion(errorDeGoogle(403, "Forbidden"))).toBe(false);
    expect(esSaturacion(new Error("Unexpected token in JSON"))).toBe(false);
  });

  it("reconoce el 503 por el texto aunque el error no traiga status", () => {
    expect(esSaturacion(new Error("[503 Service Unavailable] This model is currently experiencing high demand."))).toBe(true);
  });
});

describe("chatConRespaldo", () => {
  it("usa el modelo principal mientras contesta", async () => {
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: ["hola"], [RESPALDO]: [] });
    const chat = chatConRespaldo(genAI, {});
    const r = await chat.sendMessage("¿puedo volar?");
    expect(r.text).toBe("hola");
    expect(llamadas.map((l) => l.modelo)).toEqual([PRINCIPAL]);
  });

  it("si un mensaje falla por saturación, lo reenvía al respaldo con la historia de antes", async () => {
    const { genAI, llamadas } = geminiFalso({
      [PRINCIPAL]: ["propongo el vuelo", errorDeGoogle(503, "Service Unavailable")],
      [RESPALDO]: ["vuelo registrado", "de nada"],
    });
    const chat = chatConRespaldo(genAI, {}, [{ role: "user", parts: [{ text: "antes" }] }]);
    await chat.sendMessage("cargá el vuelo");
    // El resultado de una herramienta: es lo único que se reenvía, no el turno.
    const r = await chat.sendMessage([{ text: "resultado de log_flight" }]);
    expect(r.text).toBe("vuelo registrado");
    expect(chat.modelo).toBe(RESPALDO);
    const reenvio = llamadas[2];
    expect(reenvio.modelo).toBe(RESPALDO);
    expect(reenvio.pedido).toEqual([{ text: "resultado de log_flight" }]);
    // La historia llega con lo que salió bien, y sin el mensaje que falló.
    expect(reenvio.history).toHaveLength(3);
    // Y el resto del turno sigue en el respaldo.
    await chat.sendMessage("gracias");
    expect(llamadas[3].modelo).toBe(RESPALDO);
  });

  it("un error que no es de capacidad se propaga sin cambiar de modelo", async () => {
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: [errorDeGoogle(400, "Bad Request")], [RESPALDO]: ["no"] });
    await expect(chatConRespaldo(genAI, {}).sendMessage("x")).rejects.toThrow("400");
    expect(llamadas.map((l) => l.modelo)).toEqual([PRINCIPAL]);
  });

  it("si el respaldo también está saturado, sigue por la cadena hasta uno que conteste", async () => {
    // Lo que pasó el 2026-09-24: 3.5-flash-lite y 3.8-flash con 503 a la vez.
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: [errorDeGoogle(503)], [RESPALDO]: [errorDeGoogle(503)], [TERCERO]: ["listo"] });
    const chat = chatConRespaldo(genAI, {});
    const r = await chat.sendMessage("x");
    expect(r.text).toBe("listo");
    expect(chat.modelo).toBe(TERCERO);
    expect(llamadas.map((l) => l.modelo)).toEqual([PRINCIPAL, RESPALDO, TERCERO]);
  });

  it("si toda la cadena está saturada, el error del último llega a la ruta", async () => {
    const { genAI, llamadas } = geminiFalso(Object.fromEntries(MODELOS_GEMINI.map((m) => [m, [errorDeGoogle(503, m)]])));
    await expect(chatConRespaldo(genAI, {}).sendMessage("x")).rejects.toThrow(ULTIMO);
    expect(llamadas).toHaveLength(MODELOS_GEMINI.length);
  });

  it("los modelos de la cadena son distintos entre sí", () => {
    expect(new Set(MODELOS_GEMINI).size).toBe(MODELOS_GEMINI.length);
  });
});

describe("generarConRespaldo", () => {
  it("cae al respaldo si el principal está saturado", async () => {
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: [errorDeGoogle(503)], [RESPALDO]: ["[]"] });
    const r = await generarConRespaldo(genAI, {}, ["pdf", "prompt"]);
    expect(r.text).toBe("[]");
    expect(llamadas.map((l) => l.modelo)).toEqual([PRINCIPAL, RESPALDO]);
  });

  it("recorre la cadena entera antes de rendirse", async () => {
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: [errorDeGoogle(503)], [RESPALDO]: [errorDeGoogle(429)], [TERCERO]: [errorDeGoogle(500)], [ULTIMO]: ["[]"] });
    const r = await generarConRespaldo(genAI, {}, ["pdf", "prompt"]);
    expect(r.text).toBe("[]");
    expect(llamadas.map((l) => l.modelo)).toEqual([...MODELOS_GEMINI]);
  });
});

describe("tope de espera", () => {
  /** Lo que tira `fetch` cuando el SDK corta el intento por `httpOptions.timeout`. */
  const cortado = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

  it("reconoce el corte por tiempo, y no otros errores", () => {
    expect(noContesto(cortado())).toBe(true);
    expect(noContesto(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
    expect(noContesto(errorDeGoogle(503))).toBe(false);
    expect(noContesto(new Error("Unexpected token"))).toBe(false);
  });

  it("un modelo que no contesta a tiempo pasa al siguiente", async () => {
    const { genAI, llamadas } = geminiFalso({ [PRINCIPAL]: [cortado()], [RESPALDO]: ["hola"] });
    const chat = chatConRespaldo(genAI, {});
    expect((await chat.sendMessage("x")).text).toBe("hola");
    expect(llamadas.map((l) => l.modelo)).toEqual([PRINCIPAL, RESPALDO]);
  });

  it("cada intento lleva el tope, y el importador puede pasar uno más largo", async () => {
    const chat = geminiFalso({ [PRINCIPAL]: ["ok"] });
    await chatConRespaldo(chat.genAI, { systemInstruction: "s" }).sendMessage("x");
    expect(chat.llamadas[0].config?.httpOptions?.timeout).toBe(ESPERA_GEMINI_MS);

    const pdf = geminiFalso({ [PRINCIPAL]: [cortado()], [RESPALDO]: ["[]"] });
    await generarConRespaldo(pdf.genAI, {}, ["pdf"], 120_000);
    expect(pdf.llamadas.map((l) => l.config?.httpOptions?.timeout)).toEqual([120_000, 120_000]);
  });
});

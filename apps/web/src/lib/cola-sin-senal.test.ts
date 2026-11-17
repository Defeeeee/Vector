import { describe, expect, it } from "vitest";
import {
  MAX_FALLAS_DEL_SERVIDOR,
  agregar,
  camposDeFormData,
  formDataDeCampos,
  leerCola,
  escribirCola,
  nuevaClave,
  pendientes,
  procesarCola,
  rechazados,
  reintentable,
  sePuedeEncolar,
  siguiente,
  veredicto,
  type Cola,
  type EntradaCola,
  type Resultado,
} from "./cola-sin-senal";
import { esErrorDeRed, mensajeDeError, MENSAJE_NECESITA_SENAL } from "./error-de-red";

const entrada = (id = nuevaClave(), extra: Partial<EntradaCola> = {}): EntradaCola => ({
  id,
  tipo: "vuelo",
  creado: "2026-11-17T12:00:00.000Z",
  campos: [["clave_cliente", id], ["route", "SADF SADM"]],
  resumen: "SADF → SADM · 1.0 h",
  fallas: 0,
  ...extra,
});

/** Una "base" en memoria: lo que `enviar` hace con la clave, como el backend. */
function mundo(respuestas: (Resultado | "tira")[], cola: Cola) {
  let actual = cola;
  const vuelos = new Map<string, number>();
  const enviadas: string[] = [];
  let i = 0;
  return {
    get cola() {
      return actual;
    },
    vuelos,
    enviadas,
    adaptador: {
      leer: () => actual,
      escribir: (c: Cola) => {
        actual = c;
      },
      enviar: async (campos: [string, string][]) => {
        const clave = campos.find(([n]) => n === "clave_cliente")![1];
        enviadas.push(clave);
        const r = respuestas[Math.min(i++, respuestas.length - 1)];
        if (r === "tira") throw new TypeError("Failed to fetch");
        // El backend crea una sola vez por clave, aunque el pedido llegue dos veces.
        if (r.ok && !vuelos.has(clave)) vuelos.set(clave, 1);
        return r;
      },
    },
  };
}

describe("la cola", () => {
  it("agrega, y la misma clave reemplaza en vez de duplicar", () => {
    const a = entrada();
    let cola = agregar([], a);
    cola = agregar(cola, { ...a, resumen: "otro" });
    expect(cola).toHaveLength(1);
    expect(cola[0].resumen).toBe("otro");
  });

  it("va y vuelve por texto, y lo roto no rompe nada", () => {
    const cola = [entrada(), entrada(undefined, { error: "No" })];
    expect(leerCola(escribirCola(cola))).toEqual(cola);
    expect(leerCola("{no es json")).toEqual([]);
    expect(leerCola('[{"id":"x"}]')).toEqual([]);
    expect(leerCola(null)).toEqual([]);
  });

  it("el FormData ida y vuelta conserva los pares, y se cuenta lo pendiente", () => {
    const fd = new FormData();
    fd.append("a", "1");
    fd.append("a", "2");
    expect(camposDeFormData(formDataDeCampos(camposDeFormData(fd)))).toEqual([["a", "1"], ["a", "2"]]);
    const cola = [entrada(), entrada(undefined, { error: "x" })];
    expect(pendientes(cola)).toBe(1);
    expect(rechazados(cola)).toBe(1);
    expect(siguiente(cola)?.id).toBe(cola[0].id);
    expect(reintentable(cola, cola[1].id)[1].error).toBeUndefined();
  });

  it("la clave nueva es un uuid", () => {
    expect(nuevaClave()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("el veredicto", () => {
  it("separa red, servidor y validación", () => {
    expect(veredicto({ ok: true })).toBe("ok");
    expect(veredicto({ ok: false, error: "x", estado: 503 })).toBe("red");
    expect(veredicto({ ok: false, error: "x", estado: 401 })).toBe("red");
    expect(veredicto({ ok: false, error: "x", estado: 500 })).toBe("servidor");
    expect(veredicto({ ok: false, error: "x", estado: 422 })).toBe("rechazado");
    expect(veredicto({ ok: false, error: "suma" })).toBe("rechazado");
    expect(sePuedeEncolar({ ok: false, error: "x", estado: 503 })).toBe(true);
    expect(sePuedeEncolar({ ok: false, error: "x", estado: 422 })).toBe(false);
  });
});

describe("procesarCola", () => {
  it("manda de a uno y en orden, y vacía la cola", async () => {
    const [a, b, c] = [entrada(), entrada(), entrada()];
    const m = mundo([{ ok: true }], [a, b, c]);
    const r = await procesarCola(m.adaptador);
    expect(m.enviadas).toEqual([a.id, b.id, c.id]);
    expect(r.enviados).toEqual([a.id, b.id, c.id]);
    expect(m.cola).toEqual([]);
  });

  it("sin señal se corta, no pierde nada y no salta el orden", async () => {
    const [a, b] = [entrada(), entrada()];
    const m = mundo(["tira"], [a, b]);
    const r = await procesarCola(m.adaptador);
    expect(r.cortado).toBe(true);
    expect(m.enviadas).toEqual([a.id]);
    expect(m.cola.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("el reintento con la misma clave es un solo vuelo", async () => {
    const a = entrada();
    // El primer intento llegó al backend pero la respuesta se perdió; el segundo trae lo mismo.
    const m = mundo([{ ok: true }], [a]);
    await procesarCola({ ...m.adaptador, escribir: () => {} });
    expect(m.cola).toHaveLength(1);
    await procesarCola(m.adaptador);
    expect(m.vuelos.size).toBe(1);
    expect(m.enviadas).toEqual([a.id, a.id]);
    expect(m.cola).toEqual([]);
  });

  it("un rechazo por validación queda marcado con su error y sigue con el resto", async () => {
    const [a, b] = [entrada(), entrada()];
    const m = mundo([{ ok: false, error: "Falta el avión", estado: 422 }, { ok: true }], [a, b]);
    const r = await procesarCola(m.adaptador);
    expect(r.rechazados).toEqual([a.id]);
    expect(r.enviados).toEqual([b.id]);
    expect(m.cola).toHaveLength(1);
    expect(m.cola[0]).toMatchObject({ id: a.id, error: "Falta el avión" });
    // Con error no se reintenta solo.
    const otra = await procesarCola(m.adaptador);
    expect(otra.enviados).toEqual([]);
    expect(m.enviadas).toHaveLength(2);
  });

  it("5xx se reintenta con tope y después queda marcado", async () => {
    const a = entrada();
    const m = mundo([{ ok: false, error: "boom", estado: 500 }], [a]);
    for (let i = 0; i < MAX_FALLAS_DEL_SERVIDOR - 1; i++) {
      const r = await procesarCola(m.adaptador);
      expect(r.cortado).toBe(true);
      expect(m.cola[0].error).toBeUndefined();
    }
    await procesarCola(m.adaptador);
    expect(m.cola[0].error).toMatch(/servidor/i);
  });

  it("una entrada que otra pestaña descartó no se manda", async () => {
    const [a, b] = [entrada(), entrada()];
    const m = mundo([{ ok: true }], [a, b]);
    const original = m.adaptador.enviar;
    m.adaptador.enviar = async (c) => {
      const r = await original(c);
      m.adaptador.escribir(m.cola.filter((e) => e.id !== b.id));
      return r;
    };
    await procesarCola(m.adaptador);
    expect(m.enviadas).toEqual([a.id]);
  });
});

describe("esErrorDeRed", () => {
  it("reconoce la falta de red y no confunde lo demás", () => {
    expect(esErrorDeRed(new TypeError("Failed to fetch"))).toBe(true);
    expect(esErrorDeRed(new TypeError("Load failed"))).toBe(true);
    expect(esErrorDeRed(new Error("x"), false)).toBe(true);
    expect(esErrorDeRed(new Error("La suma no cierra"))).toBe(false);
    expect(esErrorDeRed(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;x" }))).toBe(false);
    expect(esErrorDeRed(null)).toBe(false);
  });

  it("el mensaje es 'Necesita señal' sólo si fue la red", () => {
    expect(mensajeDeError(new TypeError("Failed to fetch"), "x")).toBe(MENSAJE_NECESITA_SENAL);
    expect(mensajeDeError(new Error("Patente repetida"), "x")).toBe("Patente repetida");
    expect(mensajeDeError({}, "respaldo")).toBe("respaldo");
  });
});

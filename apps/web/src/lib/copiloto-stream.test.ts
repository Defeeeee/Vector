import { describe, expect, it } from "vitest";
import {
  estadoDeHerramienta,
  leerEventos,
  lineaDeEvento,
  parteSegura,
  propuestaVigente,
  stripInternalIds,
} from "./copiloto-stream";

const ID = "d8342011-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("leerEventos", () => {
  it("separa los eventos completos y guarda el renglón a medias", () => {
    const todo = lineaDeEvento({ tipo: "estado", texto: "Leyendo tu bitácora…" }) + lineaDeEvento({ tipo: "texto", texto: "Ten" });
    const corte = todo.length - 5;
    const primera = leerEventos(todo.slice(0, corte));
    expect(primera.eventos).toEqual([{ tipo: "estado", texto: "Leyendo tu bitácora…" }]);
    const segunda = leerEventos(primera.resto + todo.slice(corte));
    expect(segunda.eventos).toEqual([{ tipo: "texto", texto: "Ten" }]);
    expect(segunda.resto).toBe("");
  });

  it("un renglón roto no corta los demás", () => {
    expect(leerEventos('{"tipo":"estado"\n{"tipo":"error","error":"x"}\n').eventos).toEqual([{ tipo: "error", error: "x" }]);
  });
});

describe("parteSegura", () => {
  it("muestra el texto normal tal cual va llegando", () => {
    expect(parteSegura("Tenés 6,4 h de noche")).toBe("Tenés 6,4 h de noche");
  });

  it("nunca deja ver un pedazo de un ID mientras se escribe", () => {
    const completo = `El vuelo del 12/03 [ID: ${ID}] SADF–SAAR.`;
    for (let i = 1; i <= completo.length; i++) {
      const visible = parteSegura(completo.slice(0, i));
      expect(visible).not.toMatch(/ID:|d8342011|1b2c-/);
    }
    expect(stripInternalIds(completo)).toBe("El vuelo del 12/03 SADF–SAAR.");
  });

  it("retiene un paréntesis abierto hasta que se cierra", () => {
    expect(parteSegura("Volaste a Rosario (SAA")).toBe("Volaste a Rosario");
    expect(parteSegura("Volaste a Rosario (SAAR) ayer")).toBe("Volaste a Rosario (SAAR) ayer");
  });
});

describe("estadoDeHerramienta", () => {
  it("dice qué está haciendo, con el aeródromo si lo sabe", () => {
    expect(estadoDeHerramienta("consultar_raac")).toBe("Buscando en la RAAC…");
    expect(estadoDeHerramienta("get_airport_info", { icao_code: "sadf" })).toBe("Consultando SADF en ANAC…");
    expect(estadoDeHerramienta("otra")).toBe("Pensando…");
  });
});

describe("propuestaVigente", () => {
  const vuelo = { route: "SADF SAAR", duration: 1.4 };

  it("es la del último mensaje del copiloto", () => {
    expect(propuestaVigente([{ role: "user" }, { role: "assistant", pendingFlight: vuelo }])).toBe(vuelo);
  });

  it("si el piloto contestó otra cosa, se canceló", () => {
    expect(propuestaVigente([{ role: "assistant", pendingFlight: vuelo }, { role: "user" }, { role: "assistant" }])).toBeNull();
    expect(propuestaVigente(undefined)).toBeNull();
  });
});

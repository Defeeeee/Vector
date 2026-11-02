import { describe, expect, it } from "vitest";
import {
  DURACION_MS,
  TOPE_VISIBLES,
  agregarAviso,
  quitarAviso,
  visibles,
  type Aviso,
} from "./avisos";

const aviso = (id: string, tipo: Aviso["tipo"] = "exito"): Aviso => ({
  id,
  tipo,
  titulo: `Aviso ${id}`,
});

describe("agregarAviso", () => {
  it("suma al final, sin tocar los que ya estaban", () => {
    const cola = agregarAviso([aviso("a")], aviso("b"));
    expect(cola.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("no muta la cola que recibió", () => {
    const original = [aviso("a")];
    agregarAviso(original, aviso("b"));
    expect(original).toHaveLength(1);
  });
});

describe("quitarAviso", () => {
  it("saca sólo el que coincide por id", () => {
    const cola = quitarAviso([aviso("a"), aviso("b"), aviso("c")], "b");
    expect(cola.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("un id que no está no rompe nada", () => {
    const cola = [aviso("a")];
    expect(quitarAviso(cola, "fantasma")).toEqual(cola);
  });

  it("una cola vacía se queda vacía", () => {
    expect(quitarAviso([], "a")).toEqual([]);
  });
});

describe("visibles", () => {
  it("por debajo del tope, muestra todo", () => {
    const cola = [aviso("a"), aviso("b")];
    expect(visibles(cola, 3)).toEqual(cola);
  });

  it("por encima del tope, corta en los primeros — no en los últimos", () => {
    /*
      Los primeros son los que llegaron antes: cortar del otro lado dejaría afuera
      justo al que más tiempo lleva esperando, y un aviso que nunca se llega a ver
      es indistinguible de uno que no se disparó.
    */
    const cola = [aviso("a"), aviso("b"), aviso("c"), aviso("d")];
    expect(visibles(cola, 2).map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("usa TOPE_VISIBLES cuando no se pasa un tope explícito", () => {
    /*
      A propósito con longitudes fijas y no derivadas de `TOPE_VISIBLES`: comparar
      contra la misma constante que se está probando hace que el test pase para
      cualquier valor que tome — mutarla a 999 no lo rompía.
    */
    const cola = Array.from({ length: 10 }, (_, i) => aviso(String(i)));
    expect(visibles(cola)).toHaveLength(3);
  });

  it("TOPE_VISIBLES es 3", () => {
    expect(TOPE_VISIBLES).toBe(3);
  });

  it("un tope en cero no muestra nada", () => {
    expect(visibles([aviso("a")], 0)).toEqual([]);
  });
});

describe("DURACION_MS", () => {
  it("un error se queda más tiempo que un éxito", () => {
    // Hay que leerlo y decidir algo, no sólo confirmar de reojo.
    expect(DURACION_MS.error).toBeGreaterThan(DURACION_MS.exito);
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (nombre: string) =>
  fs
    .readFileSync(path.join(process.cwd(), "src", "data", nombre), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"));

describe("la lista de frecuencias de la zona", () => {
  const lista = new Map(leer("frecuencias-zona.tsv").map(([d, , mhz]) => [d, mhz]));

  it("tiene los no controlados de la hoja, Martín García incluido", () => {
    expect(lista.size).toBe(53);
    expect(lista.get("MGI")).toBe("122.50");
  });

  /*
    No es del AIP, así que donde MADHEL publica un canal las dos tienen que decir lo mismo (MADHEL
    gana igual, en `canalesDeLlamada`). Una diferencia es una lista vieja o una ficha cambiada.
  */
  it("coincide con MADHEL donde los dos publican", () => {
    const distintos: string[] = [];
    let comparados = 0;
    for (const c of leer("madhel-fichas.tsv")) {
      const enLista = lista.get(c[0]);
      if (!c[4] || !enLista) continue;
      comparados++;
      if (!c[4].split(",").some((m) => Number(m) === Number(enLista))) distintos.push(`${c[0]}: MADHEL ${c[4]}, lista ${enLista}`);
    }
    expect(comparados).toBeGreaterThan(5);
    // IRA (SAEM): MADHEL publica canal de llamada 122.10/122.25 y, aparte, TWR 118.45; la lista
    // pone la de la torre. Vector muestra el de MADHEL. Cualquier otra diferencia es nueva.
    expect(distintos).toEqual(["IRA: MADHEL 122.10,122.25, lista 118.45"]);
  });
});

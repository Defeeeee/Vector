import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { horarioAro, oficinaParaSalida, oficinasCercanas, parsearHorarios, parsearOficinas, primerTelefono, type OficinaUbicada } from "./oficinas-aro";

/**
 * La tabla de oficinas contra el texto de la AIC A 19/2026, **en los dos sentidos**, como
 * el AIP (invariante 12): cada correo y cada teléfono de la tabla aparece en la AIC, y
 * cada oficina de la AIC está en la tabla. Un mail mal tipeado manda el plan de vuelo a
 * ninguna parte, y el piloto cree que lo presentó.
 */
const RAIZ = process.cwd();
const aic = fs.readFileSync(path.join(RAIZ, "src", "data", "aic-oficinas-aro.txt"), "utf8");
const oficinas = parsearOficinas(fs.readFileSync(path.join(RAIZ, "src", "data", "oficinas-aro.tsv"), "utf8"));

describe("oficinas ARO/AIS contra la AIC A 19/2026", () => {
  it("cada fila de la tabla está en la AIC, con su indicativo AFTN y su correo en la misma línea", () => {
    for (const o of oficinas) {
      expect(aic, o.oaci).toContain(`${o.oaci} ${o.aftn} ${o.correo}`);
    }
  });

  it("cada oficina de la AIC está en la tabla", () => {
    const enLaAic = [...aic.matchAll(/^(SA[A-Z]{2}) SA[A-Z]{2}ZPZX [a-z]+@eana\.com\.ar/gm)].map((m) => m[1]);
    expect(enLaAic).toHaveLength(49);
    expect(oficinas.map((o) => o.oaci).sort()).toEqual([...enLaAic].sort());
  });

  it("los teléfonos salen de la AIC", () => {
    const sinEspacios = aic.replace(/\s+/g, "");
    for (const o of oficinas) {
      expect(sinEspacios, o.oaci).toContain(o.telefonos.replace(/\s+/g, ""));
    }
  });

  it("todas tienen un teléfono que se puede marcar", () => {
    for (const o of oficinas) expect(primerTelefono(o.telefonos), o.oaci).not.toBeNull();
  });
});

describe("primerTelefono", () => {
  it("lleva cada forma de la AIC a +54", () => {
    expect(primerTelefono("(+54 11) 45800261")?.marcar).toBe("+541145800261");
    expect(primerTelefono("(54 341) 4513202 - INT / EXT 1120")?.marcar).toBe("+543414513202");
    expect(primerTelefono("(+54 011) 44802444")?.marcar).toBe("+541144802444");
    expect(primerTelefono("(+54 9 351) 2921338")?.marcar).toBe("+5493512921338");
    expect(primerTelefono("Conmutador/Switch (+54 362) 4436291/2/3")?.marcar).toBe("+543624436291");
    expect(primerTelefono("llamar a la torre")).toBeNull();
  });
});

describe("oficinaParaSalida", () => {
  const ubicadas: OficinaUbicada[] = [
    { oaci: "SADF", aftn: "SADFZPZX", correo: "acfdo@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "San Fernando", lat: -34.4532, lon: -58.5896 },
    { oaci: "SADM", aftn: "SADMZPZX", correo: "acmor@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "Morón", lat: -34.6763, lon: -58.6428 },
    { oaci: "SAZS", aftn: "SAZSZPZX", correo: "acbar@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "Bariloche", lat: -41.151, lon: -71.1575 },
  ];

  it("la del aeródromo de salida, si tiene", () => {
    expect(oficinaParaSalida({ codigo: "sadm" }, ubicadas)).toMatchObject({ propia: true, oficina: { oaci: "SADM" } });
  });

  it("si no, la más cercana", () => {
    // Cañuelas: más cerca de Morón que de San Fernando.
    const r = oficinaParaSalida({ codigo: "CNL", lat: -35.0, lon: -58.75 }, ubicadas);
    expect(r).toMatchObject({ propia: false, oficina: { oaci: "SADM" } });
    expect(r?.distanciaNm).toBeGreaterThan(15);
  });

  it("sin oficina y sin coordenadas no adivina", () => {
    expect(oficinaParaSalida({ codigo: "XYZ" }, ubicadas)).toBeNull();
  });
});

describe("oficinasCercanas", () => {
  const ubicadas: OficinaUbicada[] = [
    { oaci: "SAZS", aftn: "SAZSZPZX", correo: "acbar@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "Bariloche", lat: -41.151, lon: -71.1575 },
    { oaci: "SADF", aftn: "SADFZPZX", correo: "acfdo@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "San Fernando", lat: -34.4532, lon: -58.5896 },
    { oaci: "SADM", aftn: "SADMZPZX", correo: "acmor@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "Morón", lat: -34.6763, lon: -58.6428 },
    { oaci: "SAAR", aftn: "SAARZPZX", correo: "acros@eana.com.ar", telefonos: "", fir: "Ezeiza", nombre: "Rosario", lat: -32.9036, lon: -60.785 },
  ];

  it("de la más cercana a la más lejana, hasta tres", () => {
    // Cañuelas: Morón, San Fernando, Rosario; Bariloche queda afuera.
    const r = oficinasCercanas({ codigo: "CNL", lat: -35.0, lon: -58.75 }, ubicadas);
    expect(r.map((x) => x.oficina.oaci)).toEqual(["SADM", "SADF", "SAAR"]);
    expect(r.every((x) => !x.propia)).toBe(true);
    expect(r[0].distanciaNm).toBeLessThan(r[1].distanciaNm);
  });

  it("la del propio aeródromo va primera, a cero millas", () => {
    const r = oficinasCercanas({ codigo: "SADF", lat: -34.4532, lon: -58.5896 }, ubicadas);
    expect(r[0]).toMatchObject({ propia: true, distanciaNm: 0, oficina: { oaci: "SADF" } });
    expect(r.map((x) => x.oficina.oaci)).toEqual(["SADF", "SADM", "SAAR"]);
  });

  it("sin coordenadas, sólo la propia", () => {
    expect(oficinasCercanas({ codigo: "sadm" }, ubicadas).map((x) => x.oficina.oaci)).toEqual(["SADM"]);
    expect(oficinasCercanas({ codigo: "XYZ" }, ubicadas)).toEqual([]);
  });
});

describe("el horario del ARO (AIP AD 2.3)", () => {
  const tsv = fs.readFileSync(path.join(RAIZ, "src", "data", "aip-horarios-aro.tsv"), "utf8");
  const filas = tsv.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split("\t"));

  it("cada horario sale literal del renglón del ARO de la AIP, y es de una oficina de la AIC", () => {
    const codigos = new Set(oficinas.map((o) => o.oaci));
    expect(filas.length).toBeGreaterThan(40);
    for (const [oaci, horario, renglon] of filas) {
      expect(codigos.has(oaci), oaci).toBe(true);
      expect(renglon, oaci).toMatch(/\(ARO\)/);
      expect(renglon.endsWith(horario), oaci).toBe(true);
    }
    expect(parsearHorarios(tsv).get("SADF")).toBe("H24");
  });

  it("H24 está abierta siempre", () => {
    expect(horarioAro("H24", "0330")).toEqual({ texto: "H24", abierta: true });
  });

  it("un rango UTC, también el que pasa la medianoche", () => {
    expect(horarioAro("10:00-01:00 UTC", "1830")?.abierta).toBe(true);
    expect(horarioAro("10:00-01:00 UTC", "0030")?.abierta).toBe(true);
    expect(horarioAro("10:00-01:00 UTC", "0300")?.abierta).toBe(false);
    expect(horarioAro("12:00-20:00 UTC", "2030")?.abierta).toBe(false);
    expect(horarioAro("10:00-23:59:00 UTC (*)", "2300")?.abierta).toBe(true);
  });

  it("con días, O/R o puesta del sol no decide: muestra el texto en castellano", () => {
    expect(horarioAro("LUN a VIE 12:30-20:30 UTC. / MON to FRI 12:30-20:30 UTC.", "1500")).toEqual({
      texto: "LUN a VIE 12:30-20:30 UTC.",
      abierta: null,
    });
    expect(horarioAro("11:00 HR a / to SS", "1500")).toEqual({ texto: "11:00 HR a / to SS", abierta: null });
    expect(horarioAro("O/R (*)", "1500")?.abierta).toBeNull();
    expect(horarioAro(undefined, "1500")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { armarMensajePlanPorRegistrar } from "./plan-por-registrar-mail";

const base = {
  nombre: "Lucía",
  ruta: "SADF → SADM",
  rutaConNombres: "San Fernando a Morón",
  matricula: "LV-ABC",
  dia: "20/10",
  llegada: "16:15",
  registrar: "https://vector.fdiaznem.com.ar/dashboard/log-flight?prefill=true&plan_vuelo_id=p1",
  appUrl: "https://vector.fdiaznem.com.ar",
};

describe("el mail para cargar el vuelo de un plan", () => {
  it("dice qué vuelo, cuándo llegaba y lleva al formulario", () => {
    const m = armarMensajePlanPorRegistrar(base);
    expect(m.asunto).toBe("¿Cargamos tu vuelo SADF → SADM?");
    expect(m.texto).toContain("Según tu plan de vuelo del 20/10, de San Fernando a Morón, ya aterrizaste: la llegada estimada era a las 16:15.");
    expect(m.texto).toContain(`Registrar el vuelo: ${base.registrar}`);
    expect(m.html).toContain(base.registrar.replace(/&/g, "&amp;"));
  });

  it("aclara que los horarios no van", () => {
    expect(armarMensajePlanPorRegistrar(base).texto).toContain("Los horarios ponelos vos");
  });

  it("sin nombre ni matrícula, igual se arma", () => {
    const m = armarMensajePlanPorRegistrar({ ...base, nombre: null, matricula: null, rutaConNombres: null });
    expect(m.texto.startsWith("Hola:")).toBe(true);
    expect(m.texto).toContain("Según tu plan de vuelo del 20/10, ya aterrizaste");
  });
});

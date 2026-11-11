import { describe, expect, it } from "vitest";
import { DOMINIO_RESPUESTAS, direccionDeRespuesta, firmaDelPlan, planDeLosDestinatarios } from "./direccion-respuesta";

const SECRETO = "secreto-de-prueba";
const ID = "0b8f2c1e-5a4d-4c3b-9e7f-123456789abc";

describe("direccion de respuesta", () => {
  it("tiene el formato plan-<id>-<firma de 10>@dominio", () => {
    const d = direccionDeRespuesta(ID, SECRETO)!;
    expect(d).toMatch(new RegExp(`^plan-${ID}-[0-9a-f]{10}@${DOMINIO_RESPUESTAS.replace(/\./g, "\\.")}$`));
  });
  it("es determinística y depende del id y del secreto", () => {
    expect(firmaDelPlan(ID, SECRETO)).toBe(firmaDelPlan(ID, SECRETO));
    expect(firmaDelPlan(ID, SECRETO)).not.toBe(firmaDelPlan(ID, "otro"));
    expect(firmaDelPlan(ID, SECRETO)).not.toBe(firmaDelPlan(ID.replace("0b8f", "0b8e"), SECRETO));
  });
  it("sin secreto o con un id que no es un UUID no arma dirección", () => {
    expect(direccionDeRespuesta(ID, undefined)).toBeNull();
    expect(direccionDeRespuesta("no-es-uuid", SECRETO)).toBeNull();
  });
  it("lee el plan de la dirección sola o con nombre, entre varios destinatarios", () => {
    const d = direccionDeRespuesta(ID, SECRETO)!;
    expect(planDeLosDestinatarios(["lucia@example.com", d], SECRETO)).toBe(ID);
    expect(planDeLosDestinatarios([`Vector <${d.toUpperCase()}>`], SECRETO)).toBe(ID);
  });
  it("rechaza una firma inventada o de otro plan", () => {
    const d = direccionDeRespuesta(ID, SECRETO)!;
    expect(planDeLosDestinatarios([d.replace(/-[0-9a-f]{10}@/, "-0000000000@")], SECRETO)).toBeNull();
    const ajeno = "1c9f2c1e-5a4d-4c3b-9e7f-123456789abc";
    expect(planDeLosDestinatarios([`plan-${ajeno}-${firmaDelPlan(ID, SECRETO)}@${DOMINIO_RESPUESTAS}`], SECRETO)).toBeNull();
    expect(planDeLosDestinatarios([d], "otro-secreto")).toBeNull();
  });
  it("ignora otros dominios y destinatarios vacíos", () => {
    const firma = firmaDelPlan(ID, SECRETO);
    expect(planDeLosDestinatarios([`plan-${ID}-${firma}@otro.com`, null, undefined, ""], SECRETO)).toBeNull();
  });
});

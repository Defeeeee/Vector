import { describe, expect, it } from "vitest";
import { activosDeRespuesta } from "./seguimientos-activos";
import { alternarAsignado, diaYMesArgentino, estadoDeSeguidor, rotuloDeSeguidor, seguidoresDeRespuesta, TEXTO_DE_INVITACION, urlDeInvitacion, vinculados } from "./seguidores";

const TRACKER = "https://tracker.vectoraero.ar/";
const TOKEN = "i".repeat(43);

describe("seguidoresDeRespuesta", () => {
  const lista = seguidoresDeRespuesta(
    [
      { id: "1", apodo: "Mamá", vinculado: false, nombre: null, invitacion_token: TOKEN, invitacion_vence_at: "2026-11-22T12:00:00+00:00", vencida: false },
      { id: "2", apodo: null, vinculado: true, nombre: "Ana", invitacion_token: null, vencida: false },
      { id: "3", apodo: "Tío", vinculado: false, invitacion_token: TOKEN, vencida: true },
      { sin: "id" },
    ],
    TRACKER
  );
  it("arma el link sólo de lo pendiente y descarta lo que no tiene la forma", () => {
    expect(lista).toHaveLength(3);
    expect(lista[0].link).toBe(`https://tracker.vectoraero.ar/invitacion/${TOKEN}`);
    expect(lista[1].link).toBeNull();
    expect(lista[0].venceTexto).toBe("22/11");
  });
  it("dice el estado en palabras del piloto", () => {
    expect(estadoDeSeguidor(lista[0])).toBe("Todavía no entró");
    expect(estadoDeSeguidor(lista[1])).toBe("Ana entró");
    expect(estadoDeSeguidor(lista[2])).toBe("El link venció");
  });
  it("el rótulo es el apodo, o el nombre de quien entró", () => {
    expect(rotuloDeSeguidor(lista[0])).toBe("Mamá");
    expect(rotuloDeSeguidor(lista[1])).toBe("Ana");
    expect(rotuloDeSeguidor({ apodo: null, vinculado: false, nombre: null })).toBe("Invitación sin nombre");
  });
  it("sólo los que entraron se pueden asignar", () => {
    expect(vinculados(lista).map((s) => s.id)).toEqual(["2"]);
  });
});

describe("el resto", () => {
  it("la URL de invitación y el día argentino", () => {
    expect(urlDeInvitacion("https://tracker.vectoraero.ar///", "a b")).toBe("https://tracker.vectoraero.ar/invitacion/a%20b");
    expect(diaYMesArgentino("2026-11-22T01:00:00+00:00")).toBe("21/11");
    expect(diaYMesArgentino("mal")).toBeNull();
  });
  it("alternar un asignado no repite y ordena", () => {
    expect(alternarAsignado(["b"], "a")).toEqual(["a", "b"]);
    expect(alternarAsignado(["a", "b"], "a")).toEqual(["b"]);
  });
  it("el texto de la invitación habla el piloto y no nombra al apodo", () => {
    expect(TEXTO_DE_INVITACION).toMatch(/^Te invito a seguir mis vuelos/);
  });
  it("los vuelos activos traen a quiénes están asignados", () => {
    const [a] = activosDeRespuesta([{ id: "x", token: "t".repeat(40), vence_at: "2026-11-15T20:00:00Z", seguidor_ids: ["1", 3, "2"] }]);
    expect(a.seguidorIds).toEqual(["1", "2"]);
    expect(activosDeRespuesta([{ id: "x", token: "t".repeat(40), vence_at: "2026-11-15T20:00:00Z" }])[0].seguidorIds).toEqual([]);
  });
});

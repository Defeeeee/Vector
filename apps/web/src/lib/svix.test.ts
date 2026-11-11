import { describe, expect, it } from "vitest";
import { firmarSvix, verificarSvix } from "./svix";

// El vector está armado aparte (HMAC-SHA256 en Python, no con `firmarSvix`) para que el test
// no verifique la función con ella misma.
const SECRETO = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TS = 1731705121;
const CUERPO = '{"type":"email.received","data":{"email_id":"e1"}}';
const FIRMA = "v1,dFZKb9S0+sb0b0G+Rn68LvBI4EWMK9bvP3rGE4vkG2Q=";
const ahora = TS + 10;

const cab = (o: Partial<{ id: string; timestamp: string; firma: string }> = {}) => ({
  id: ID,
  timestamp: String(TS),
  firma: FIRMA,
  ...o,
});

describe("verificarSvix", () => {
  it("acepta la firma del vector armado a mano", () => {
    expect(verificarSvix(cab(), CUERPO, SECRETO, ahora)).toBe(true);
  });
  it("coincide con firmarSvix", () => {
    expect(firmarSvix(ID, TS, CUERPO, SECRETO)).toBe(FIRMA);
  });
  it("rechaza si cambia un byte del cuerpo", () => {
    expect(verificarSvix(cab(), CUERPO.replace("e1", "e2"), SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab(), `${CUERPO} `, SECRETO, ahora)).toBe(false);
  });
  it("rechaza con otro secreto, otro id o otro timestamp", () => {
    expect(verificarSvix(cab(), CUERPO, "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", ahora)).toBe(false);
    expect(verificarSvix(cab({ id: "msg_otro" }), CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab({ timestamp: String(TS + 1) }), CUERPO, SECRETO, ahora)).toBe(false);
  });
  it("rechaza un timestamp de más de 5 minutos, para un lado y para el otro", () => {
    expect(verificarSvix(cab(), CUERPO, SECRETO, TS + 301)).toBe(false);
    expect(verificarSvix(cab(), CUERPO, SECRETO, TS - 301)).toBe(false);
    expect(verificarSvix(cab(), CUERPO, SECRETO, TS + 299)).toBe(true);
  });
  it("rechaza cabeceras faltantes o malformadas", () => {
    expect(verificarSvix({ id: null, timestamp: String(TS), firma: FIRMA }, CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab({ firma: "" }), CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab({ timestamp: "abc" }), CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab({ firma: FIRMA.replace("v1,", "v2,") }), CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab({ firma: "v1,corta" }), CUERPO, SECRETO, ahora)).toBe(false);
    expect(verificarSvix(cab(), CUERPO, "", ahora)).toBe(false);
  });
  it("acepta si una de varias firmas (rotación de secreto) es la buena", () => {
    expect(verificarSvix(cab({ firma: `v1,AAAA ${FIRMA}` }), CUERPO, SECRETO, ahora)).toBe(true);
  });
});

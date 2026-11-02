import { describe, expect, it } from "vitest";
import { guardarInvitacion, leerInvitacion } from "./invitacion";

const DIA = 24 * 60 * 60 * 1000;
const ahora = Date.parse("2026-09-23T12:00:00Z");

describe("invitación", () => {
  it("guarda el @ normalizado y lo devuelve", () => {
    const guardado = guardarInvitacion("@Fede.DN", ahora);
    expect(leerInvitacion(guardado, ahora + DIA, "otro.piloto")).toBe("fede.dn");
  });

  it("vence a los 30 días", () => {
    const guardado = guardarInvitacion("fede.dn", ahora);
    expect(leerInvitacion(guardado, ahora + 29 * DIA, null)).toBe("fede.dn");
    expect(leerInvitacion(guardado, ahora + 31 * DIA, null)).toBeNull();
  });

  it("no se ofrece seguirse a uno mismo", () => {
    expect(leerInvitacion(guardarInvitacion("fede.dn", ahora), ahora, "Fede.DN")).toBeNull();
  });

  it("lo que no se entiende no invita a nadie", () => {
    expect(guardarInvitacion("@@", ahora)).toBeNull();
    expect(leerInvitacion("basura", ahora, null)).toBeNull();
    expect(leerInvitacion(JSON.stringify({ handle: 3, desde: ahora }), ahora, null)).toBeNull();
    expect(leerInvitacion(null, ahora, null)).toBeNull();
  });
});

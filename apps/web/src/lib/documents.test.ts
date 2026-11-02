import { describe, expect, it } from "vitest";
import { documentStatus } from "./utils";

/**
 * `expiry_date` puede ser null desde la migración 007: no todo documento caduca.
 *
 * La distinción que estos casos fijan: **sin fecha es "no vence", no "no
 * sabemos"**. Lo segundo es `documento_faltante` en `pilot-status.ts`, y es un
 * documento que debería estar y no está. Acá el documento está.
 */
const HOY = new Date("2026-08-10T12:00:00Z");

describe("documentStatus sin vencimiento", () => {
  it("no explota con null", () => {
    // Antes hacía `expiryDate.slice(0, 10)` sin guarda, y como `pilotStatus`
    // llama a esta función por cada documento bloqueante, un solo documento sin
    // fecha tiraba el semáforo entero.
    expect(() => documentStatus(null, HOY)).not.toThrow();
    expect(() => documentStatus(undefined, HOY)).not.toThrow();
    expect(() => documentStatus("", HOY)).not.toThrow();
  });

  it("nunca está vencido", () => {
    expect(documentStatus(null, HOY).tone).toBe("sin_vencimiento");
    expect(documentStatus(null, HOY).tone).not.toBe("expired");
  });

  it("no tiene cuenta regresiva", () => {
    expect(documentStatus(null, HOY).daysRemaining).toBeNull();
    expect(documentStatus(null, HOY).label).toBe("Sin vencimiento");
  });

  /** No es un estado saludable que celebrar: es la ausencia de una fecha. */
  it("no se confunde con vigente", () => {
    expect(documentStatus(null, HOY).tone).not.toBe("ok");
  });

  it("con fecha sigue evaluando igual que antes", () => {
    expect(documentStatus("2026-08-20", HOY).tone).toBe("warning");
    expect(documentStatus("2026-08-20", HOY).daysRemaining).toBe(10);
    expect(documentStatus("2026-08-01", HOY).tone).toBe("expired");
    expect(documentStatus("2027-08-10", HOY).tone).toBe("ok");
  });
});

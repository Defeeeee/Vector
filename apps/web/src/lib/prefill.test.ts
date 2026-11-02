/**
 * El prefill llena un formulario que termina siendo una entrada de bitácora, así
 * que un valor basura que pase de largo se convierte en un dato inventado en un
 * registro regulatorio.
 *
 * El test existe además por una razón de mantenimiento: este parseo vivió duplicado
 * en `/dashboard/log-flight` y en un modal interceptado que ya no existe, un par que
 * derivó una vez en producción. Hay un solo parser, y esto es lo que lo mantiene
 * honesto.
 */

import { describe, expect, it } from "vitest";
import { parsePrefill } from "./prefill";

describe("parsePrefill", () => {
  it("sin prefill=true no devuelve nada", () => {
    expect(parsePrefill({})).toEqual({});
    expect(parsePrefill({ aircraft_id: "a1" })).toEqual({});
    expect(parsePrefill({ prefill: "1", aircraft_id: "a1" })).toEqual({});
    expect(parsePrefill(undefined)).toEqual({});
  });

  it("lee el juego completo que manda el backend", () => {
    const { initialData } = parsePrefill({
      prefill: "true",
      aircraft_id: "a1",
      route: "SADF SADR",
      takeoff: "13:00",
      landing: "14:30",
      date: "2026-08-13",
      landings: "3",
      duration: "1.5",
    });
    expect(initialData).toEqual({
      aircraft_id: "a1",
      route: "SADF SADR",
      takeoff: "13:00",
      landing: "14:30",
      date: "2026-08-13",
      landings: 3,
      duration: "1.5",
    });
  });

  /**
   * El parseo viejo asignaba con un cast, así que una clave ausente quedaba como
   * `undefined` dentro de una propiedad declarada `string`. El tipo decía una cosa
   * y el valor era otra.
   */
  it("omite de verdad lo que no vino, en vez de dejar undefined tipado como string", () => {
    const { initialData } = parsePrefill({ prefill: "true", date: "2026-08-13" });
    expect(initialData).toEqual({ date: "2026-08-13" });
    expect("route" in (initialData as object)).toBe(false);
    expect("aircraft_id" in (initialData as object)).toBe(false);
  });

  it("trata el vacío como ausente", () => {
    const { initialData } = parsePrefill({ prefill: "true", route: "", date: "2026-08-13" });
    expect("route" in (initialData as object)).toBe(false);
  });

  /** Un `?landings=hola` dejaba NaN en un campo numérico del formulario. */
  it("descarta un contador de aterrizajes que no es un número", () => {
    const { initialData } = parsePrefill({ prefill: "true", landings: "hola" });
    expect("landings" in (initialData as object)).toBe(false);
  });

  it("acepta purpose, que antes viajaba y se tiraba", () => {
    const { initialData } = parsePrefill({ prefill: "true", purpose: "INST" });
    expect(initialData?.purpose).toBe("INST");
  });

  /**
   * `planned_id` es lo que después cierra el vuelo programado. Si se perdiera acá,
   * el vuelo se cargaría igual —que es lo importante— pero la tarjeta del dashboard
   * seguiría preguntando por un vuelo que el piloto ya registró.
   */
  it("devuelve el id del vuelo programado aparte del prefill", () => {
    const { initialData, plannedId } = parsePrefill({
      prefill: "true",
      planned_id: "p9",
      date: "2026-08-13",
    });
    expect(plannedId).toBe("p9");
    expect("planned_id" in (initialData as object)).toBe(false);
  });

  it("un parámetro repetido se resuelve al primero", () => {
    const { initialData } = parsePrefill({ prefill: "true", route: ["SADF SADR", "SAEZ"] });
    expect(initialData?.route).toBe("SADF SADR");
  });

  it("desde un plan de vuelo: el id del plan", () => {
    const r = parsePrefill({ prefill: "true", plan_vuelo_id: "d28e26ac-8887-4d07-8a82-f6424706c2ab", route: "SADF SADM" });
    expect(r.planVueloId).toBe("d28e26ac-8887-4d07-8a82-f6424706c2ab");
    expect(r.initialData).toEqual({ route: "SADF SADM" });
  });

  it("un id de plan con otra forma no pasa", () => {
    expect(parsePrefill({ prefill: "true", plan_vuelo_id: "../borrar" }).planVueloId).toBeUndefined();
  });
});

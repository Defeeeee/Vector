/**
 * Este módulo decide si una hora que ve un piloto es la misma que la que se
 * guarda en su libro. Invertir la conversión mueve **todos** los vuelos tres
 * horas y rompe la detección de superposiciones de la auditoría sin tirar un solo
 * error — el comentario de `FlightLogForm` avisa exactamente de eso.
 *
 * Lo otro que se testea acá es la vuelta al día: un vuelo que sale 23:00 local es
 * 02:00 UTC, y eso tiene que dar 02:00 y no 26:00 ni -1:00.
 */

import { describe, expect, it } from "vitest";
import {
  UTC_OFFSET_ARG,
  aLocal,
  aUtc,
  correrReloj,
  esHora,
  soloHoraYMinuto,
  problemaDeHoras,
  normalizarHoraTipeada,
  filtrarHoraTipeada,
  horariosDelVuelo,
} from "./horarios";

describe("esHora", () => {
  it("acepta horas de reloj y rechaza el resto", () => {
    expect(esHora("00:00")).toBe(true);
    expect(esHora("23:59")).toBe(true);
    expect(esHora("24:00")).toBe(false);
    expect(esHora("23:60")).toBe(false);
    expect(esHora("9:00")).toBe(false);
    expect(esHora("")).toBe(false);
    expect(esHora("hola")).toBe(false);
  });
});

describe("aLocal y aUtc", () => {
  /** El sentido de la conversión. Si esto se da vuelta, se da vuelta toda la app. */
  it("UTC va tres horas atrás para mostrarse, y al revés para guardarse", () => {
    expect(aLocal("12:00")).toBe("09:00");
    expect(aUtc("09:00")).toBe("12:00");
    expect(UTC_OFFSET_ARG).toBe(-3);
  });

  it("una hora sobrevive la ida y la vuelta", () => {
    for (const h of ["00:00", "05:30", "12:45", "23:59"]) {
      expect(aUtc(aLocal(h))).toBe(h);
    }
  });

  /**
   * El caso que rompe una resta ingenua: 23:00 local son las 02:00 UTC del día
   * siguiente, y 01:00 UTC son las 22:00 local del día anterior.
   */
  it("da la vuelta al día en las dos direcciones", () => {
    expect(aUtc("23:00")).toBe("02:00");
    expect(aLocal("01:00")).toBe("22:00");
    expect(aLocal("00:00")).toBe("21:00");
  });

  it("deja intacto lo que no es una hora, para no romper un campo a medio tipear", () => {
    expect(aLocal("1")).toBe("1");
    expect(aUtc("")).toBe("");
  });
});

describe("correrReloj", () => {
  it("acepta corrimientos de más de un día sin desbordar", () => {
    expect(correrReloj("10:00", 25)).toBe("11:00");
    expect(correrReloj("10:00", -25)).toBe("09:00");
  });
});

describe("soloHoraYMinuto", () => {
  /**
   * Postgres devuelve "14:00:00" para una columna `time`. Un `<input type="time">`
   * con segundos lo descarta **sin decir nada**: el campo queda vacío y parece que
   * el dato nunca se guardó.
   */
  it("recorta los segundos que manda Postgres", () => {
    expect(soloHoraYMinuto("14:00:00")).toBe("14:00");
    expect(soloHoraYMinuto("09:30")).toBe("09:30");
  });

  it("el vacío y el null dan cadena vacía", () => {
    expect(soloHoraYMinuto(null)).toBe("");
    expect(soloHoraYMinuto(undefined)).toBe("");
    expect(soloHoraYMinuto("")).toBe("");
    expect(soloHoraYMinuto("basura")).toBe("");
  });
});

describe("problemaDeHoras", () => {
  it("dos horas bien no son problema", () => {
    expect(problemaDeHoras("14:30", "16:00")).toBeNull();
  });

  it("vacías tampoco: son opcionales en un plan", () => {
    expect(problemaDeHoras("", "")).toBeNull();
    expect(problemaDeHoras("14:30", "")).toBeNull();
  });

  it("**una hora a medio completar se explica, no se rechaza en genérico**", () => {
    /*
      Es el caso real: un `<input type="time">` con el AM/PM sin elegir deja el `value` en
      cadena vacía **aunque la hora y los minutos se vean puestos**, y el navegador bloquea
      el envío con su mensaje genérico. El piloto ve un horario escrito y un cartel que le
      dice que es inválido, sin decirle qué le falta.

      Acá el estado roto llega como un valor que no es `HH:MM`, y el mensaje dice cuál de
      los dos campos es.
    */
    expect(problemaDeHoras("14", "16:00")).toContain("despegue");
    expect(problemaDeHoras("14:30", "16")).toContain("aterrizaje");
    expect(problemaDeHoras("25:00", "")).toContain("despegue");
  });

  it("no exige que el aterrizaje sea posterior", () => {
    /*
      Un vuelo que sale 23:30 y aterriza 00:40 cruza la medianoche y es normal. Rechazarlo
      obligaría a cargar el plan mal a propósito — y son horas tentativas, no el registro.
    */
    expect(problemaDeHoras("23:30", "00:40")).toBeNull();
  });

  it("los segundos no son basura: hay navegadores que se los agregan solos", () => {
    /*
      Un `<input type="time">` puede devolver `"12:30:00"`. Es una hora perfectamente
      buena escrita con un campo de más, y rechazarla trabaría el alta sin motivo.
    */
    expect(problemaDeHoras("12:30:00", "15:30:00")).toBeNull();
  });
});

describe("normalizarHoraTipeada", () => {
  it("acepta las dos formas en que se escribe una hora en una planilla", () => {
    expect(normalizarHoraTipeada("1530")).toBe("15:30");
    expect(normalizarHoraTipeada("15:30")).toBe("15:30");
  });

  it("tres dígitos son H:MM, que es la abreviación natural", () => {
    expect(normalizarHoraTipeada("930")).toBe("09:30");
    expect(normalizarHoraTipeada("9:30")).toBe("09:30");
    expect(normalizarHoraTipeada("000")).toBe("00:00");
  });

  it("los bordes del reloj", () => {
    expect(normalizarHoraTipeada("0000")).toBe("00:00");
    expect(normalizarHoraTipeada("2359")).toBe("23:59");
  });

  it("vacío y espacios quedan vacíos: en un plan la hora es opcional", () => {
    expect(normalizarHoraTipeada("")).toBe("");
    expect(normalizarHoraTipeada("   ")).toBe("");
  });

  it("**lo que no cierra vuelve intacto: normaliza, no adivina**", () => {
    /*
      Un `9` suelto podría leerse como `09:00`, y sería inventarle los minutos a alguien que
      capaz se fue del campo antes de terminar de escribir `09:30`. Vuelve como está y
      `problemaDeHoras` le dice que complete hora y minutos.

      Lo mismo con una hora que no existe: convertir `2515` en algo sería peor que
      rechazarlo.
    */
    expect(normalizarHoraTipeada("9")).toBe("9");
    expect(normalizarHoraTipeada("15")).toBe("15");
    expect(normalizarHoraTipeada("2515")).toBe("2515");
    expect(normalizarHoraTipeada("1265")).toBe("1265");
    expect(normalizarHoraTipeada("12345")).toBe("12345");
    expect(normalizarHoraTipeada("hola")).toBe("hola");
  });

  it("lo que devuelve, o es vacío o lo entiende problemaDeHoras", () => {
    /*
      El contrato entre las dos: si la normalización devolvió algo utilizable, el validador
      no lo rechaza. Sin esto podrían discrepar y el piloto vería un error sobre un campo
      que la app misma acaba de reescribir.
    */
    for (const t of ["1530", "930", "0000", "2359", "9:30", "15:30"]) {
      expect(problemaDeHoras(normalizarHoraTipeada(t), "")).toBeNull();
    }
  });
});

describe("filtrarHoraTipeada", () => {
  it("deja pasar lo que forma una hora y nada más", () => {
    expect(filtrarHoraTipeada("15:30")).toBe("15:30");
    expect(filtrarHoraTipeada("1a5b:3c0")).toBe("15:30");
    expect(filtrarHoraTipeada("15h30")).toBe("1530");
  });

  it("corta en cinco: `HH:MM` es todo lo que entra", () => {
    expect(filtrarHoraTipeada("153045")).toBe("15304");
    expect(filtrarHoraTipeada("15:30:45")).toBe("15:30");
  });
});


describe("horariosDelVuelo", () => {
  it("un vuelo que no cruza la medianoche queda en el mismo día", () => {
    expect(horariosDelVuelo("2026-09-24", "13:10", "14:22")).toEqual({ takeoff_dt: "2026-09-24T13:10:00Z", landing_dt: "2026-09-24T14:22:00Z" });
  });
  it("si la llegada es antes que la salida, es del día siguiente", () => {
    expect(horariosDelVuelo("2026-09-24", "23:00", "00:32")).toEqual({ takeoff_dt: "2026-09-24T23:00:00Z", landing_dt: "2026-09-25T00:32:00Z" });
  });
});

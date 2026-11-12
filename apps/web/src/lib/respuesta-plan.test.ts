import { describe, expect, it } from "vitest";
import {
  clasificarPorReglas,
  cuandoRespuesta,
  direccionDe,
  direccionesDeEncabezado,
  reenviarAlPiloto,
  quienEscribe,
  resumir,
  sinLoCitado,
  textoDeHtml,
} from "./respuesta-plan";

describe("sinLoCitado", () => {
  it("saca las líneas con > y el 'El … escribió:'", () => {
    const t = [
      "Plan recibido y aceptado.",
      "Buen vuelo.",
      "",
      "El mar, 17 nov 2026 a las 15:20, Lucía Ferrari <lucia@example.com> escribió:",
      "> LVS100-SRDL(1815)SADM_171026",
      "> Desde SADM hasta SRDL",
    ].join("\n");
    expect(sinLoCitado(t)).toBe("Plan recibido y aceptado.\nBuen vuelo.");
  });
  it("corta el 'escribió:' que el cliente partió en dos líneas", () => {
    const t = ["Aceptado.", "El mar, 17 nov 2026 a las 15:20, Lucía Ferrari <lucia@example.com>", "escribió:", "> hola"].join("\n");
    expect(sinLoCitado(t)).toBe("Aceptado.");
  });
  it("entiende 'On … wrote:' y el mensaje original", () => {
    expect(sinLoCitado("OK\nOn Tue, Nov 17, 2026 at 3:20 PM Vector <a@b.c> wrote:\n> x")).toBe("OK");
    expect(sinLoCitado("Conforme\n\n-----Mensaje original-----\nDe: x@y.z\nTexto")).toBe("Conforme");
  });
  it("corta el bloque De/Enviado/Para/Asunto de Outlook", () => {
    const t = ["Rechazado, falta la firma.", "", "De: Lucía <lucia@example.com>", "Enviado: martes, 17 de noviembre de 2026 15:20", "Para: acmor@eana.com.ar", "Asunto: plan"].join("\n");
    expect(sinLoCitado(t)).toBe("Rechazado, falta la firma.");
  });
  it("saca la firma '-- ' y el 'Enviado desde mi iPhone'", () => {
    expect(sinLoCitado("Recibido\n-- \nACMOR Morón\nTel 4444")).toBe("Recibido");
    expect(sinLoCitado("Recibido\nEnviado desde mi iPhone\n")).toBe("Recibido");
  });
  it("un 'De:' suelto en el texto no corta nada", () => {
    expect(sinLoCitado("De: SADM a SRDL, aceptado")).toBe("De: SADM a SRDL, aceptado");
  });
  it("normaliza saltos Windows y no inventa texto", () => {
    expect(sinLoCitado("Hola\r\n\r\n\r\n\r\nChau")).toBe("Hola\n\nChau");
    expect(sinLoCitado("> sólo cita")).toBe("");
  });
});

describe("textoDeHtml", () => {
  it("pasa a texto, sin estilos ni citas", () => {
    const h = "<style>p{}</style><div>Plan <b>aceptado</b><br>Saludos &amp; gracias</div><blockquote>viejo</blockquote>";
    expect(textoDeHtml(h).trim()).toBe("Plan aceptado\nSaludos & gracias");
  });
});

describe("clasificarPorReglas", () => {
  const casos: [string, ReturnType<typeof clasificarPorReglas>][] = [
    ["Plan de vuelo ACEPTADO. Buen vuelo.", "aceptado"],
    ["Estimado piloto: su plan de vuelo fue aceptado.", "aceptado"],
    ["Conforme, queda presentado.", "aceptado"],
    ["Recibido, gracias.", "recibido"],
    ["Acuse de recibo del plan LVS100.", "recibido"],
    ["Recibimos su mensaje, lo procesamos a la brevedad.", "recibido"],
    ["Recibido. Falta la casilla 18 (PBN).", "corregir"],
    ["Favor de corregir el equipo en la casilla 10.", "corregir"],
    ["Hay un error en la casilla 15, verifique la ruta.", "corregir"],
    ["Plan rechazado.", "rechazado"],
    ["Recibido pero no se acepta: fuera de horario del aeródromo.", "rechazado"],
    ["El plan no fue aceptado por EOBT vencida.", "rechazado"],
    ["Aceptado, sin errores.", "aceptado"],
    ["Aceptado. No falta nada.", "aceptado"],
    ["Plan de vuelo aceptado, recibido y conforme", "aceptado"],
    ["Gracias por su consulta, nos comunicaremos.", null],
    ["", null],
  ];
  for (const [texto, esperado] of casos) {
    it(`"${texto}" -> ${esperado}`, () => expect(clasificarPorReglas(texto)).toBe(esperado));
  }
  it("ignora tildes y mayúsculas", () => {
    expect(clasificarPorReglas("CORRECCIÓN necesaria")).toBe("corregir");
    expect(clasificarPorReglas("RECHAZADÓ")).toBe("rechazado");
  });
});

describe("resumir", () => {
  it("deja intacto lo corto y junta espacios", () => {
    expect(resumir("Plan   aceptado.\n\nBuen vuelo.")).toBe("Plan aceptado. Buen vuelo.");
  });
  it("corta sin partir palabras y agrega puntos suspensivos", () => {
    const r = resumir("uno dos tres cuatro cinco seis siete ocho nueve diez", 25);
    expect(r).toBe("uno dos tres cuatro cinco…");
    expect(r.length).toBeLessThanOrEqual(26);
  });
  it("una sola palabra larguísima se corta igual", () => {
    expect(resumir("x".repeat(300), 20)).toBe(`${"x".repeat(20)}…`);
  });
});

describe("quién escribe", () => {
  const piloto = "lucia@example.com";
  const oficinas = ["acmor@eana.com.ar"];
  it("la oficina a la que se mandó, con o sin nombre y mayúsculas", () => {
    expect(quienEscribe("acmor@eana.com.ar", oficinas, piloto)).toBe("oficina");
    expect(quienEscribe("ACMOR Morón <ACMOR@eana.com.ar>", oficinas, piloto)).toBe("oficina");
  });
  it("otra casilla del mismo dominio también es la oficina", () => {
    expect(quienEscribe("ais.moron@eana.com.ar", oficinas, piloto)).toBe("oficina");
  });
  it("el piloto se ignora", () => {
    expect(quienEscribe("Lucía <Lucia@Example.com>", oficinas, piloto)).toBe("piloto");
  });
  it("cualquier otro es 'otro'; sin dirección también", () => {
    expect(quienEscribe("spam@mal.com", oficinas, piloto)).toBe("otro");
    expect(quienEscribe("sin arroba", oficinas, piloto)).toBe("otro");
  });
  it("sin envíos a la oficina, nadie es la oficina", () => {
    expect(quienEscribe("acmor@eana.com.ar", [], piloto)).toBe("otro");
  });
  it("el dominio del piloto no vuelve oficina a todo el mundo (las pruebas van al piloto)", () => {
    expect(quienEscribe("otro@example.com", [piloto], piloto)).toBe("otro");
  });
  it("direccionDe y las direcciones de un encabezado", () => {
    expect(direccionDe(" Nombre <A@B.com> ")).toBe("a@b.com");
    expect(direccionesDeEncabezado('"Díaz, Lucía" <LUCIA@example.com>, plan-x@respuestas.vector.fdiaznem.com.ar')).toEqual([
      "lucia@example.com",
      "plan-x@respuestas.vector.fdiaznem.com.ar",
    ]);
    expect(direccionesDeEncabezado(["a@b.c", "D <d@e.f>"])).toEqual(["a@b.c", "d@e.f"]);
    expect(direccionesDeEncabezado(undefined)).toBeNull();
  });
  it("reenvía sólo si los encabezados dicen que el piloto no la recibió", () => {
    expect(reenviarAlPiloto(piloto, { to: "plan-x@respuestas.vector.fdiaznem.com.ar", cc: "Lucía <LUCIA@example.com>" })).toBe(false);
    expect(reenviarAlPiloto(piloto, { to: "Lucía <lucia@example.com>, plan-x@respuestas.vector.fdiaznem.com.ar" })).toBe(false);
    expect(reenviarAlPiloto(piloto, { to: "plan-x@respuestas.vector.fdiaznem.com.ar" })).toBe(true);
    // Sin encabezados no se sabe: no se reenvía (el caso del 2026-11-12, con el piloto en la respuesta).
    expect(reenviarAlPiloto(piloto, null)).toBe(false);
    expect(reenviarAlPiloto(piloto, { cc: "otro@x.com" })).toBe(false);
  });
});

describe("cuandoRespuesta", () => {
  it("arma la fecha sin toLocaleString", () => {
    expect(cuandoRespuesta("2026-11-17T15:20:33+00:00")).toBe("17/11 15:20Z");
    expect(cuandoRespuesta(null)).toBe("");
  });
});

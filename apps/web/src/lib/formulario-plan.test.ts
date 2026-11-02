import { describe, expect, it } from "vitest";
import {
  aplicarAvion,
  duplicar,
  formularioVacio,
  leerFormulario,
  localDesdeUtc,
  horaDeTexto,
  nodosDeEntrada,
  nodosDeRuta,
  normalizar,
  observacionesDe,
  rutaDesdeNodos,
  sugerirEetConocidos,
  revisar,
  sugerirAutonomia,
  sugerirEet,
  tasDeVelocidad,
  telefonoConMas,
  tokensDeRuta,
  type FormularioPlan,
} from "./formulario-plan";
import { mensajeFpl, nombreDelArchivo } from "./plan-de-vuelo";

/**
 * El plan que Federico presentó el 10/10/2026 y EANA le aceptó, con otro nombre y otro
 * teléfono: `LVS114-SADF1530SADF_101026.pdf`.
 */
const ACEPTADO: FormularioPlan = {
  ...formularioVacio(),
  matricula: "LV-S114",
  tipoAeronave: "ECHO",
  equipo: "SDGZ",
  vigilancia: "EB2",
  salida: { codigo: "SADF", nombre: "San Fernando" },
  dofUtc: "2026-10-10",
  eobtUtc: "1530",
  velocidad: "N0090",
  nivel: "A010",
  ruta: "DCT ATE DCT",
  destino: { codigo: "SADF", nombre: "San Fernando" },
  eet: "0100",
  altn1: { codigo: "SADM", nombre: "Morón" },
  otros: { NAV: "ABAS", OPR: "Smart Flight", PER: "A" },
  autonomia: "0500",
  personas: "2",
  colorMarcas: "Blanco y azul",
  observaciones: "T.E. +5491100000000",
  piloto: "Lucía Ferrari PPA 12345678",
};

describe("revisar: el formulario a un plan OACI", () => {
  it("reproduce el plan que EANA aceptó, casilla por casilla", () => {
    const r = revisar(ACEPTADO);
    expect(r.errores).toEqual([]);
    expect(r.completo).toBe(true);
    expect(r.porcentaje).toBe(100);
    expect(mensajeFpl(r.plan)).toBe(
      "(FPL-LVS114-VG-ECHO/L-SDGZ/EB2-SADF1530-N0090A010 DCT ATE DCT-SADF0100 SADM-NAV/ABAS DOF/261010 OPR/SMART FLIGHT PER/A)"
    );
    expect(r.plan.c19).toMatchObject({
      autonomia: "0500",
      personas: "2",
      radio: { u: false, v: false, e: true },
      colorMarcas: "BLANCO Y AZUL",
      observaciones: "T.E. +5491100000000",
      piloto: "LUCIA FERRARI PPA 12345678",
    });
    expect(r.plan.presentadoPor).toBe("");
    expect(nombreDelArchivo(r.plan)).toBe("LVS114-SADF1530SADF_101026.pdf");
  });

  it("la ruta es texto libre: un vuelo al sector escuela también se presenta", () => {
    const r = revisar({ ...ACEPTADO, ruta: "dct  sector escuela dct" });
    expect(r.estados.ruta).toBe("ok");
    expect(r.plan.c15ruta).toBe("DCT SECTOR ESCUELA DCT");
  });

  it("un formulario vacío dice qué falta y no está completo", () => {
    const r = revisar(formularioVacio());
    expect(r.completo).toBe(false);
    expect(r.estados).toMatchObject({ matricula: "falta", salida: "falta", eet: "falta", autonomia: "falta", numero: "opcional" });
    expect(r.porcentaje).toBeLessThan(30);
  });

  it("los formatos rotos son errores, con la casilla en el mensaje", () => {
    const r = revisar({ ...ACEPTADO, velocidad: "90", nivel: "1000", eet: "0075", personas: "dos" });
    expect(r.estados).toMatchObject({ velocidad: "error", nivel: "error", eet: "error", personas: "error" });
    expect(r.errores.map((e) => e.mensaje.slice(0, 10))).toEqual(["Casilla 15", "Casilla 15", "Casilla 16", "Casilla 19"]);
  });

  it("acepta VFR como nivel, TBN como personas, y K o M como velocidad", () => {
    const r = revisar({ ...ACEPTADO, nivel: "vfr", personas: "tbn", velocidad: "K0185" });
    expect(r.errores).toEqual([]);
  });

  it("un aeródromo sin OACI va con ZZZZ y su nombre y lugar en DEP/ o DEST/", () => {
    const r = revisar({ ...ACEPTADO, destino: { codigo: "CNL", nombre: "Cañuelas", lat: -35, lon: -58.75 } });
    expect(r.plan.c16ad).toBe("ZZZZ");
    expect(r.plan.c18).toContain("DEST/CANUELAS 3500S05845W");
  });

  it("ZZZZ en el tipo pide TYP/", () => {
    expect(revisar({ ...ACEPTADO, tipoAeronave: "ZZZZ" }).errores.map((e) => e.campo)).toContain("otros.TYP");
    expect(revisar({ ...ACEPTADO, tipoAeronave: "ZZZZ", otros: { ...ACEPTADO.otros, TYP: "AERO BOERO 115" } }).completo).toBe(true);
  });

  it("avisa sin frenar: la salida que ya pasó y la autonomía que no alcanza", () => {
    const r = revisar({ ...ACEPTADO, autonomia: "0045" }, "2026-10-11T00:00:00Z");
    expect(r.completo).toBe(true);
    expect(r.avisos.map((a) => a.campo)).toEqual(["fechaHora", "autonomia"]);
  });

  it("lo que no se lleva sale tachado aunque haya quedado marcado adentro", () => {
    const r = revisar({ ...ACEPTADO, supervivencia: { s: false, p: true, d: true, m: false, j: false } });
    expect(r.plan.c19.supervivencia).toEqual({ s: false, p: false, d: false, m: false, j: false });
  });

  it("sin observaciones, la N sale tachada", () => {
    expect(revisar({ ...ACEPTADO, observaciones: " " }).plan.c19.observaciones).toBeNull();
  });
});

describe("el perfil del avión", () => {
  const avion = {
    id: "a1",
    registration: "LV-S114",
    icao: "echo",
    plan_vuelo: { equipo: "SDGZ", vigilancia: "EB2", nav: "ABAS", opr: "SMART FLIGHT", per: "A", colorMarcas: "BLANCO Y AZUL", elt: true, observacionFija: "INSTRUCCION" },
  };
  const piloto = { comandante: "LUCIA FERRARI PPA 12345678", telefono: "5491100000000" };

  it("llena lo que no cambia entre vuelos y lo marca como del avión", () => {
    const f = aplicarAvion(formularioVacio(), avion, piloto);
    expect(f).toMatchObject({
      aircraftId: "a1",
      matricula: "LV-S114",
      tipoAeronave: "ECHO",
      equipo: "SDGZ",
      vigilancia: "EB2",
      otros: { NAV: "ABAS", OPR: "SMART FLIGHT", PER: "A" },
      colorMarcas: "BLANCO Y AZUL",
      radio: { u: false, v: false, e: true },
      observaciones: "T.E. +5491100000000 INSTRUCCION",
      piloto: "LUCIA FERRARI PPA 12345678",
    });
    expect(f.origen).toMatchObject({ equipo: "avion", "otros.NAV": "avion", observaciones: "avion" });
    expect(aplicarAvion(formularioVacio(), { ...avion, cruise_tas_kt: 90 }, piloto).velocidad).toBe("N0090");
    expect(aplicarAvion({ ...formularioVacio(), velocidad: "N0085" }, { ...avion, cruise_tas_kt: 90 }, piloto).velocidad).toBe("N0085");
  });

  it("cambiar de avión saca lo del avión anterior pero no lo que escribió el piloto en la 18", () => {
    const conRmk = aplicarAvion({ ...formularioVacio(), otros: { RMK: "VUELO DE PRUEBA" } }, avion, piloto);
    const otro = aplicarAvion(conRmk, { id: "a2", registration: "LV-ABC", icao: "C152", plan_vuelo: null }, piloto);
    expect(otro.otros).toEqual({ RMK: "VUELO DE PRUEBA" });
    expect(otro.equipo).toBe("SDGZ"); // sin perfil, queda lo que había
  });

  it("el teléfono va con el + y el prefijo T.E.", () => {
    expect(telefonoConMas("5491168862612")).toBe("+5491168862612");
    expect(telefonoConMas("+54 9 11 6886-2612")).toBe("+54 9 11 6886-2612");
    expect(observacionesDe({ comandante: "", telefono: "" }, null)).toBe("");
  });
});

describe("duplicar y releer", () => {
  it("duplicar borra la fecha, la hora y las sugerencias del día", () => {
    const d = duplicar({ ...ACEPTADO, sugerencias: { autonomia: { valor: "0500", motivo: "x" } } });
    expect(d).toMatchObject({ dofUtc: "", eobtUtc: "", sugerencias: {}, ruta: "DCT ATE DCT" });
  });

  it("la EOBT se escribe en UTC y queda con cuatro cifras", () => {
    expect(normalizar({ ...ACEPTADO, eobtUtc: "18:30" }).eobtUtc).toBe("1830");
    expect(normalizar({ ...ACEPTADO, eobtUtc: "18" }).eobtUtc).toBe("18");
    expect(revisar({ ...ACEPTADO, eobtUtc: "18" }).estados.hora).toBe("error");
    expect(revisar({ ...ACEPTADO, dofUtc: "2026-02-31" }).estados.fecha).toBe("error");
    // Con la fecha cargada y la hora todavía vacía, la fecha está bien: falta sólo la hora.
    const sinHora = revisar({ ...ACEPTADO, eobtUtc: "" });
    expect(sinHora.estados.fecha).toBe("ok");
    expect(sinHora.estados.hora).toBe("falta");
    expect(sinHora.errores.map((e) => e.mensaje)).toContain("Casilla 13: falta la hora de salida (EOBT, en UTC).");
  });

  it("un plan de antes, con la salida en hora argentina, se pasa a UTC al leerlo", () => {
    // 22:15 del 10/10 en Argentina es 0115 UTC del 11.
    expect(leerFormulario({ fechaLocal: "2026-10-10", horaLocal: "22:15" })).toMatchObject({ dofUtc: "2026-10-11", eobtUtc: "0115" });
    expect(leerFormulario({ fechaLocal: "2026-10-16", horaLocal: "" })).toMatchObject({ dofUtc: "2026-10-16", eobtUtc: "" });
    expect("fechaLocal" in leerFormulario({ fechaLocal: "2026-10-10", horaLocal: "22:15" })).toBe(false);
  });

  it("un plan guardado con campos de menos se completa con los valores por defecto", () => {
    const f = leerFormulario({ matricula: "LV-S114", radio: { u: true } });
    expect(f.radio).toEqual({ u: true, v: false, e: true });
    expect(f.ruta).toBe("DCT");
    expect(leerFormulario(null)).toEqual(formularioVacio());
  });

  it("la hora local de una EOBT en UTC", () => {
    expect(localDesdeUtc("2026-10-11", "0115")).toEqual({ fecha: "2026-10-10", hora: "22:15" });
    expect(localDesdeUtc("", "1530")).toBeNull();
  });
});

describe("sugerencias", () => {
  it("la duración, sin viento, con de dónde sale", () => {
    expect(sugerirEet(52, 90)).toEqual({ valor: "0035", motivo: "52 NM a 90 kt, sin viento" });
    expect(sugerirEet(1, 90)).toEqual({ valor: "0001", motivo: "1 NM a 90 kt, sin viento" });
    expect(sugerirEet(0, 90)).toBeNull();
  });

  it("la autonomía, redondeada para abajo", () => {
    expect(sugerirAutonomia(100, 23, "con los tanques llenos")).toEqual({ valor: "0420", motivo: "100 L a 23 L/h con los tanques llenos" });
    expect(sugerirAutonomia(0, 20, "")).toBeNull();
  });

  it("la TAS de la casilla 15", () => {
    expect(tasDeVelocidad("N0090")).toBe(90);
    expect(tasDeVelocidad("K0185")).toBe(100);
    expect(tasDeVelocidad("M082")).toBeNull();
  });

  it("la ruta escrita vuelve a puntos, y lo que no es un punto se nombra", () => {
    expect(tokensDeRuta("DCT ATE DCT")).toEqual([{ tipo: "punto", token: "ATE", texto: "ATE" }]);
    expect(tokensDeRuta("dct 3441S05838W BAR045025 UM424 SECTOR-1")).toEqual([
      { tipo: "punto", token: "S34.6833/W58.6333", texto: "3441S05838W" },
      { tipo: "punto", token: "BAR/045/25", texto: "BAR045025" },
      { tipo: "aerovia", token: "UM424", texto: "UM424" },
      { tipo: "desconocido", texto: "SECTOR-1" },
    ]);
    expect(tokensDeRuta("DCT SECTOR ESCUELA DCT").map((t) => t.tipo)).toEqual(["desconocido", "desconocido"]);
  });
});

describe("la ruta como nodos", () => {
  it("los DCT son flechas, no nodos", () => {
    expect(nodosDeRuta("DCT ATE DCT").map((n) => n.texto)).toEqual(["ATE"]);
    expect(nodosDeRuta("DCT")).toEqual([]);
  });

  it("palabras desconocidas seguidas son un solo lugar; separadas por DCT, dos", () => {
    expect(nodosDeRuta("DCT SECTOR ESCUELA DCT")).toEqual([{ texto: "SECTOR ESCUELA", tipo: "desconocido", geografico: false }]);
    expect(nodosDeRuta("DCT LAGUNA DCT ESCUELA DCT").map((n) => n.texto)).toEqual(["LAGUNA", "ESCUELA"]);
  });

  it("aerovías, coordenadas y radiales se reconocen", () => {
    expect(nodosDeRuta("DCT BCA W67 OSA DCT 3441S05838W BAR045025").map((n) => [n.texto, n.tipo, n.geografico])).toEqual([
      ["BCA", "punto", false],
      ["W67", "aerovia", false],
      ["OSA", "punto", false],
      ["3441S05838W", "punto", true],
      ["BAR045025", "punto", true],
    ]);
  });

  it("de nodos a la casilla 15, con los DCT donde van", () => {
    for (const ruta of [
      "DCT ATE DCT",
      "DCT SECTOR ESCUELA DCT",
      "DCT LAGUNA DCT ESCUELA DCT",
      "DCT BCA W67 OSA DCT SRA DCT",
      "DCT 3441S05838W BAR045025 DCT BAR DCT",
      "DCT BCA W67",
      "DCT",
    ]) {
      expect(rutaDesdeNodos(nodosDeRuta(ruta))).toBe(ruta);
    }
  });

  it("lo que se escribe para sumar: un nombre con espacios es un nodo; una ruta pegada, varios", () => {
    expect(nodosDeEntrada("punta lara").map((n) => n.texto)).toEqual(["PUNTA LARA"]);
    expect(nodosDeEntrada("ate bar").map((n) => n.texto)).toEqual(["ATE BAR"]);
    expect(nodosDeEntrada("ate bar", true).map((n) => n.texto)).toEqual(["ATE", "BAR"]);
    expect(nodosDeEntrada("sector escuela", true).map((n) => n.texto)).toEqual(["SECTOR ESCUELA"]);
    expect(nodosDeEntrada("DCT ATE DCT SECTOR ESCUELA DCT").map((n) => n.texto)).toEqual(["ATE", "SECTOR ESCUELA"]);
    expect(nodosDeEntrada("  ")).toEqual([]);
  });

  it("la duración con los puntos conocidos, nombrando los que no se contaron", () => {
    const plano = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.abs(a.lat - b.lat) + Math.abs(a.lon - b.lon);
    const s = sugerirEetConocidos(
      [
        { lat: 0, lon: 0 },
        { lat: 30, lon: 0 },
        { lat: 60, lon: 0 },
      ],
      ["SECTOR ESCUELA"],
      90,
      plano
    );
    expect(s).toEqual({ valor: "0040", motivo: "60 NM a 90 kt, sin viento, sin contar SECTOR ESCUELA" });
    expect(sugerirEetConocidos([{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }], ["SECTOR"], 90, plano)).toBeNull();
  });
});

describe("la hora, en 24 h", () => {
  it("acepta como la escribe un piloto", () => {
    expect(horaDeTexto("15:30")).toBe("15:30");
    expect(horaDeTexto("1530")).toBe("15:30");
    expect(horaDeTexto("15.30")).toBe("15:30");
    expect(horaDeTexto("9:05")).toBe("09:05");
    expect(horaDeTexto("905")).toBe("09:05");
    expect(horaDeTexto(" 00:00 ")).toBe("00:00");
  });

  it("lo que no es una hora, no", () => {
    expect(horaDeTexto("25:00")).toBeNull();
    expect(horaDeTexto("15:75")).toBeNull();
    expect(horaDeTexto("3 pm")).toBeNull();
    expect(horaDeTexto("")).toBeNull();
  });
});

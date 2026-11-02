import { describe, expect, it } from "vitest";
import { CRUZADO_A_MENCIONAR_KT, armarMensaje, avisos, fechaLarga, veredictoDe, type PuntoBriefing } from "./briefing-mail";
import { VIENTO_ATENCION_KT } from "./briefing";

const punto = (over: Partial<PuntoBriefing> = {}): PuntoBriefing => ({
  icao: "SADM",
  label: "Morón",
  categoria: "VFR",
  respondio: true,
  ...over,
});

const datos = (over: Partial<Parameters<typeof armarMensaje>[0]> = {}) => ({
  fecha: "2026-08-20",
  ruta: "SADM SAAJ",
  matricula: "LV-ABC",
  puntos: [punto(), punto({ icao: "SAAJ", label: "Junín" })],
  urlPlanificador: "https://vector.example/dashboard/planificador?ruta=SADM-SAAJ",
  armadoA: "19 de agosto a las 18:00",
  ...over,
});

describe("fechaLarga", () => {
  it("escribe la fecha como se dice", () => {
    expect(fechaLarga("2026-08-20")).toBe("jueves 20 de agosto");
  });

  it("**no se corre de día al leerla en UTC-3**", () => {
    /*
      Es el bug de hidratación que este repo ya se comió dos veces: `new Date("2026-08-01")`
      es medianoche UTC, que en Buenos Aires cae el 31 de julio. Se construye al mediodía
      UTC justamente para que ningún huso lo mueva.
    */
    expect(fechaLarga("2026-08-01")).toBe("sábado 1 de agosto");
    expect(fechaLarga("2026-01-01")).toBe("jueves 1 de enero");
    expect(fechaLarga("2026-12-31")).toBe("jueves 31 de diciembre");
  });
});

describe("avisos", () => {
  it("una ruta sin novedades no genera ninguno", () => {
    /*
      **Un mail que enumera las diez cosas que están bien entierra la única que no**, y se
      deja de leer a la tercera vez. Sólo se marca lo que se aparta.
    */
    expect(avisos([punto(), punto({ icao: "SAAJ" })])).toEqual([]);
  });

  it("marca la categoría cuando no es VFR", () => {
    expect(avisos([punto({ categoria: "IFR" })])[0]).toContain("SADM: IFR");
    expect(avisos([punto({ categoria: "MVFR" })])[0]).toContain("VFR marginal");
  });

  it("**cuando no se sabe, lo dice sin disimular**", () => {
    /*
      La misma regla que `veredictoDeRuta`: "no respondió" no es "está bien". Es el bug que
      la pantalla vieja tenía y que no puede volver por la puerta del mail.
    */
    const a = avisos([punto({ respondio: false, categoria: "UNK" })]);
    expect(a[0]).toContain("no pudimos consultar");
    expect(a[0]).toContain("no lo sabemos");
  });

  it("marca el viento cruzado a partir del umbral", () => {
    expect(avisos([punto({ cruzadoKt: 14 })])).toEqual([]);
    const a = avisos([punto({ cruzadoKt: 18, pista: "20" })]);
    expect(a[0]).toContain("18 kt de cruzado");
    expect(a[0]).toContain("en la 20");
  });

  it("usa el mismo umbral que la pantalla", () => {
    /*
      Dos umbrales para la misma cosa harían que el mail y el briefing discreparan sobre si
      hay que prestar atención, y el piloto tendría que decidir a cuál creerle.
    */
    expect(CRUZADO_A_MENCIONAR_KT).toBe(VIENTO_ATENCION_KT);
  });

  it("cuenta los NOTAM y no menciona el cero", () => {
    expect(avisos([punto({ notams: 2 })])[0]).toContain("2 NOTAM activos");
    expect(avisos([punto({ notams: 1 })])[0]).toContain("1 NOTAM activo");
    expect(avisos([punto({ notams: 0 })])).toEqual([]);
  });

  it("una estación que no respondió no arrastra sus otros avisos", () => {
    // Sin datos no hay cruzado ni NOTAM que reportar: sería inventar precisión.
    const a = avisos([punto({ respondio: false, categoria: "UNK", cruzadoKt: 30, notams: 5 })]);
    expect(a).toHaveLength(1);
  });
});

describe("veredictoDe", () => {
  it("delega en el veredicto de la ruta, sin reinterpretarlo", () => {
    expect(veredictoDe([punto(), punto({ icao: "SAAJ" })]).tono).toBe("bien");
    expect(veredictoDe([punto({ respondio: false, categoria: "UNK" })]).tono).toBe("sinDatos");
  });
});

describe("armarMensaje", () => {
  it("el asunto dice qué vuelo y cómo viene", () => {
    const m = armarMensaje(datos());
    expect(m.asunto).toContain("jueves 20 de agosto");
    expect(m.asunto).toContain("SADM SAAJ");
  });

  it("**siempre dice cuándo se armó y enlaza el briefing en vivo**", () => {
    /*
      El párrafo que evita que este mail haga daño. Armado a las seis de la tarde y leído a
      las siete de la mañana tiene trece horas encima: el METAR cambió, el TAF se enmendó y
      puede haber un NOTAM nuevo. Presentado como definitivo, reemplaza una consulta que el
      piloto iba a hacer igual.
    */
    const m = armarMensaje(datos());
    for (const cuerpo of [m.texto, m.html]) {
      expect(cuerpo).toContain("19 de agosto a las 18:00");
      expect(cuerpo).toContain("https://vector.example/dashboard/planificador?ruta=SADM-SAAJ");
    }
    expect(m.texto).toContain("el clima cambia");
  });

  it("el texto plano tiene lo mismo que el HTML, no un resumen", () => {
    // Un cliente que no renderiza, o un reloj, tienen que servir igual.
    const m = armarMensaje(datos({ puntos: [punto({ metar: "SADM 201200Z 18010KT CAVOK" })] }));
    expect(m.texto).toContain("SADM 201200Z 18010KT CAVOK");
    expect(m.html).toContain("SADM 201200Z 18010KT CAVOK");
  });

  it("sin avisos lo dice en una línea y no inventa contenido", () => {
    const m = armarMensaje(datos());
    expect(m.texto).toContain("No hay nada que marcar");
  });

  it("escapa el HTML de lo que viene de afuera", () => {
    /*
      El METAR y el nombre del aeródromo salen de servicios externos. No es un riesgo de
      seguridad grande en un mail, pero un `<` sin escapar rompe el render y deja al piloto
      con un briefing cortado a la mitad.
    */
    const m = armarMensaje(datos({ puntos: [punto({ metar: "<script>x</script>" })] }));
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("la matrícula es opcional", () => {
    const m = armarMensaje(datos({ matricula: undefined }));
    expect(m.texto).toContain("SADM SAAJ");
    expect(m.texto).not.toContain("undefined");
    expect(m.html).not.toContain("undefined");
  });
});

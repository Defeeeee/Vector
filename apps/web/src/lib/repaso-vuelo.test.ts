import { describe, expect, it } from "vitest";
import { leerFormulario } from "./formulario-plan";
import {
  cifrasDelRepaso,
  decimal,
  diferenciaConElPlan,
  horaDoble,
  miles,
  minutosEscritos,
  puedeRepasar,
  puntosParaElPedido,
  repasoVencido,
  type RepasoVuelo,
} from "./repaso-vuelo";

const plan = (extra: Record<string, unknown> = {}) => leerFormulario({ dofUtc: "2026-11-12", eobtUtc: "1200", eet: "0100", matricula: "LV-ABC", ...extra });
const AHORA = "2026-11-12T13:30:00.000Z";

const completo: RepasoVuelo = {
  estado: "completo",
  motivo: null,
  despegue_adsb: "2026-11-12T12:05:00+00:00",
  aterrizaje_adsb: "2026-11-12T13:12:00+00:00",
  ultima_vista: "2026-11-12T13:12:00+00:00",
  minutos_en_aire: 67,
  eet_min: 60,
  diferencia_min: 7,
  altitud_max_ft: 2500,
  gs_max_kt: 98,
  gs_media_kt: 90,
  millas_voladas: 52.34,
  millas_planeadas: 49.5,
  desvio: { max_nm: 3.04, tramo: { indice: 0, desde: "SADF", hasta: "SAZZ" } },
  aterrizajes_estimados: 1,
  minutos_sin_senal: 12,
  cerca_del_destino: true,
  recorrido: [],
};

describe("cuándo se ofrece el repaso", () => {
  it("después de la salida más la casilla 16", () => {
    expect(puedeRepasar(plan(), [], false, null, "2026-11-12T13:00:00.000Z")).toBe(true);
    expect(puedeRepasar(plan(), [], false, null, "2026-11-12T12:59:00.000Z")).toBe(false);
  });
  it("con una demora cuenta la salida vigente", () => {
    expect(puedeRepasar(plan(), [{ dof: "2026-11-12", eobt: "1300" }], false, null, "2026-11-12T13:30:00.000Z")).toBe(false);
    expect(puedeRepasar(plan(), [{ dof: "2026-11-12", eobt: "1300" }], false, null, "2026-11-12T14:00:00.000Z")).toBe(true);
  });
  it("si el link vio aterrizar, ya", () => {
    expect(puedeRepasar(plan(), [], false, "2026-11-12T12:50:00+00:00", "2026-11-12T12:51:00.000Z")).toBe(true);
  });
  it("cancelado no", () => {
    expect(puedeRepasar(plan(), [], true, "2026-11-12T12:50:00+00:00", AHORA)).toBe(false);
  });
  it("sin salida no se ofrece", () => {
    expect(puedeRepasar(plan({ dofUtc: "", eobtUtc: "" }), [], false, null, AHORA)).toBe(false);
  });
  it("a los 30 días ya no hay posiciones", () => {
    expect(repasoVencido(plan(), [], "2026-12-11T00:00:00.000Z")).toBe(false);
    expect(repasoVencido(plan(), [], "2026-12-13T00:00:00.000Z")).toBe(true);
  });
});

describe("cómo se escribe", () => {
  it("números a la argentina", () => {
    expect(miles(2000)).toBe("2.000");
    expect(miles(12500.4)).toBe("12.500");
    expect(miles(950)).toBe("950");
    expect(decimal(52.34)).toBe("52,3");
  });
  it("minutos", () => {
    expect(minutosEscritos(42)).toBe("42 min");
    expect(minutosEscritos(67)).toBe("1 h 07 min");
  });
  it("la diferencia con el plan", () => {
    expect(diferenciaConElPlan(7)).toBe("7 min más que el plan");
    expect(diferenciaConElPlan(-65)).toBe("1 h 05 min menos que el plan");
    expect(diferenciaConElPlan(1)).toBe("lo que decía el plan");
    expect(diferenciaConElPlan(null)).toBeNull();
  });
  it("la hora, argentina y UTC, sin toLocaleString", () => {
    expect(horaDoble("2026-11-12T12:05:00+00:00")).toBe("09:05 (12:05Z)");
    expect(horaDoble(null)).toBeNull();
    expect(horaDoble("basura")).toBeNull();
  });
  it("los puntos del pedido, con el código limpio", () => {
    expect(
      puntosParaElPedido([
        { lat: -34.45, lon: -58.59, codigo: "SADF", nombre: "x" },
        { lat: -34.5, lon: -59, codigo: "", nombre: "" },
        { lat: -34.6, lon: -59.5, codigo: "A;B,C", nombre: "" },
      ])
    ).toBe("-34.45,-58.59,SADF;-34.5,-59;-34.6,-59.5,ABC");
  });
});

describe("las cifras", () => {
  it("el vuelo completo, en orden y con lo planeado al lado", () => {
    const c = cifrasDelRepaso(completo);
    expect(c.map((x) => x.rotulo)).toEqual([
      "Lo vio despegar",
      "Lo vio aterrizar",
      "En el aire",
      "Distancia",
      "Altitud máxima",
      "Velocidad sobre el suelo",
      "Desvío máximo de la ruta",
      "Aterrizajes",
      "Sin señal",
    ]);
    expect(c[0].valor).toBe("09:05 (12:05Z)");
    expect(c[2]).toMatchObject({ valor: "1 h 07 min", detalle: "plan: 1 h 00 min · 7 min más que el plan" });
    expect(c[3]).toMatchObject({ valor: "52,3 NM" });
    expect(c[4].valor).toBe("2.500 ft");
    expect(c[6].detalle).toContain("SADF → SAZZ");
  });
  it("parcial: no inventa el aterrizaje, dice hasta cuándo lo vio", () => {
    const c = cifrasDelRepaso({ ...completo, estado: "parcial", aterrizaje_adsb: null });
    expect(c.map((x) => x.rotulo)).not.toContain("Lo vio aterrizar");
    expect(c.find((x) => x.rotulo === "Lo vio por última vez")?.valor).toBe("10:12 (13:12Z)");
  });
  it("lo que el ADS-B no trajo no sale en cero", () => {
    const c = cifrasDelRepaso({ estado: "completo", motivo: null, despegue_adsb: completo.despegue_adsb, minutos_en_aire: 30, eet_min: null, desvio: null, minutos_sin_senal: 0 });
    expect(c.map((x) => x.rotulo)).toEqual(["Lo vio despegar", "En el aire"]);
    expect(c[1].detalle).toContain("no tenía duración");
  });
  it("sin datos no hay cifras", () => {
    expect(cifrasDelRepaso({ estado: "sin_datos", motivo: "x" })).toEqual([]);
  });
});

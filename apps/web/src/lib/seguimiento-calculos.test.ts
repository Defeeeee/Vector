import { describe, expect, it } from "vitest";
import {
  avanceSobreRuta,
  duracion,
  estadoMostrado,
  horaArgentina,
  horaArgentinaConDia,
  llegadaEstimada,
  nombreDePunto,
  normalizar,
  puntosDePerfil,
  recorridoNm,
  textoDelAvion,
  textoVertical,
  velocidadVertical,
} from "./seguimiento-calculos";
import type { PuntoPublico, PuntoRecorrido, SeguimientoPublico } from "./seguimiento";

// Tres puntos sobre un meridiano: 60 NM cada tramo (1° de latitud = 60 NM).
const RUTA: PuntoPublico[] = [
  [-34, -58, "AAAA", "Uno"],
  [-35, -58, "BBBB", "Dos"],
  [-36, -58, "CCCC", "Tres"],
];

describe("hora argentina", () => {
  it("UTC−3, armada a mano", () => {
    expect(horaArgentina("2026-11-11T17:35:00Z")).toBe("14:35");
    expect(horaArgentina("2026-11-11T02:05:00Z")).toBe("23:05");
    expect(horaArgentina(null)).toBeNull();
    expect(horaArgentina("ayer")).toBeNull();
  });
  it("mañana y ayer, según el día argentino", () => {
    const ref = "2026-11-11T22:00:00Z"; // 19:00 del 11
    expect(horaArgentinaConDia("2026-11-11T23:30:00Z", ref)).toBe("20:30 hs");
    expect(horaArgentinaConDia("2026-11-12T03:30:00Z", ref)).toBe("00:30 hs de mañana");
    expect(horaArgentinaConDia("2026-11-12T02:59:00Z", ref)).toBe("23:59 hs");
    expect(horaArgentinaConDia("2026-11-10T20:00:00Z", ref)).toBe("17:00 hs de ayer");
  });
  it("duraciones", () => {
    expect(duracion(20)).toBe("menos de 1 min");
    expect(duracion(42 * 60)).toBe("42 min");
    expect(duracion(4500)).toBe("1 h 15 min");
  });
});

describe("avance sobre la ruta", () => {
  it("al principio, 0 %; en la mitad del primer tramo, 25 %", () => {
    const a0 = avanceSobreRuta(RUTA, { lat: -34, lon: -58 })!;
    expect(a0.totalNm).toBeCloseTo(120, 0);
    expect(a0.porcentaje).toBe(0);
    expect(a0.proximo).toBe(1);
    const a = avanceSobreRuta(RUTA, { lat: -34.5, lon: -58 })!;
    expect(a.faltaNm).toBeCloseTo(90, 0);
    expect(a.porcentaje).toBe(25);
    expect(a.proximo).toBe(1);
  });
  it("pasado el punto del medio, el próximo es el último", () => {
    const a = avanceSobreRuta(RUTA, { lat: -35.5, lon: -58 })!;
    expect(a.proximo).toBe(2);
    expect(a.faltaNm).toBeCloseTo(30, 0);
    expect(a.porcentaje).toBe(75);
  });
  it("llegó al final: 100 % y sin próximo", () => {
    const a = avanceSobreRuta(RUTA, { lat: -36, lon: -58 })!;
    expect(a.porcentaje).toBe(100);
    expect(a.proximo).toBeNull();
  });
  it("fuera de la ruta mide el desvío y no pasa de 100 ni baja de 0", () => {
    const a = avanceSobreRuta(RUTA, { lat: -34.5, lon: -57 })!;
    expect(a.desvioNm).toBeGreaterThan(40);
    expect(a.porcentaje).toBeGreaterThanOrEqual(0);
    expect(avanceSobreRuta(RUTA, { lat: -40, lon: -58 })!.porcentaje).toBe(100);
  });
  it("sin ruta o sin posición, no sé", () => {
    expect(avanceSobreRuta([], { lat: 0, lon: 0 })).toBeNull();
    expect(avanceSobreRuta([RUTA[0]], { lat: 0, lon: 0 })).toBeNull();
    expect(avanceSobreRuta(RUTA, null)).toBeNull();
  });
});

describe("lo recorrido", () => {
  it("suma el track y el último tramo hasta la posición", () => {
    const r: PuntoRecorrido[] = [
      [-34, -58, null, null],
      [-34.5, -58, null, null],
    ];
    expect(recorridoNm(r, { lat: -35, lon: -58 })).toBeCloseTo(60, 0);
    expect(recorridoNm([], null)).toBe(0);
  });
});

describe("llegada estimada", () => {
  const ahora = "2026-11-11T15:00:30Z";
  const hora = "2026-11-11T15:00:00Z";
  it("hora de la posición más lo que falta a la GS de entonces", () => {
    expect(llegadaEstimada({ faltaNm: 90, gsKt: 90, horaUltima: hora, ahora })).toBe("2026-11-11T16:00:00.000Z");
  });
  it("no se estima con GS baja, sin GS, sin ruta o con datos viejos", () => {
    expect(llegadaEstimada({ faltaNm: 90, gsKt: 20, horaUltima: hora, ahora })).toBeNull();
    expect(llegadaEstimada({ faltaNm: 90, gsKt: null, horaUltima: hora, ahora })).toBeNull();
    expect(llegadaEstimada({ faltaNm: null, gsKt: 90, horaUltima: hora, ahora })).toBeNull();
    expect(llegadaEstimada({ faltaNm: 90, gsKt: 90, horaUltima: hora, ahora: "2026-11-11T15:05:00Z" })).toBeNull();
    expect(llegadaEstimada({ faltaNm: 90, gsKt: 90, horaUltima: null, ahora })).toBeNull();
  });
});

describe("velocidad vertical", () => {
  const t0 = 1_800_000_000;
  const hora = (s: number) => new Date((t0 + s) * 1000).toISOString();
  it("subiendo ~500 ft/min", () => {
    const rec: PuntoRecorrido[] = [[0, 0, 1000, t0], [0, 0, 1500, t0 + 60]];
    const v = velocidadVertical(rec, { alt_ft: 2000, hora: hora(120) });
    expect(v).toEqual({ tendencia: "subiendo", fpm: 500 });
    expect(textoVertical(v)).toBe("Subiendo a ~500 ft/min");
  });
  it("bajando y nivelado", () => {
    const rec: PuntoRecorrido[] = [[0, 0, 3000, t0]];
    expect(textoVertical(velocidadVertical(rec, { alt_ft: 2000, hora: hora(120) }))).toBe("Bajando a ~500 ft/min");
    expect(textoVertical(velocidadVertical(rec, { alt_ft: 3040, hora: hora(120) }))).toBe("Nivelado");
  });
  it("sin puntos entre 30 s y 5 min, o sin altura, no sé", () => {
    const reciente: PuntoRecorrido[] = [[0, 0, 1000, t0 + 100]];
    expect(velocidadVertical(reciente, { alt_ft: 2000, hora: hora(120) })).toBeNull();
    const viejo: PuntoRecorrido[] = [[0, 0, 1000, t0]];
    expect(velocidadVertical(viejo, { alt_ft: 2000, hora: hora(600) })).toBeNull();
    expect(velocidadVertical([[0, 0, null, null]], { alt_ft: 2000, hora: hora(120) })).toBeNull();
    expect(velocidadVertical(viejo, { alt_ft: null, hora: hora(120) })).toBeNull();
    expect(velocidadVertical(viejo, null)).toBeNull();
    expect(textoVertical(null)).toBeNull();
  });
});

describe("el estado que se muestra", () => {
  const ultima = (gs: number | null, hora = "2026-11-11T15:00:00Z") => ({ lat: 0, lon: 0, alt_ft: 1000, gs_kt: gs, track: 90, hora });
  const ahora = "2026-11-11T15:00:20Z";
  it("volando, en tierra, sin velocidad", () => {
    expect(estadoMostrado({ estado: "en_vuelo", ultima: ultima(90) }, ahora).clave).toBe("volando");
    expect(estadoMostrado({ estado: "en_vuelo", ultima: ultima(5) }, ahora).clave).toBe("en_tierra");
    expect(estadoMostrado({ estado: "en_vuelo", ultima: ultima(30) }, ahora).clave).toBe("volando");
    expect(estadoMostrado({ estado: "en_vuelo", ultima: ultima(null) }, ahora).clave).toBe("en_seguimiento");
  });
  it("esperando la primera posición", () => {
    expect(estadoMostrado({ estado: "en_vuelo", ultima: null }, ahora).clave).toBe("esperando");
  });
  it("datos viejos: lo dice claro", () => {
    const e = estadoMostrado({ estado: "en_vuelo", ultima: ultima(90) }, "2026-11-11T15:03:00Z");
    expect(e.clave).toBe("sin_datos");
    expect("aviso" in e && e.aviso).toBe("Sin datos hace 3 min: puede ser falta de señal en el avión. Se muestra la última posición que llegó.");
  });
  it("terminado o vencido", () => {
    expect(estadoMostrado({ estado: "terminado", ultima: ultima(90) }, ahora).clave).toBe("terminado");
    expect(estadoMostrado({ estado: "vencido", ultima: null }, ahora).titulo).toBe("El vuelo terminó");
  });
});

describe("el perfil de altura", () => {
  it("puntos con altura y hora, más la última, desde 0", () => {
    const rec: PuntoRecorrido[] = [[0, 0, null, null], [0, 0, 1000, 100], [0, 0, 1500, 160]];
    const p = puntosDePerfil(rec, { alt_ft: 2000, hora: new Date(220_000).toISOString() });
    expect(p).toEqual([{ t: 0, alt: 1000 }, { t: 60, alt: 1500 }, { t: 120, alt: 2000 }]);
    expect(puntosDePerfil([], null)).toEqual([]);
  });
});

describe("normalizar y nombres", () => {
  it("completa lo que el backend viejo no mandaba", () => {
    const viejo = { nombre: "L", ruta: "", puntos: [[1, 2, "SADF"]], recorrido: [[1, 2]], estado: "en_vuelo", ultima: null, ahora: "x" } as unknown as SeguimientoPublico;
    const n = normalizar(viejo);
    expect(n.puntos[0]).toEqual([1, 2, "SADF", ""]);
    expect(n.recorrido[0]).toEqual([1, 2, null, null]);
    expect(n.avion).toBeNull();
    expect(n.inicio).toBeNull();
  });
  it("el nombre del punto y el avión", () => {
    expect(nombreDePunto(RUTA[0])).toBe("AAAA · Uno");
    expect(nombreDePunto([0, 0, "BENAVIDEZ", ""])).toBe("BENAVIDEZ");
    expect(textoDelAvion({ tipo: "Cessna 152", icao: "C152" })).toBe("Cessna 152 (C152)");
    expect(textoDelAvion({ tipo: "Cessna 152", icao: "C152", matricula: "LV-ABC" })).toBe("LV-ABC · Cessna 152 (C152)");
    expect(textoDelAvion(null)).toBeNull();
    expect(textoDelAvion({})).toBeNull();
  });
});

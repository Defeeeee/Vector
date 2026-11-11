import { describe, expect, it } from "vitest";
import { getAirport } from "./airports";
import { avisoDeEspacios, chequeoVertical, minutosCorto, nmCorto, sostenerAviso, textoDelAviso, type AvisoEspacio, type Lectura } from "./aviso-espacios";
import type { EspacioAereo } from "./espacios-aereos";
import { espaciosAereos } from "./espacios-aereos-servidor";
import { espaciosEn } from "./mapa-ruta";
import { puntoDesde, type Punto } from "./navegacion";

const { espacios, firs } = espaciosAereos();

/** Un cuadrado de 6 NM de lado centrado en (-34, -58), de GND a 3000 ft. */
const cuadrado = (limites = "3000 ft / GND", id = "T-CTR"): EspacioAereo => {
  const c = { lat: -34, lon: -58 };
  const n = puntoDesde(c, 0, 3).lat;
  const s = puntoDesde(c, 180, 3).lat;
  const e = puntoDesde(c, 90, 3).lon;
  const o = puntoDesde(c, 270, 3).lon;
  return {
    id,
    tipo: "CTR",
    nombre: "CTR PRUEBA",
    limites,
    clase: "D",
    poligono: [[n, o], [n, e], [s, e], [s, o]],
    aproximado: false,
    fuente: "prueba",
    dependencia: { distintivo: "Prueba Torre", sectores: [{ nombre: null, mhz: ["118.850"] }] },
  };
};
const CENTRO: Punto = { lat: -34, lon: -58 };
/** 10 NM al oeste del centro, rumbo este, 100 kt a 1500 ft. */
const desdeElOeste = (extra: Partial<Lectura> = {}): Lectura => ({ ...puntoDesde(CENTRO, 270, 10), altitudFt: 1500, gsKt: 100, trackT: 90, ...extra });

describe("avisoDeEspacios con un cuadrado de mentira", () => {
  const e = cuadrado();

  it("avisa a la distancia del borde y con el tiempo a la GS", () => {
    // Borde oeste a 3 NM del centro: 7 NM desde el punto de partida. Con 100 kt, 4,2 min.
    const a = avisoDeEspacios(desdeElOeste({ ...puntoDesde(CENTRO, 270, 7) }), [e], [])!;
    // Desde 7 NM del centro, el borde está a 4 NM; el horizonte a 100 kt son 5 NM.
    expect(a.espacio.id).toBe("T-CTR");
    expect(a.distanciaNm).toBeCloseTo(4, 0);
    expect(a.minutos).toBeCloseTo(2.4, 0);
    expect(a.dependencia).toEqual({ distintivo: "Prueba Torre", mhz: ["118.850"] });
    expect(textoDelAviso(a)).toMatch(/^En 4,0 NM \(2 min\) entrás a la CTR PRUEBA · Prueba Torre 118\.850$/);
  });

  it("no avisa si todavía queda más allá del horizonte", () => {
    expect(avisoDeEspacios(desdeElOeste(), [e], [])).toBeNull();
  });

  it("el horizonte crece con la velocidad (3 min)", () => {
    // A 200 kt son 10 NM: el borde, a 7 NM, entra.
    expect(avisoDeEspacios(desdeElOeste({ gsKt: 200 }), [e], [])?.distanciaNm).toBeCloseTo(7, 0);
  });

  it("si el track se aleja, o pasa de costado, no avisa", () => {
    const cerca = puntoDesde(CENTRO, 270, 6);
    expect(avisoDeEspacios({ ...cerca, altitudFt: 1500, gsKt: 100, trackT: 270 }, [e], [])).toBeNull();
    expect(avisoDeEspacios({ ...cerca, altitudFt: 1500, gsKt: 100, trackT: 0 }, [e], [])).toBeNull();
  });

  it("si ya estás adentro no es 'el próximo': no avisa", () => {
    expect(avisoDeEspacios({ ...CENTRO, altitudFt: 1500, gsKt: 100, trackT: 90 }, [e], [])).toBeNull();
  });

  it("en el suelo (menos de 15 kt) o sin track o sin GS, no hay aviso", () => {
    const cerca = { ...puntoDesde(CENTRO, 270, 4), altitudFt: 1500 };
    expect(avisoDeEspacios({ ...cerca, gsKt: 10, trackT: 90 }, [e], [])).toBeNull();
    expect(avisoDeEspacios({ ...cerca, gsKt: 100, trackT: null }, [e], [])).toBeNull();
    expect(avisoDeEspacios({ ...cerca, gsKt: null, trackT: 90 }, [e], [])).toBeNull();
  });

  it("un hueco no cuenta como estar adentro", () => {
    // El cuadrado tiene un hueco al oeste: entrás al espacio recién al salir del hueco.
    const hueco: [number, number][] = [[-33.97, -58.07], [-33.97, -58.02], [-34.03, -58.02], [-34.03, -58.07]];
    const conHueco = { ...e, huecos: [hueco] };
    const l = { ...puntoDesde(CENTRO, 270, 5.5), altitudFt: 1500, gsKt: 100, trackT: 90 };
    const sin = avisoDeEspacios(l, [e], [])!;
    const con = avisoDeEspacios(l, [conHueco], []);
    expect(sin.distanciaNm).toBeCloseTo(2.5, 0);
    // El borde oeste cae adentro del hueco: se entra recién donde termina.
    expect(con!.distanciaNm).toBeGreaterThan(sin.distanciaNm + 1);
  });

  it("el más cercano gana cuando hay dos", () => {
    const lejos: EspacioAereo = { ...cuadrado("3000 ft / GND", "T-LEJOS"), nombre: "CTR LEJOS", poligono: cuadrado().poligono.map(([la, lo]) => [la, lo + 0.2] as [number, number]) };
    const a = avisoDeEspacios({ ...puntoDesde(CENTRO, 270, 6), altitudFt: 1500, gsKt: 200, trackT: 90 }, [lejos, e], [])!;
    expect(a.espacio.id).toBe("T-CTR");
  });
});

describe("límites verticales", () => {
  it("claramente por arriba del techo o por debajo del piso: no avisa", () => {
    const l = (alt: number): Lectura => ({ ...puntoDesde(CENTRO, 270, 6), altitudFt: alt, gsKt: 100, trackT: 90 });
    expect(avisoDeEspacios(l(5000), [cuadrado()], [])).toBeNull();
    expect(avisoDeEspacios(l(1000), [cuadrado("FL 55 / 2500 ft")], [])).toBeNull();
    expect(avisoDeEspacios(l(2000), [cuadrado()], [])?.condicionVertical).toBeNull();
  });

  it("dentro del margen avisa y dice la condición", () => {
    expect(chequeoVertical({ limites: "3000 ft / GND" }, 3300)).toEqual({ descartar: false, condicion: "si estás por debajo de 3.000 ft" });
    expect(chequeoVertical({ limites: "FL 55 / 2500 ft" }, 2200)).toEqual({ descartar: false, condicion: "si estás por arriba de 2.500 ft" });
  });

  it("sin altura avisa igual y lo dice", () => {
    const a = avisoDeEspacios({ ...puntoDesde(CENTRO, 270, 6), altitudFt: null, gsKt: 100, trackT: 90 }, [cuadrado("FL 55 / GND")], [])!;
    expect(a.condicionVertical).toBe("si estás por debajo de 5.500 ft");
    expect(textoDelAviso(a)).toContain("(si estás por debajo de 5.500 ft)");
  });

  it("un piso sobre el terreno (AGL) no se compara con la altura sobre el mar", () => {
    expect(chequeoVertical({ limites: "1500 ft / 500 ft AGL" }, 200).descartar).toBe(false);
  });

  it("límites que no se entienden: avisa y lo dice", () => {
    expect(chequeoVertical({ limites: "(I) FL 245 / 2500 ft (II) FL 245 / FL 45" }, 3000)).toEqual({ descartar: false, condicion: "límites verticales sin confirmar" });
  });
});

describe("histéresis", () => {
  const e = cuadrado();
  const aviso = (nm: number): AvisoEspacio => ({ espacio: e, distanciaNm: nm, minutos: (nm / 100) * 60, entrada: CENTRO, dependencia: null, condicionVertical: null });
  const en = (nmAlOeste: number, extra: Partial<Lectura> = {}): Lectura => ({ ...puntoDesde(CENTRO, 270, nmAlOeste), altitudFt: 1500, gsKt: 100, trackT: 90, ...extra });

  it("un aviso nuevo arranca el estado", () => {
    const s = sostenerAviso(null, aviso(3), en(6), 1000)!;
    expect(s.confirmadoMs).toBe(1000);
  });

  it("se sostiene unos segundos si la proyección deja de confirmarlo (rumbo que tiembla)", () => {
    const s0 = sostenerAviso(null, aviso(3), en(6), 0)!;
    const s1 = sostenerAviso(s0, null, en(5.5, { trackT: 70 }), 5000)!;
    expect(s1.aviso.espacio.id).toBe("T-CTR");
    expect(s1.aviso.distanciaNm).toBeCloseTo(2.5, 0);
    expect(s1.confirmadoMs).toBe(0);
  });

  it("se va pasados los segundos sin confirmación", () => {
    const s0 = sostenerAviso(null, aviso(3), en(6), 0)!;
    expect(sostenerAviso(s0, null, en(6), 25_000)).toBeNull();
  });

  it("se va cuando el piloto entra", () => {
    const s0 = sostenerAviso(null, aviso(0.3), en(3.2), 0)!;
    expect(sostenerAviso(s0, null, { ...CENTRO, altitudFt: 1500, gsKt: 100, trackT: 90 }, 2000)).toBeNull();
  });

  it("se va cuando se aleja claramente", () => {
    const s0 = sostenerAviso(null, aviso(1), en(4), 0)!;
    expect(sostenerAviso(s0, null, en(4 + 1.5, { trackT: 270 }), 3000)).toBeNull();
  });

  it("se va si quedó en el suelo", () => {
    const s0 = sostenerAviso(null, aviso(1), en(4), 0)!;
    expect(sostenerAviso(s0, null, en(4, { gsKt: 5 }), 2000)).toBeNull();
  });

  it("sin GS por un instante se sostiene (ruido del GPS)", () => {
    const s0 = sostenerAviso(null, aviso(1), en(4), 0)!;
    expect(sostenerAviso(s0, null, en(4, { gsKt: null, trackT: null }), 2000)).not.toBeNull();
  });
});

describe("formatos", () => {
  it("millas con coma y minutos", () => {
    expect(nmCorto(2.34)).toBe("2,3");
    expect(minutosCorto(0.2)).toBe("menos de 1 min");
    expect(minutosCorto(1.4)).toBe("1 min");
  });
});

describe("con los espacios del AIP commiteado", () => {
  const sabe = getAirport("SABE")!;
  const sadf = getAirport("SADF")!;
  const B: Punto = { lat: sabe.lat!, lon: sabe.lon! };
  /** 17,5 NM al norte de Aeroparque, afuera de su CTR, bajando hacia ella. */
  const alNorte = (extra: Partial<Lectura> = {}): Lectura => ({ ...puntoDesde(B, 0, 17.5), altitudFt: 1800, gsKt: 90, trackT: 180, ...extra });

  it("hacia la CTR Aeroparque avisa, con la dependencia y su frecuencia", () => {
    expect(espaciosEn(alNorte(), espacios).map((e) => e.id)).not.toContain("SABE-CTR");
    const a = avisoDeEspacios(alNorte(), espacios, firs)!;
    expect(a.espacio.id).toBe("SABE-CTR");
    expect(a.distanciaNm).toBeGreaterThan(0);
    expect(a.distanciaNm).toBeLessThan(5);
    expect(a.dependencia?.distintivo).toMatch(/Aeroparque/i);
    expect(a.dependencia?.mhz.length).toBeGreaterThan(0);
    expect(textoDelAviso(a)).toMatch(/entrás a la CTR AEROPARQUE.* 1\d\d\.\d+/);
  });

  it("a FL 090 se pasa por arriba del techo (FL 55): no avisa la CTR", () => {
    expect(avisoDeEspacios(alNorte({ altitudFt: 9000 }), espacios, firs)?.espacio.id).not.toBe("SABE-CTR");
  });

  it("alejándose, no avisa la CTR", () => {
    expect(avisoDeEspacios(alNorte({ trackT: 0 }), espacios, firs)?.espacio.id).not.toBe("SABE-CTR");
  });

  it("rumbo a la TMA Baires desde afuera avisa la TMA con su control", () => {
    const l: Lectura = { ...puntoDesde(B, 45, 26), altitudFt: 3000, gsKt: 90, trackT: 225 };
    const a = avisoDeEspacios(l, espacios, firs)!;
    expect(a.espacio.id).toBe("TMA-BAIRES-I");
    expect(a.dependencia?.distintivo).toBe("BAIRES CONTROL");
  });

  it("saliendo de San Fernando (en el suelo) no avisa nada", () => {
    expect(avisoDeEspacios({ lat: sadf.lat!, lon: sadf.lon!, altitudFt: 10, gsKt: 8, trackT: 126 }, espacios, firs)).toBeNull();
  });
});

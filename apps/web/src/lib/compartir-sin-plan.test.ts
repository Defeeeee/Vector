import { describe, expect, it } from "vitest";
import {
  enlaceCompartirSinPlan,
  fechaArgentina,
  horaDeArgentina,
  minutosDeDuracion,
  salidaArgentinaAUtc,
  sugerirDuracion,
  textoDeDuracion,
  validarSinPlan,
  type BorradorSinPlan,
} from "./compartir-sin-plan";

const AHORA = "2026-11-15T15:00:00.000Z"; // 12:00 en Argentina
const MORON = { codigo: "SADM", nombre: "Morón", lat: -34.6762, lon: -58.6428 };
const EZEIZA = { codigo: "SAEZ", nombre: "Ezeiza", lat: -34.8222, lon: -58.5358 };
const base: BorradorSinPlan = { avionId: "a1", origen: MORON, destino: EZEIZA, fecha: "2026-11-15", hora: "13:30", duracion: "1:30" };

describe("hora argentina a UTC", () => {
  it("suma tres horas", () => {
    expect(salidaArgentinaAUtc("2026-11-15", "13:30")).toBe("2026-11-15T16:30:00.000Z");
  });
  it("pasa al día siguiente en UTC", () => {
    expect(salidaArgentinaAUtc("2026-11-15", "22:15")).toBe("2026-11-16T01:15:00.000Z");
  });
  it("acepta 9:30 y 0930", () => {
    expect(salidaArgentinaAUtc("2026-11-15", "9:30")).toBe("2026-11-15T12:30:00.000Z");
    expect(salidaArgentinaAUtc("2026-11-15", "0930")).toBe("2026-11-15T12:30:00.000Z");
  });
  it("rechaza lo que no existe", () => {
    expect(salidaArgentinaAUtc("2026-02-31", "10:00")).toBeNull();
    expect(salidaArgentinaAUtc("2026-11-15", "25:00")).toBeNull();
    expect(salidaArgentinaAUtc("2026-11-15", "10:60")).toBeNull();
    expect(salidaArgentinaAUtc("15/11/2026", "10:00")).toBeNull();
    expect(salidaArgentinaAUtc("2026-11-15", "")).toBeNull();
  });
  it("vuelve a la fecha y la hora argentinas", () => {
    expect(fechaArgentina("2026-11-16T01:15:00.000Z")).toBe("2026-11-15");
    expect(horaDeArgentina("2026-11-16T01:15:00.000Z")).toBe("22:15");
    expect(fechaArgentina("basura")).toBeNull();
  });
});

describe("duración", () => {
  it("lee h:mm y hhmm", () => {
    expect(minutosDeDuracion("1:30")).toBe(90);
    expect(minutosDeDuracion("0130")).toBe(90);
    expect(minutosDeDuracion("0:45")).toBe(45);
  });
  it("no lee minutos de 60 o más ni vacío", () => {
    expect(minutosDeDuracion("1:75")).toBeNull();
    expect(minutosDeDuracion("")).toBeNull();
    expect(minutosDeDuracion("abc")).toBeNull();
  });
  it("la escribe como h:mm", () => {
    expect(textoDeDuracion(90)).toBe("1:30");
    expect(textoDeDuracion(45)).toBe("0:45");
  });
});

describe("sugerirDuracion", () => {
  it("usa la distancia directa y la velocidad, redondeando hacia arriba a 5 min", () => {
    const s = sugerirDuracion(MORON, EZEIZA, 90);
    expect(s).not.toBeNull();
    expect(s!.minutos % 5).toBe(0);
    expect(s!.minutos).toBeGreaterThanOrEqual(10);
    expect(s!.motivo).toContain("NM en línea recta a 90 kt");
  });
  it("sin velocidad cargada no inventa una", () => {
    expect(sugerirDuracion(MORON, EZEIZA, null)).toBeNull();
    expect(sugerirDuracion(MORON, EZEIZA, undefined)).toBeNull();
    expect(sugerirDuracion(MORON, EZEIZA, 0)).toBeNull();
  });
  it("sin coordenadas, tampoco", () => {
    expect(sugerirDuracion({ codigo: "X" } as never, EZEIZA, 100)).toBeNull();
    expect(sugerirDuracion(null, EZEIZA, 100)).toBeNull();
  });
  it("nunca baja de 10 minutos", () => {
    expect(sugerirDuracion(MORON, { lat: -34.68, lon: -58.65 }, 200)!.minutos).toBe(10);
  });
});

describe("validarSinPlan", () => {
  it("arma los datos para el backend, con la salida en UTC", () => {
    const r = validarSinPlan(base, AHORA);
    expect(r).toHaveProperty("datos");
    if ("datos" in r) {
      expect(r.datos.salida).toBe("2026-11-15T16:30:00.000Z");
      expect(r.datos.duracion_min).toBe(90);
      expect(r.datos.origen).toEqual({ lat: MORON.lat, lon: MORON.lon, codigo: "SADM", nombre: "Morón" });
    }
  });
  it("pide lo que falta", () => {
    expect(validarSinPlan({ ...base, avionId: "" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, origen: null }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, destino: null }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, hora: "" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, duracion: "" }, AHORA)).toHaveProperty("error");
  });
  it("no acepta el mismo aeródromo ni uno sin lugar", () => {
    expect(validarSinPlan({ ...base, destino: MORON }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, destino: { codigo: "LAD2013", nombre: "x" } }, AHORA)).toHaveProperty("error");
  });
  it("respeta los topes de salida del backend", () => {
    expect(validarSinPlan({ ...base, fecha: "2026-11-17" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, fecha: "2026-11-14", hora: "10:00" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, fecha: "2026-11-15", hora: "05:00" }, AHORA)).toHaveProperty("datos");
  });
  it("respeta los topes de duración", () => {
    expect(validarSinPlan({ ...base, duracion: "0:05" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, duracion: "12:01" }, AHORA)).toHaveProperty("error");
    expect(validarSinPlan({ ...base, duracion: "12:00" }, AHORA)).toHaveProperty("datos");
  });
});

describe("enlaceCompartirSinPlan", () => {
  it("lleva el primero y el último punto de la ruta", () => {
    expect(enlaceCompartirSinPlan(["SADM", "ATALAYA", "SAZS"])).toBe("/dashboard/mapa/compartir?origen=SADM&destino=SAZS");
    expect(enlaceCompartirSinPlan(["sadm", "sazs"])).toBe("/dashboard/mapa/compartir?origen=SADM&destino=SAZS");
  });
  it("sin dos aeródromos, va a la pantalla pelada", () => {
    expect(enlaceCompartirSinPlan([])).toBe("/dashboard/mapa/compartir");
    expect(enlaceCompartirSinPlan(["SADM"])).toBe("/dashboard/mapa/compartir");
    expect(enlaceCompartirSinPlan(["SADM", "SADM"])).toBe("/dashboard/mapa/compartir");
    expect(enlaceCompartirSinPlan(["SADM", "ATALAYA"])).toBe("/dashboard/mapa/compartir");
  });
});

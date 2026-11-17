import { describe, expect, it } from "vitest";
import { claveBorrador } from "./borrador-plan";
import { duplicar, formularioVacio, type AvionParaPlan, type PilotoParaPlan } from "./formulario-plan";
import {
  accionDeGuardado,
  avionDePlanNuevo,
  borradoresPendientes,
  crearAlAbrir,
  esUuid,
  formularioDePlanNuevo,
  idDePlanNuevo,
  nuevoIdDePlan,
  urlDePlanNuevo,
  urlDelPlan,
} from "./plan-nuevo";
import { paginaCacheable, urlDeCopiaSinQuery } from "./pwa";
import { PAGINAS_PARA_VOLAR } from "./sin-senal";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const piloto: PilotoParaPlan = { comandante: "FEDERICO DIAZ NEMETH PPA 48225513", telefono: "5491168862612" };
const avion: AvionParaPlan = { id: B, registration: "LV-S114", icao: "TECNAM", cruise_tas_kt: 100, plan_vuelo: { equipo: "SDGZ", vigilancia: "EB2" } };

const borrador = (f: unknown, at = "2026-11-17T10:00:00.000Z") => JSON.stringify({ formulario: f, at });

describe("el id y la dirección del plan nuevo", () => {
  it("un uuid v4 válido, y distinto cada vez", () => {
    const a = nuevoIdDePlan();
    expect(esUuid(a)).toBe(true);
    expect(nuevoIdDePlan()).not.toBe(a);
  });

  it("sin crypto.randomUUID (contexto no seguro) arma uno válido igual", () => {
    const id = nuevoIdDePlan({ getRandomValues: <T extends ArrayBufferView | null>(a: T) => a } as unknown as Crypto);
    expect(esUuid(id)).toBe(true);
    expect(id[14]).toBe("4");
    expect("89ab").toContain(id[19]);
  });

  it("la URL lleva el id y, si se eligió, el avión", () => {
    expect(urlDePlanNuevo(A)).toBe(`/dashboard/plan-de-vuelo/nuevo?id=${A}`);
    expect(urlDePlanNuevo(A, B)).toBe(`/dashboard/plan-de-vuelo/nuevo?id=${A}&avion=${B}`);
    expect(urlDePlanNuevo(A, "no-es-uuid")).toBe(`/dashboard/plan-de-vuelo/nuevo?id=${A}`);
    expect(urlDelPlan(A)).toBe(`/dashboard/plan-de-vuelo/${A}`);
  });

  it("se lee de la query, y sólo si es un uuid", () => {
    expect(idDePlanNuevo(`?id=${A}&avion=${B}`)).toBe(A);
    expect(avionDePlanNuevo(`?id=${A}&avion=${B}`)).toBe(B);
    expect(idDePlanNuevo("?id=hola")).toBeNull();
    expect(idDePlanNuevo("")).toBeNull();
    expect(avionDePlanNuevo(`?avion=../x`)).toBeNull();
  });
});

describe("con qué arranca el formulario", () => {
  const base = { avionId: null, aviones: [avion], piloto, hoyUtc: "2026-11-17" };

  it("en blanco: el piloto como comandante y la fecha de hoy en UTC", () => {
    const f = formularioDePlanNuevo({ ...base, borrador: null });
    expect(f.piloto).toBe(piloto.comandante);
    expect(f.dofUtc).toBe("2026-11-17");
    expect(f.matricula).toBe("");
  });

  it("con un avión: lo que sabe el Hangar", () => {
    const f = formularioDePlanNuevo({ ...base, borrador: null, avionId: B });
    expect(f.matricula).toBe("LV-S114");
    expect(f.aircraftId).toBe(B);
    expect(f.equipo).toBe("SDGZ");
  });

  it("un avión que no está (otro piloto, borrado) es un plan en blanco, no un error", () => {
    expect(formularioDePlanNuevo({ ...base, borrador: null, avionId: A }).matricula).toBe("");
  });

  it("el borrador del teléfono gana: lo escrito sin señal", () => {
    const escrito = { ...formularioVacio(), matricula: "LV-XYZ", dofUtc: "2026-11-20", eobtUtc: "1400" };
    const f = formularioDePlanNuevo({ ...base, borrador: borrador(escrito), avionId: B });
    expect(f.matricula).toBe("LV-XYZ");
    expect(f.dofUtc).toBe("2026-11-20");
  });

  it("un plan duplicado (sin fecha) entra con la fecha de hoy, como cuando lo duplicaba el servidor", () => {
    const f = formularioDePlanNuevo({ ...base, borrador: borrador(duplicar({ ...formularioVacio(), matricula: "LV-S114", eobtUtc: "1400", dofUtc: "2026-10-01" })) });
    expect(f.matricula).toBe("LV-S114");
    expect(f.eobtUtc).toBe("");
    expect(f.dofUtc).toBe("2026-11-17");
  });

  it("un borrador roto se ignora", () => {
    expect(formularioDePlanNuevo({ ...base, borrador: "{no es json" }).dofUtc).toBe("2026-11-17");
  });
});

describe("crear o actualizar", () => {
  it("el primer guardado crea y los siguientes actualizan", () => {
    expect(accionDeGuardado(false)).toBe("crear");
    expect(accionDeGuardado(true)).toBe("actualizar");
  });

  it("al abrir: con red se crea ya; sin red queda en el teléfono; uno que ya existe no se vuelve a crear", () => {
    expect(crearAlAbrir(false, true)).toBe(true);
    expect(crearAlAbrir(false, false)).toBe(false);
    expect(crearAlAbrir(true, true)).toBe(false);
  });
});

describe("los planes armados sin señal que no se subieron", () => {
  const f = (salida: string, destino: string, matricula = "") => ({
    ...formularioVacio(),
    matricula,
    salida: { codigo: salida, nombre: salida },
    destino: { codigo: destino, nombre: destino },
  });

  it("lista los borradores de planes que el servidor no tiene, los más nuevos primero", () => {
    const r = borradoresPendientes(
      [
        [claveBorrador(A), borrador(f("SADF", "SADM", "LV-S114"), "2026-11-17T10:00:00.000Z")],
        [claveBorrador(B), borrador(f("SADM", "SAZM"), "2026-11-17T12:00:00.000Z")],
        ["otra-cosa", "x"],
      ],
      new Set(),
    );
    expect(r.map((p) => p.id)).toEqual([B, A]);
    expect(r[1]).toMatchObject({ salida: "SADF", destino: "SADM", matricula: "LV-S114" });
  });

  it("un borrador de un plan que el servidor ya tiene no es «armado sin señal»", () => {
    expect(borradoresPendientes([[claveBorrador(A), borrador(f("SADF", "SADM"))]], new Set([A]))).toEqual([]);
  });

  it("**sin la lista del servidor no se afirma nada** (invariante 2)", () => {
    expect(borradoresPendientes([[claveBorrador(A), borrador(f("SADF", "SADM"))]], null)).toEqual([]);
  });

  it("ignora claves que no son de un plan y borradores rotos", () => {
    expect(
      borradoresPendientes(
        [
          [claveBorrador("no-uuid"), borrador(f("A", "B"))],
          [claveBorrador(A), "{roto"],
          [claveBorrador(B), null],
        ],
        new Set(),
      ),
    ).toEqual([]);
  });
});

describe("el service worker y la pantalla nueva", () => {
  it("se guarda para volar y es una pantalla cacheable", () => {
    expect(PAGINAS_PARA_VOLAR).toContain("/dashboard/plan-de-vuelo/nuevo");
    expect(paginaCacheable("/dashboard/plan-de-vuelo/nuevo")).toBe(true);
  });

  it("sin señal, `?id=` y `?icao=` sirven la copia de la ruta pelada", () => {
    const o = "https://vectoraero.ar";
    expect(urlDeCopiaSinQuery(`${o}/dashboard/plan-de-vuelo/nuevo?id=${A}&avion=${B}`)).toBe(`${o}/dashboard/plan-de-vuelo/nuevo`);
    expect(urlDeCopiaSinQuery(`${o}/dashboard/airports?icao=SADM`)).toBe(`${o}/dashboard/airports`);
  });

  it("las demás pantallas con query no (una query distinta es otra pantalla)", () => {
    const o = "https://vectoraero.ar";
    expect(urlDeCopiaSinQuery(`${o}/dashboard/history?ver=abc`)).toBeNull();
    expect(urlDeCopiaSinQuery(`${o}/dashboard/mapa?plan=${A}`)).toBeNull();
    expect(urlDeCopiaSinQuery(`${o}/dashboard/airports`)).toBeNull(); // sin query: la exacta
    expect(urlDeCopiaSinQuery("no es una url")).toBeNull();
  });
});

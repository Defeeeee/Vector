import { describe, expect, it } from "vitest";
import { allAirports, getAirport, searchAirports } from "./airports";
import { allAerovias } from "./aerovias";
import { alternativasDesdeDirectorio } from "./alternativas";
import { aeroviasConSalidas } from "./ruta-planificada";
import { armarMapa } from "./mapa-datos";
import { armarPaquete } from "./sin-senal-servidor";
import {
  PAGINAS_PARA_VOLAR,
  PRECALENTAR_CADA_MS,
  conexionBuena,
  contestarSinSenal,
  debePrecalentar,
  enlacesDeChecklists,
  entandas,
  horaArgentina,
  indiceDelPaquete,
  resumenGuardado,
  textoDeLaFranja,
  type EstadoApp,
  type EstadoPantallas,
} from "./sin-senal";
import { paginaCacheable } from "./pwa";

/**
 * "Vector sin señal": el paquete tiene que contestar **lo mismo que el servidor** (las dos salen de
 * las mismas funciones), y lo que se le dice al piloto tiene que ser exacto. La parte del service
 * worker que ejecuta esto no se puede montar acá; por eso todo lo que decide vive en `sin-senal.ts`.
 */

const paquete = armarPaquete();
const indice = indiceDelPaquete(paquete);
const pedir = (ruta: string) => contestarSinSenal(new URL(ruta, "https://vectoraero.ar"), indice);
/** Lo que viaja por la red: sin `undefined`, como lo ve el navegador. */
const viaJson = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("el paquete de datos", () => {
  it("trae los aeródromos argentinos con su ficha, y sólo los argentinos", () => {
    expect(paquete.aerodromos.length).toBeGreaterThan(500);
    expect(paquete.aerodromos.every((a) => a.country === "AR")).toBe(true);
    const moron = paquete.aerodromos.find((a) => a.icao === "SADM");
    expect(moron?.pistas?.length).toBeGreaterThan(0);
    expect(moron?.madhel).toBeTruthy();
  });

  it("es serializable y el esquema se chequea", () => {
    expect(() => indiceDelPaquete(viaJson(paquete))).not.toThrow();
    expect(() => indiceDelPaquete({ ...viaJson(paquete), esquema: 99 })).toThrow(/esquema/);
  });

  it("**el mapa es el mismo que contesta /api/mapa**", () => {
    const r = pedir("/api/mapa?v=3.44.0");
    expect(r?.status).toBe(200);
    expect(r?.cuerpo).toEqual({ ...viaJson(armarMapa()), offline: true });
  });
});

describe("contestarSinSenal", () => {
  it("un aeródromo por código, y por designador de ANAC, igual que el servidor", () => {
    const sadm = pedir("/api/airports/search?icao=SADM");
    expect(sadm?.status).toBe(200);
    expect(sadm?.cuerpo).toEqual(viaJson(getAirport("SADM")));
    // `MOR` es el designador de ANAC de Morón: resuelve al mismo aeródromo.
    expect((pedir("/api/airports/search?icao=mor")?.cuerpo as { icao: string }).icao).toBe("SADM");
  });

  it("un código que no existe es un 404 que lo dice, no un aeródromo inventado", () => {
    const r = pedir("/api/airports/search?icao=ZZZZ");
    expect(r?.status).toBe(404);
  });

  it("la búsqueda ordena como el servidor (para lo argentino)", () => {
    for (const q of ["SADM", "moron", "san fernando", "SA", "cordoba"]) {
      const local = (pedir(`/api/airports/search?q=${encodeURIComponent(q)}`)?.cuerpo as { results: { icao: string }[] }).results.map((a) => a.icao);
      const servidor = searchAirports(q, 8).filter((a) => a.country === "AR").map((a) => a.icao);
      // Lo del servidor que es argentino, en el mismo orden, aparece igual en el paquete.
      expect(local.slice(0, servidor.length === 0 ? 0 : 1)).toEqual(servidor.slice(0, servidor.length === 0 ? 0 : 1));
      expect(local.filter((i) => servidor.includes(i))).toEqual(servidor.filter((i) => local.includes(i)));
    }
  });

  it("una búsqueda corta no devuelve nada, y respeta el tope", () => {
    expect((pedir("/api/airports/search?q=a")?.cuerpo as { results: unknown[] }).results).toEqual([]);
    expect((pedir("/api/airports/search?q=san&limit=500")?.cuerpo as { results: unknown[] }).results.length).toBeLessThanOrEqual(25);
  });

  it("los aeródromos cerca, igual que el servidor (donde no hay vecinos extranjeros)", () => {
    // Mendoza: a 40 NM no hay nada de otro país que el directorio mundial agregue.
    const desde = { lat: -32.83, lon: -68.79 };
    const local = pedir("/api/airports/near?lat=-32.83&lon=-68.79&nm=60&gs=110");
    const servidor = alternativasDesdeDirectorio(allAirports(), desde, { nm: 60, gs: 110 });
    expect(local?.cuerpo).toEqual({ resultados: viaJson(servidor), offline: true });
    expect(servidor.length).toBeGreaterThan(0);
  });

  it("con una latitud que no es un número es un 400, como el servidor", () => {
    expect(pedir("/api/airports/near?lat=abc&lon=-68")?.status).toBe(400);
  });

  it("las aerovías de un punto, con sus salidas", () => {
    const punto = allAerovias()[0].puntos[1];
    const r = pedir(`/api/aerovias?punto=${punto.toLowerCase()}`);
    const cuerpo = r?.cuerpo as { aerovias: unknown[]; offline: boolean };
    expect(cuerpo.aerovias).toEqual(viaJson(aeroviasConSalidas(allAerovias(), punto)));
    expect(cuerpo.aerovias.length).toBeGreaterThan(0);
    expect(cuerpo.offline).toBe(true);
    expect((pedir("/api/aerovias")?.cuerpo as { aerovias: unknown[] }).aerovias).toEqual([]);
  });

  it("**lo que no sabe contestar lo deja en paz**", () => {
    expect(pedir("/api/weather?icao=SADM")).toBeNull();
    expect(pedir("/api/puntos?q=SADM")).toBeNull(); // eso lo resuelve el catálogo de a bordo
  });
});

describe("enlacesDeChecklists", () => {
  const A = "0b8a2c3e-1111-4222-8333-444455556666";
  const B = "9f9f9f9f-aaaa-4bbb-8ccc-dddddddddddd";

  it("saca las checklists del HTML de la lista, sin repetir y en orden", () => {
    const html = `<a href="/dashboard/tools/checklists/${A}">x</a> <a href="/dashboard/tools/checklists/${B}">y</a> <a href="/dashboard/tools/checklists/${A}">otra vez</a>`;
    expect(enlacesDeChecklists(html)).toEqual([`/dashboard/tools/checklists/${A}`, `/dashboard/tools/checklists/${B}`]);
  });

  it("no se deja engañar por lo que no es una checklist, y respeta el tope", () => {
    expect(enlacesDeChecklists('<a href="/dashboard/tools/checklists/nueva">')).toEqual([]);
    expect(enlacesDeChecklists(`/dashboard/tools/checklists/${A} /dashboard/tools/checklists/${B}`, 1)).toEqual([`/dashboard/tools/checklists/${A}`]);
  });

  it("las checklists que se bajan son pantallas que el service worker sirve sin señal", () => {
    for (const ruta of [...PAGINAS_PARA_VOLAR, `/dashboard/tools/checklists/${A}`]) expect(paginaCacheable(ruta)).toBe(true);
  });
});

describe("debePrecalentar", () => {
  const AHORA = Date.parse("2026-11-17T15:00:00Z");
  const buena = { online: true, effectiveType: "4g" };
  const estado = (o: Partial<EstadoPantallas> = {}): EstadoPantallas => ({
    usuario: "u1",
    precalentadoEn: new Date(AHORA - 7 * 3600_000).toISOString(),
    pantallas: ["/dashboard"],
    ...o,
  });
  const base = { usuario: "u1", ahoraMs: AHORA, forzar: false, conexion: buena };

  it("la primera vez, con buena señal, sí", () => {
    expect(debePrecalentar({ ...base, estado: null })).toMatchObject({ hacer: true, limpiar: false, motivo: "vencido" });
  });

  it("pasadas 6 horas, sí; antes, no", () => {
    expect(debePrecalentar({ ...base, estado: estado() }).hacer).toBe(true);
    const reciente = estado({ precalentadoEn: new Date(AHORA - PRECALENTAR_CADA_MS + 60_000).toISOString() });
    expect(debePrecalentar({ ...base, estado: reciente })).toMatchObject({ hacer: false, motivo: "reciente" });
  });

  it("sin cuenta no guarda nada", () => {
    expect(debePrecalentar({ ...base, usuario: null, estado: null })).toMatchObject({ hacer: false, limpiar: false, motivo: "sin-usuario" });
  });

  it("**lo guardado de otra cuenta se borra, aunque no haya buena señal**", () => {
    const otra = estado({ usuario: "u2", precalentadoEn: new Date(AHORA - 60_000).toISOString() });
    expect(debePrecalentar({ ...base, estado: otra })).toMatchObject({ hacer: true, limpiar: true, motivo: "usuario-nuevo" });
    expect(debePrecalentar({ ...base, estado: otra, conexion: { online: true, effectiveType: "3g" } })).toMatchObject({ hacer: false, limpiar: true });
    expect(debePrecalentar({ ...base, estado: otra, conexion: { online: false } })).toMatchObject({ hacer: false, limpiar: true, motivo: "sin-conexion" });
  });

  it("con ahorro de datos o conexión floja no se baja nada solo, pero sí a pedido", () => {
    for (const conexion of [{ online: true, saveData: true }, { online: true, effectiveType: "3g" }, { online: true, effectiveType: "slow-2g" }]) {
      expect(debePrecalentar({ ...base, estado: null, conexion }).hacer).toBe(false);
      expect(debePrecalentar({ ...base, estado: null, conexion, forzar: true })).toMatchObject({ hacer: true, motivo: "forzado" });
    }
  });

  it("sin red no hay nada que hacer, ni a pedido", () => {
    expect(debePrecalentar({ ...base, estado: null, conexion: { online: false }, forzar: true }).hacer).toBe(false);
  });

  it("conexionBuena: sin dato de tipo de red se confía en que haya red", () => {
    expect(conexionBuena({ online: true })).toBe(true);
    expect(conexionBuena({ online: true, effectiveType: "4g" })).toBe(true);
    expect(conexionBuena({ online: false })).toBe(false);
  });
});

describe("entandas", () => {
  it("parte en tandas del tamaño pedido", () => {
    expect(entandas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(entandas([], 3)).toEqual([]);
  });
});

describe("lo que se le dice al piloto", () => {
  // 14:32 argentina = 17:32 UTC.
  const HOY = Date.parse("2026-11-17T20:00:00Z");

  it("la hora es argentina (UTC−3) y escrita a mano", () => {
    expect(horaArgentina("2026-11-17T17:32:00Z", HOY)).toBe("14:32");
    expect(horaArgentina("2026-11-17T02:05:00Z", HOY)).toBe("16/11 23:05"); // las 23:05 de ayer en Argentina
    expect(horaArgentina("2026-11-16T14:32:00Z", HOY)).toBe("16/11 11:32");
  });

  it("sin fecha, o con una que no se entiende, no inventa una hora", () => {
    expect(horaArgentina(null, HOY)).toBeNull();
    expect(horaArgentina("ayer", HOY)).toBeNull();
    expect(textoDeLaFranja(null, HOY)).toBe("Sin señal · mostrando lo guardado");
  });

  it("la franja dice a qué hora (o qué día) es lo guardado", () => {
    expect(textoDeLaFranja("2026-11-17T17:32:00Z", HOY)).toBe("Sin señal · mostrando lo guardado a las 14:32");
    expect(textoDeLaFranja("2026-11-16T14:32:00Z", HOY)).toBe("Sin señal · mostrando lo guardado el 16/11 a las 11:32");
  });

  it("el resumen del Hangar cuenta lo que hay, y dice cuando falta", () => {
    const app: EstadoApp = { version: "3.44.0", archivos: 129, guardados: 129, paquete: true, aerodromos: 741, guardadoEn: null };
    expect(resumenGuardado(app, 7)).toBe("Guardado para volar sin señal: la app, 7 pantallas y 741 aeródromos (versión 3.44.0).");
    expect(resumenGuardado({ ...app, guardados: 100, paquete: false }, 1)).toBe(
      "Guardado para volar sin señal: la app (100 de 129 archivos), 1 pantalla y sin los datos de aeródromos (versión 3.44.0)."
    );
    expect(resumenGuardado(null, 0)).toMatch(/Todavía no hay nada guardado/);
  });
});

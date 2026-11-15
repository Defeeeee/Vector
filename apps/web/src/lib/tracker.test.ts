import { describe, expect, it } from "vitest";
import { estadoDeAvisosTracker, nombreConHandle, pilotosDeRespuesta, resumenDeLista, tarjetaDeVuelo, tarjetasDeVuelos, trayectoDe, volverSeguroTracker, vuelosDeRespuesta } from "./tracker";

const TOKEN = "t".repeat(40);
const AHORA = "2026-11-15T19:00:00+00:00"; // 16:00 en Argentina

function vuelo(extra: Record<string, unknown> = {}, token = TOKEN) {
  return {
    token,
    piloto: { nombre: "Federico", handle: "fede" },
    nombre: "Federico",
    ruta: "SADM SAZS",
    puntos: [[-34.6, -58.6, "SADM", "Morón"], [-37.2, -59.1, "SAZS", "Tandil"]],
    avion: null,
    inicio: AHORA,
    estado: "en_vuelo",
    fase: "volando",
    salida_prevista: "2026-11-15T19:30:00+00:00",
    ultima: { lat: -35.5, lon: -58.9, alt_ft: 3500, gs_kt: 100, track: 190, hora: "2026-11-15T18:59:50+00:00", fuente: "adsb" },
    recorrido: [],
    ahora: AHORA,
    ...extra,
  };
}

describe("vuelosDeRespuesta", () => {
  it("descarta lo que no tiene la forma o un token malo", () => {
    expect(vuelosDeRespuesta(null)).toEqual([]);
    expect(vuelosDeRespuesta([{ token: "corto" }, vuelo({}, "malo"), vuelo()]).length).toBe(1);
  });
  it("completa el piloto si falta", () => {
    const v = vuelosDeRespuesta([vuelo({ piloto: undefined })])[0];
    expect(v.piloto).toEqual({ nombre: "Federico", handle: null });
  });
});

describe("tarjetaDeVuelo", () => {
  it("en el aire: lo dice simple, con la llegada estimada en hora argentina", () => {
    const t = tarjetaDeVuelo(vuelosDeRespuesta([vuelo()])[0]);
    expect(t.grupo).toBe("aire");
    expect(t.titulo).toBe("En el aire");
    expect(t.trayecto).toBe("SADM → SAZS");
    expect(t.detalle).toMatch(/^Llega aproximadamente a las \d\d:\d\d hs$/);
    expect(t.posicion).toEqual({ lat: -35.5, lon: -58.9, rumbo: 190 });
    expect(t.ruta).toHaveLength(2);
  });
  it("antes de salir: 'Sale a las 16:30 hs' (la hora argentina, escrita en el server)", () => {
    const t = tarjetaDeVuelo(vuelosDeRespuesta([vuelo({ fase: "antes_de_salir", ultima: null })])[0]);
    expect(t.grupo).toBe("proximo");
    expect(t.titulo).toBe("Todavía no salió");
    expect(t.detalle).toBe("Sale a las 16:30 hs");
    expect(t.posicion).toBeNull();
  });
  it("el día siguiente lo aclara", () => {
    const t = tarjetaDeVuelo(vuelosDeRespuesta([vuelo({ fase: "antes_de_salir", ultima: null, salida_prevista: "2026-11-16T12:00:00+00:00" })])[0]);
    expect(t.detalle).toBe("Sale a las 09:00 hs de mañana");
  });
  it("aterrizó y terminó van al final", () => {
    expect(tarjetaDeVuelo(vuelosDeRespuesta([vuelo({ estado: "terminado", fase: "aterrizo" })])[0])).toMatchObject({ grupo: "termino", titulo: "Aterrizó", posicion: null });
    expect(tarjetaDeVuelo(vuelosDeRespuesta([vuelo({ estado: "terminado", fase: "terminado" })])[0])).toMatchObject({ grupo: "termino", titulo: "El vuelo terminó" });
  });
  it("sin señal no inventa una posición ni dice que está bien", () => {
    const t = tarjetaDeVuelo(vuelosDeRespuesta([vuelo({ fase: "sin_datos", ultima: null })])[0]);
    expect(t.titulo).toBe("Sin señal por ahora");
    expect(t.posicion).toBeNull();
  });
});

describe("tarjetasDeVuelos y resumenDeLista", () => {
  it("el aire primero, después lo que sale, al final lo que terminó", () => {
    const lista = tarjetasDeVuelos(
      vuelosDeRespuesta([
        vuelo({ estado: "terminado", fase: "aterrizo" }, "a".repeat(40)),
        vuelo({ fase: "antes_de_salir", ultima: null }, "b".repeat(40)),
        vuelo({}, "c".repeat(40)),
      ])
    );
    expect(lista.map((t) => t.token[0])).toEqual(["c", "b", "a"]);
    expect(resumenDeLista(lista)).toBe("1 vuelo en el aire");
    expect(resumenDeLista(lista.slice(1))).toBe("1 vuelo por salir");
    expect(resumenDeLista(lista.slice(2))).toBe("Sin vuelos en el aire");
    expect(resumenDeLista([])).toBe("Sin vuelos por ahora");
  });
});

describe("el resto", () => {
  it("el trayecto y los pilotos", () => {
    expect(trayectoDe([])).toBe("");
    expect(trayectoDe([[0, 0, "SADM", ""]])).toBe("SADM");
    expect(pilotosDeRespuesta([{ nombre: "Federico", handle: "fede", activo: true }, 3, { activo: false }])).toEqual([
      { nombre: "Federico", handle: "fede", activo: true },
      { nombre: "Un piloto", handle: null, activo: false },
    ]);
    expect(nombreConHandle({ nombre: "Federico", handle: "fede" })).toBe("Federico (@fede)");
    expect(nombreConHandle({ nombre: "Federico", handle: null })).toBe("Federico");
  });
  it("a dónde se vuelve tras Google: sólo una invitación o un vuelo del tracker", () => {
    expect(volverSeguroTracker(`/invitacion/${TOKEN}`)).toBe(`/invitacion/${TOKEN}`);
    expect(volverSeguroTracker(`/vuelo/${TOKEN}`)).toBe(`/vuelo/${TOKEN}`);
    expect(volverSeguroTracker("/dashboard")).toBeNull();
    expect(volverSeguroTracker("//evil.com")).toBeNull();
    expect(volverSeguroTracker("https://evil.com/invitacion/" + TOKEN)).toBeNull();
    expect(volverSeguroTracker(null)).toBeNull();
  });
});

describe("avisos del tracker", () => {
  const base = { soportaPush: true, esIOS: false, instalada: false, permiso: "granted" as const, suscripto: true, pidioAvisos: true };
  it("prendidos sólo si este navegador los pidió", () => {
    expect(estadoDeAvisosTracker(base)).toBe("prendidos");
    expect(estadoDeAvisosTracker({ ...base, pidioAvisos: false })).toBe("apagados");
  });
  it("en el iPhone sin instalar se explica cómo; sin permiso, bloqueados", () => {
    expect(estadoDeAvisosTracker({ ...base, esIOS: true })).toBe("instalar-app");
    expect(estadoDeAvisosTracker({ ...base, permiso: "denied" })).toBe("bloqueados");
  });
});

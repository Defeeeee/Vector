import { describe, expect, it } from "vitest";
import { canalesDeLlamada, getAirport, leerFichasMadhel } from "./airports";
import { datosAip } from "./aip";
import { leerMadhel } from "./ficha-anac";
import { fichaAnacDelPaquete, fichaParaPaquete, icaoDeLaUrl, lineaDeCanal, textoFichaDelPaquete, TEXTO_NOTAM_SIN_SENAL } from "./ficha-paquete";
import { armarPaquete } from "./sin-senal-servidor";
import { contestarSinSenal, indiceDelPaquete } from "./sin-senal";

/**
 * La ficha de un aeródromo armada con el paquete (sin señal) tiene que decir **lo mismo que la del
 * servidor** en lo que trae —pistas, frecuencias, combustible, ubicación, AIP, cartas—, y no inventar
 * lo que no trae: NOTAM (`null`, no `[]`), teléfonos ni normas.
 */

const paquete = armarPaquete();
const indice = indiceDelPaquete(JSON.parse(JSON.stringify(paquete)));
const ficha = (icao: string) => contestarSinSenal(new URL(`https://vectoraero.ar/api/airports/ficha?icao=${icao}`), indice);
const deMadhel = leerFichasMadhel();
const canales = canalesDeLlamada();

/**
 * Lo que habría contestado MADHEL para ese aeródromo, armado con los mismos archivos del repo: las
 * pistas y el combustible de la ficha, y —si es del MADHEL— el canal de llamada en las normas
 * particulares. Es lo que `leerMadhel` (el camino con señal) compone con el AIP.
 */
function madhelDeMentira(icao: string) {
  const a = getAirport(icao)!;
  const m = a.local ? deMadhel.get(a.local) : undefined;
  const canal = a.local ? canales.get(a.local) : undefined;
  return {
    metadata: {
      identifiers: { icao },
      condition: a.madhel?.condition ?? "",
      control: a.madhel?.controlled ? "CONTROLLED" : "NON-CONTROLLED",
      localization: { state: a.madhel?.province ?? "", fir: "" },
    },
    human_readable_identifier: a.name,
    data: {
      rwy: m?.pistas ?? [],
      fuel: m?.combustible ?? "",
      telephone: [],
      norms: { particular: { content: canal?.fuente === "madhel" ? `Canal de llamada: Frecuencia ${canal.mhz[0]} MHz` : "" }, general: { content: "" } },
    },
  };
}

function delPaquete(icao: string) {
  const r = ficha(icao);
  expect(r?.status).toBe(200);
  return r!.cuerpo as ReturnType<typeof fichaAnacDelPaquete>;
}

describe("la ficha del paquete da lo mismo que la del servidor, salvo los NOTAM", () => {
  // Controlados con AIP (San Fernando, Morón, Mar del Plata) y no controlados.
  const casos = ["SADF", "SADM", "SAZM", "SADZ", "SAAJ", "SAHR"];
  it.each(casos)("%s", (icao) => {
    const hecha = delPaquete(icao).madhel!;
    const servidor = leerMadhel(madhelDeMentira(icao), icao, datosAip(icao))!;
    expect(hecha.runways).toEqual(servidor.runways);
    expect(hecha.localization).toEqual(servidor.localization);
    expect(hecha.aip).toEqual(servidor.aip);
    expect(hecha.cartas).toEqual(servidor.cartas);
    expect(hecha.radio).toEqual(servidor.radio);
    // El combustible: "No especificado" cuando no hay, como el servidor.
    expect(hecha.fuel).toEqual(servidor.fuel);
  });

  it("San Fernando: la torre en 119.00 y 120.05, del AIP, y la pista 05/23", () => {
    const f = delPaquete("SADF").madhel!;
    expect(f.radio.some((r) => r.includes("119.00"))).toBe(true);
    expect(f.radio.some((r) => r.includes("120.05"))).toBe(true);
    expect(f.runways[0]).toContain("05/23");
    expect(f.aip?.edicion).toBeTruthy();
  });
});

describe("el canal de llamada (CTAF)", () => {
  it("un no controlado con canal de MADHEL: la frecuencia común, como la ficha con señal", () => {
    const f = delPaquete("SADZ").madhel!;
    const canal = canales.get(getAirport("SADZ")!.local!)!;
    expect(canal.fuente).toBe("madhel");
    expect(f.radio).toEqual([`Frecuencia común: ${canal.mhz.join(" / ")} MHz`]);
  });

  it("uno con canal de la lista de la zona: dice que NO es del AIP", () => {
    const sufijo = [...canales].find(([, c]) => c.fuente === "lista");
    expect(sufijo).toBeTruthy();
    const icao = paquete.aerodromos.find((a) => a.local === sufijo![0])!.icao;
    const f = delPaquete(icao).madhel!;
    expect(f.radio.some((r) => r.includes(sufijo![1].mhz[0]) && /no es del AIP/.test(r))).toBe(true);
  });

  it("la línea de MADHEL y la de la zona no se parecen", () => {
    expect(lineaDeCanal({ mhz: ["118.10"], fuente: "madhel" })).toBe("Frecuencia común: 118.10 MHz");
    expect(lineaDeCanal({ mhz: ["118.10"], fuente: "lista" })).toMatch(/no es del AIP/);
  });
});

describe("lo que la ficha del paquete NO trae", () => {
  it("**NOTAM: `null`, no `[]`** (invariante 2): nunca dice «no hay NOTAM»", () => {
    const f = delPaquete("SADM");
    expect(f.notams).toBeNull();
    expect(f.fichaDelPaquete?.version).toBe(paquete.version);
  });

  it("ni teléfonos ni normas (la copia completa de MADHEL no está en el repo, que es público)", () => {
    for (const icao of ["SADF", "SADM", "SADZ"]) {
      const m = delPaquete(icao).madhel!;
      expect(m.telephone).toEqual([]);
      expect(m.particularNorms).toBe("");
      expect(m.generalNorms).toBe("");
    }
  });

  it("el paquete entero no lleva teléfonos de MADHEL ni normas", () => {
    const texto = JSON.stringify(paquete.fichas);
    expect(texto).not.toMatch(/telephone|particularNorms|norms/);
  });

  it("un aeródromo sin nada guardado igual abre, con lo del directorio y sin inventar pistas", () => {
    const sin = paquete.aerodromos.find((a) => !paquete.fichas[a.icao])!;
    const f = delPaquete(sin.icao);
    expect(f.madhel?.runways).toEqual([]);
    expect(f.madhel?.radio).toEqual([]);
    expect(f.madhel?.fuel).toBe("No especificado");
    expect(f.notams).toBeNull();
  });

  it("un aeródromo que no existe es un 404, no una ficha vacía", () => {
    expect(ficha("ZZZZ")?.status).toBe(404);
  });
});

describe("la ficha del directorio", () => {
  it("el uso y el control salen del directorio de MADHEL", () => {
    const a = getAirport("SADM")!;
    const m = fichaAnacDelPaquete(a, paquete.fichas.SADM, "3.47.0").madhel!;
    expect(m.condition).toBe(a.madhel?.condition);
    expect(m.control).toBe("CONTROLLED");
    expect(m.state).toBe(a.madhel?.province);
  });

  it("sin dato de control no inventa uno", () => {
    const a = { ...getAirport("SADM")!, madhel: undefined };
    expect(fichaAnacDelPaquete(a, undefined, "3.47.0").madhel?.control).toBe("");
  });

  it("una ficha sin nada que mostrar no se guarda en el paquete", () => {
    expect(fichaParaPaquete(null, undefined)).toBeNull();
    expect(fichaParaPaquete(null, { combustible: "", pistas: [], canal: null })).toBeNull();
    expect(fichaParaPaquete(null, { combustible: "", pistas: ["05/23 800x20 M - Tierra."], canal: null })?.runways).toEqual(["05/23 800x20 M - Tierra."]);
  });

  it("las franjas dicen la verdad", () => {
    expect(textoFichaDelPaquete("3.47.0")).toMatch(/SIN SEÑAL/);
    expect(textoFichaDelPaquete("3.47.0")).toMatch(/sin teléfonos ni normas/);
    expect(TEXTO_NOTAM_SIN_SENAL).toMatch(/NOTAM no disponibles/);
    expect(TEXTO_NOTAM_SIN_SENAL).not.toMatch(/no hay/i);
  });
});

describe("icaoDeLaUrl", () => {
  it("lee ?icao= y lo pasa a mayúsculas", () => {
    expect(icaoDeLaUrl("?icao=sadm")).toBe("SADM");
    expect(icaoDeLaUrl("?filtro=1&icao=GEZ")).toBe("GEZ");
  });
  it("lo que no es un código, no", () => {
    expect(icaoDeLaUrl("")).toBeNull();
    expect(icaoDeLaUrl("?icao=")).toBeNull();
    expect(icaoDeLaUrl("?icao=../../etc")).toBeNull();
    expect(icaoDeLaUrl("?icao=SADMX")).toBeNull();
  });
});

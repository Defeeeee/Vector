import { describe, expect, it } from "vitest";
import type { Aircraft, Flight, Transaction } from "@/types";
import { horasQueFaltan, requisitosLicencia } from "./pca-progress";
import { armarMensajeResumen, calcularResumen, horas, mesAnteriorA, nombreDelMes, pesosAR, type EntradaResumen } from "./resumen-mensual";

const avion = { id: "a1", registration: "LV-ABC", icao: "C152", type: "Cessna 152", is_simulator: false } as Aircraft;
const sim = { id: "s1", registration: "SIM", icao: "SIM", type: "Simulador", is_simulator: true } as Aircraft;

let n = 0;
function vuelo(date: string, duration: number, extra: Partial<Flight> = {}): Flight {
  n++;
  return {
    id: `f${n}`, user_id: "u", aircraft_id: "a1", date, route: "SADF SADF", landings: 1, duration,
    takeoff: `${date}T12:00:00Z`, landing: `${date}T13:00:00Z`, purpose: "VP", pic_day_loc: duration,
    ...extra,
  } as Flight;
}

function entrada(e: Partial<EntradaResumen> = {}): EntradaResumen {
  return {
    mes: "2026-09", hoyIso: "2026-10-01", nombre: "Fede", licencia: "PPA", fechaPpa: null, trackingMode: "balance",
    flights: [], aircraft: [avion, sim], logbooks: [], transactions: [], documents: [], packs: [],
    ...e,
  };
}

describe("formatos", () => {
  it("nombre del mes y mes anterior, con el cambio de año", () => {
    expect(nombreDelMes("2026-09")).toBe("septiembre de 2026");
    expect(mesAnteriorA("2026-09")).toBe("2026-08");
    expect(mesAnteriorA("2027-01")).toBe("2026-12");
  });
  it("horas con coma y pesos con punto de miles, sin depender del locale", () => {
    expect(horas(6.24)).toBe("6,2");
    expect(horas(0)).toBe("0,0");
    expect(pesosAR(1234567.4)).toBe("$ 1.234.567");
    expect(pesosAR(-185000)).toBe("-$ 185.000");
  });
});

describe("calcularResumen", () => {
  const vuelos = [
    vuelo("2026-08-20", 1.5),
    vuelo("2026-09-03", 1.2, { route: "SADF SAAK", landings: 2 }),
    vuelo("2026-09-10", 2.0, { route: "SADF SADL", pic_day_loc: 0, pic_night_tra: 2.0, landings: 3, night_landings: 3 } as Partial<Flight>),
    vuelo("2026-09-15", 1.0, { aircraft_id: "s1", route: "LOCAL" }),
    // Del mes siguiente: el mail sale el 1 y a la mañana ya puede haber uno cargado.
    vuelo("2026-10-01", 0.9),
  ];

  it("cuenta sólo lo volado en el mes: sin simulador ni el mes siguiente", () => {
    const r = calcularResumen(entrada({ flights: vuelos }));
    expect(r.vuelos).toBe(2);
    expect(r.horas).toBeCloseTo(3.2);
    expect(r.aterrizajes).toBe(5);
    expect(r.horasNoche).toBeCloseTo(2.0);
    expect(r.aerodromos).toEqual(expect.arrayContaining(["SADF", "SAAK", "SADL"]));
    expect(r.masLargo).toEqual({ ruta: "SADF → SADL", horas: 2.0 });
    expect(r.simulador).toEqual({ sesiones: 1, horas: 1.0 });
    expect(r.horasMesAnterior).toBeCloseTo(1.5);
  });

  it("el total acumulado va hasta el cierre del mes y deja afuera el simulador", () => {
    const r = calcularResumen(entrada({ flights: vuelos }));
    expect(r.horasTotales).toBeCloseTo(4.7);
  });

  it("para la privada, lo que falta para la PCA es el mismo número del inicio", () => {
    const r = calcularResumen(entrada({ flights: vuelos }));
    const hastaElCierre = vuelos.filter((f) => f.date <= "2026-09-31");
    expect(r.progreso?.meta).toBe("PCA");
    expect(r.progreso?.faltan).toBeCloseTo(horasQueFaltan(requisitosLicencia(hastaElCierre, [], [avion, sim])));
    expect(r.progreso!.faltabanAlEmpezar).toBeGreaterThan(r.progreso!.faltan);
  });

  it("para el alumno, el camino a la PPA; para la comercial, ninguno", () => {
    expect(calcularResumen(entrada({ licencia: "ALUMNO", flights: vuelos })).progreso?.meta).toBe("PPA");
    expect(calcularResumen(entrada({ licencia: "PCA", flights: vuelos })).progreso).toBeNull();
  });

  it("saldo y gasto sólo para quien lleva saldo; packs para quien lleva packs", () => {
    const tx = [
      { id: "t1", user_id: "u", amount: 500000, type: "deposit", created_at: "2026-09-01" },
      { id: "t2", user_id: "u", flight_id: vuelos[1].id, amount: -185000, type: "charge", created_at: "2026-09-03" },
    ] as Transaction[];
    const conSaldo = calcularResumen(entrada({ flights: vuelos, transactions: tx }));
    expect(conSaldo.saldo).toBe(315000);
    expect(conSaldo.gasto).toBe(185000);

    const conPacks = calcularResumen(entrada({
      trackingMode: "packs", flights: vuelos, transactions: tx,
      packs: [{ id: "p", user_id: "u", name: "Pack 10 h", total_hours: 10, remaining_hours: 6.8, created_at: "", start_date: "", is_active: true, aircraft_ids: [] }],
    }));
    expect(conPacks.saldo).toBeNull();
    expect(conPacks.gasto).toBeNull();
    expect(conPacks.packs).toEqual([{ nombre: "Pack 10 h", quedan: 6.8 }]);
  });

  it("sin movimientos no afirma un saldo de cero", () => {
    expect(calcularResumen(entrada({ flights: vuelos })).saldo).toBeNull();
  });

  it("avisa el CMA si vence en 60 días o ya venció, y calla si no hay dato", () => {
    const cma = (expiry_date: string) => [{ kind: "cma", expiry_date }];
    expect(calcularResumen(entrada({ documents: cma("2026-11-15") })).cma).toEqual({ vence: "2026-11-15", vencido: false });
    expect(calcularResumen(entrada({ documents: cma("2026-09-20") })).cma).toEqual({ vence: "2026-09-20", vencido: true });
    expect(calcularResumen(entrada({ documents: cma("2027-06-01") })).cma).toBeNull();
    expect(calcularResumen(entrada({ documents: [] })).cma).toBeNull();
    // Con un CMA renovado cargado, manda el más nuevo.
    expect(calcularResumen(entrada({ documents: [...cma("2026-09-20"), ...cma("2027-09-20")] })).cma).toBeNull();
  });
});

describe("armarMensajeResumen", () => {
  const links = { appUrl: "https://vector.fdiaznem.com.ar", linkBaja: "https://vector.fdiaznem.com.ar/mail/baja?u=u&t=t" };

  it("con vuelos: el asunto dice horas y vuelos, y el mail trae la baja", () => {
    const r = calcularResumen(entrada({ flights: [vuelo("2026-09-03", 1.2), vuelo("2026-09-05", 1.3)] }));
    const m = armarMensajeResumen(r, links);
    expect(m.asunto).toBe("Tu septiembre en Vector: 2,5 h en 2 vuelos");
    expect(m.texto).toContain("Hola Fede:");
    expect(m.texto).toContain(links.linkBaja);
    expect(m.html).toContain("No recibirlo más");
    expect(m.html).toContain("/dashboard");
  });

  it("sin vuelos en el mes: invita a cargarlo, sin inventar números", () => {
    const r = calcularResumen(entrada({ flights: [vuelo("2026-08-03", 1.2)] }));
    const m = armarMensajeResumen(r, links);
    expect(m.asunto).toBe("Tu septiembre en Vector");
    expect(m.texto).toContain("No cargaste vuelos (el mes anterior fueron 1,2 h)");
    expect(m.html).toContain("/dashboard/log-flight");
  });

  it("escapa lo que escribió el piloto", () => {
    const r = calcularResumen(entrada({ nombre: "<b>Fede</b>", flights: [vuelo("2026-09-03", 1)] }));
    expect(armarMensajeResumen(r, links).html).not.toContain("<b>Fede</b>");
  });
});

describe("lo que falta pasar al CAD", () => {
  const links = { appUrl: "https://vector.fdiaznem.com.ar", linkBaja: "https://vector.fdiaznem.com.ar/mail/baja" };
  it("cuenta lo del mes y lo anterior sin pasar, y lleva a Pasar al CAD", () => {
    const vuelos = [vuelo("2026-09-10", 1), vuelo("2026-08-10", 1, { cad_vuelo_id: 9 }), vuelo("2026-09-12", 1), vuelo("2026-10-02", 1)];
    const r = calcularResumen(entrada({ flights: vuelos }));
    expect(r.cadPendientes).toBe(2);
    const m = armarMensajeResumen(r, links);
    expect(m.texto).toContain("Te faltan pasar 2 vuelos al CAD de ANAC.");
    expect(m.html).toContain("/dashboard/history/cad");
  });
  it("sin pendientes, o al alumno, no lo menciona", () => {
    const pasados = [vuelo("2026-09-10", 1, { cad_vuelo_id: 3 })];
    expect(armarMensajeResumen(calcularResumen(entrada({ flights: pasados })), links).texto).not.toContain("CAD");
    const alumno = calcularResumen(entrada({ licencia: "ALUMNO", flights: [vuelo("2026-09-10", 1)] }));
    expect(alumno.cadPendientes).toBe(0);
  });
});

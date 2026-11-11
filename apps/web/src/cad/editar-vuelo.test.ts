import { describe, expect, it } from "vitest";
import { cuerpoParaCambiarAutoridad, cuerpoParaEditar, fechaComoLaGuardaElCad } from "./editar-vuelo";

// Un vuelo como lo devuelve `Get?id=` (los nombres son los que lee el formulario de edición del CAD).
const vuelo = {
  vueloTripulanteID: 900001,
  tipoVueloID: 2,
  cargoID: 1,
  fechaHoraSalida: "2026-10-17T18:00:00",
  fechaHoraLlegada: "2026-10-17T19:12:00",
  horasDia: 1.2,
  horasNoche: 0,
  origenID: 101,
  origenPersonalizado: "",
  destinoID: 102,
  destinoPersonalizado: null,
  finalidadID: 71,
  potencia: 110,
  clase: "MONT-T",
  aterrizajes: 2,
  autoridadCertificanteID: 2,
  observaciones: "JUAN PEREZ",
  matriculaAvion: "LV-ABC",
  estadoDesc: "PENDIENTE DE DDJJ",
  discriminaciones: [{ tipoDiscriminacionID: 7, nombre: "CAPOTA", horas: 0.3 }],
};

describe("cambiar la autoridad de un vuelo del CAD", () => {
  it("arma el vuelo como el formulario del CAD, con sólo la autoridad cambiada", () => {
    const r = cuerpoParaCambiarAutoridad(vuelo, "5", " ana  gómez ");
    expect(r).toEqual({
      ok: true,
      cuerpo: {
        vueloTripulanteID: 900001,
        fechaHoraSalida: "2026-10-17T18:00:00.000Z",
        fechaHoraLlegada: "2026-10-17T19:12:00.000Z",
        tipoVueloID: 2,
        aterrizajes: 2,
        autoridadCertificanteID: "5",
        observaciones: "ANA GÓMEZ",
        finalidadID: 71,
        potencia: 110,
        clase: "MONT-T",
        cargoID: 1,
        origenID: 101,
        destinoID: 102,
        origenPersonalizado: "",
        destinoPersonalizado: null,
        horasDia: 1.2,
        horasNoche: 0,
        matriculaAvion: "LV-ABC",
        Discriminaciones: [{ tipoDiscriminacionID: 7, horas: 0.3 }],
      },
    });
  });

  it("no manda lo que el CAD no toma en el formulario (el estado, el nombre de la discriminación)", () => {
    const r = cuerpoParaCambiarAutoridad(vuelo, "5", "ANA");
    expect(r.ok && "estadoDesc" in r.cuerpo).toBe(false);
  });

  it("un simulador va con su simulador y sin aterrizajes", () => {
    const sim = { ...vuelo, tipoVueloID: 3, aterrizajes: 1, simulador: { simuladorID: 12, nombre: "C172", modeloID: 40, modelo: "C172" } };
    const r = cuerpoParaCambiarAutoridad(sim, "5", "ANA");
    expect(r.ok && r.cuerpo.aterrizajes).toBe(0);
    expect(r.ok && r.cuerpo.simulador).toEqual({ simuladorID: 12, nombre: "C172", modeloID: 40, modelo: "C172" });
    expect(r.ok && "origenID" in r.cuerpo).toBe(false);
  });

  it("si falta algo, no se edita", () => {
    expect(cuerpoParaCambiarAutoridad({ ...vuelo, matriculaAvion: null }, "5", "ANA").ok).toBe(false);
    expect(cuerpoParaCambiarAutoridad({ ...vuelo, tipoVueloID: 4 }, "5", "ANA").ok).toBe(false);
    expect(cuerpoParaCambiarAutoridad(vuelo, "", "ANA").ok).toBe(false);
    expect(cuerpoParaCambiarAutoridad(vuelo, "5", " ").ok).toBe(false);
  });

  it("las horas: sin zona se devuelven en UTC; con zona no se edita", () => {
    expect(fechaComoLaGuardaElCad("2026-10-17T18:00:00.5")).toBe("2026-10-17T18:00:00.000Z");
    expect(fechaComoLaGuardaElCad("2026-10-17T18:00:00Z")).toBeNull();
    expect(fechaComoLaGuardaElCad("2026-10-17T18:00:00-03:00")).toBeNull();
    expect(cuerpoParaCambiarAutoridad({ ...vuelo, fechaHoraSalida: "2026-10-17T18:00:00Z" }, "5", "ANA").ok).toBe(false);
  });
});

describe("corregir otros campos de un vuelo del CAD (3.19.0)", () => {
  it("pisa sólo lo que manda Vector, con las horas en el formato del formulario", () => {
    const r = cuerpoParaEditar(vuelo, { fechaHoraSalida: "2026-10-17T18:30:00.000Z", fechaHoraLlegada: "2026-10-17T19:42:00Z", horasDia: 1.2, aterrizajes: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuerpo.fechaHoraSalida).toBe("2026-10-17T18:30:00.000Z");
    expect(r.cuerpo.fechaHoraLlegada).toBe("2026-10-17T19:42:00.000Z");
    expect(r.cuerpo.aterrizajes).toBe(3);
    // Lo demás, como vino.
    expect(r.cuerpo.autoridadCertificanteID).toBe(2);
    expect(r.cuerpo.observaciones).toBe("JUAN PEREZ");
    expect(r.cuerpo.matriculaAvion).toBe("LV-ABC");
    expect(r.cuerpo.Discriminaciones).toEqual([{ tipoDiscriminacionID: 7, horas: 0.3 }]);
  });

  it("descarta lo que no está en la lista blanca (el id, el simulador, cualquier otra cosa)", () => {
    const r = cuerpoParaEditar(vuelo, { vueloTripulanteID: 1, simulador: { simuladorID: 9 }, ddjj: true, aterrizajes: 4 });
    expect(r.ok && r.cuerpo.vueloTripulanteID).toBe(900001);
    expect(r.ok && "simulador" in r.cuerpo).toBe(false);
    expect(r.ok && "ddjj" in r.cuerpo).toBe(false);
    expect(cuerpoParaEditar(vuelo, { ddjj: true }).ok).toBe(false);
  });

  it("no pasa un vuelo a simulador ni al revés", () => {
    expect(cuerpoParaEditar(vuelo, { tipoVueloID: "3" }).ok).toBe(false);
  });

  it("la discriminación nueva va con tipo y horas, y una hora rara no se manda", () => {
    const r = cuerpoParaEditar(vuelo, { Discriminaciones: [{ tipoDiscriminacionID: 1, horas: 1.2, otra: "x" }] });
    expect(r.ok && r.cuerpo.Discriminaciones).toEqual([{ tipoDiscriminacionID: 1, horas: 1.2 }]);
    expect(cuerpoParaEditar(vuelo, { fechaHoraSalida: "ayer" }).ok).toBe(false);
  });
});

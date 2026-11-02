import { describe, expect, it } from "vitest";
import {
  leidoDelCad,
  autoridadSugerida,
  borradorCad,
  faltaAutoridad,
  recordarAutoridades,
  claseCad,
  horasCentesimalesCad,
  matriculaCad,
  payloadCad,
  resolverFinalidad,
  resolverLugar,
  FINALIDAD_CAD,
  yaEstaEnElCad,
  codigoDeLugarCad,
  estaEnVector,
  propositoDesdeCad,
  vueloDesdeCad,
  validarTraido,
  mismoVueloOtroDia,
  fechaCortaCad,
  pendientesDelCad,
  AUTORIDADES_CAD,
  autoridadDelFormulario,
  autoridadesPorFinalidad,
  claveDeAutoridad,
  borradosDelCad,
  cuantosPendientesDeDdjj,
  pendienteDeDdjj,
  faltaSimulador,
  filaCad,
  simuladorSugerido,
  simuladorValido,
  type ItemCad,
  type LugarParaCad,
  type VueloVector,
} from "./cad";
import { calculateFlightDuration } from "./utils";

// Un lugar con su designador ANAC: Luján es SRDL en la ruta y LJN en el CAD.
const LOCALES: Record<string, string> = { SRDL: "LJN" };
const lugar = (codigo: string): LugarParaCad => ({ codigo, candidatos: [codigo, LOCALES[codigo]].filter(Boolean) as string[], nombre: null });
const ECHO = { registration: "LVS100", type_acft: "MONT-T", potencia_hp: 100 };

// Dos vuelos reales del CAD de Federico (leídos el 2026-10-20), como los tiene Vector.
const LUJAN_MORON: VueloVector = {
  id: "v1",
  date: "2026-10-17",
  route: "SRDL SADM",
  landings: 1,
  duration: 1.0,
  takeoff: "2026-10-17T18:00:00Z",
  landing: "2026-10-17T19:00:00Z",
  purpose: "ENT",
  pic_day_tra: 1.0,
};
const LOCAL_CAPOTA: VueloVector = {
  id: "v2",
  date: "2026-09-27",
  route: "SADF SADF",
  landings: 1,
  duration: 1.0,
  takeoff: "2026-09-27T11:45:00Z",
  landing: "2026-09-27T12:45:00Z",
  purpose: "INST",
  pic_day_loc: 1.0,
  capota: 0.7,
};

describe("las horas, como las cuenta el CAD", () => {
  it("es la misma tabla que la de Vector, minuto por minuto", () => {
    for (let m = 0; m <= 59; m++) {
      const salida = "2026-10-17T18:00:00Z";
      const llegada = new Date(Date.parse(salida) + (60 + m) * 60_000).toISOString();
      expect(horasCentesimalesCad(salida, llegada)).toBe(calculateFlightDuration("18:00", `19:${String(m).padStart(2, "0")}`));
    }
  });

  it("cruza la medianoche y varios días", () => {
    expect(horasCentesimalesCad("2026-10-17T23:30:00Z", "2026-10-18T00:45:00Z")).toBe(1.3);
    expect(horasCentesimalesCad("2026-10-17T10:00:00Z", "2026-10-18T11:00:00Z")).toBe(25);
  });

  it("una llegada que no es posterior, no", () => {
    expect(horasCentesimalesCad("2026-10-17T19:00:00Z", "2026-10-17T18:00:00Z")).toBeNull();
  });
});

describe("el vuelo de Vector, armado para el CAD", () => {
  it("una travesía: tipo 2, piloto, horas de día, Luján con su código ANAC", () => {
    const b = borradorCad(LUJAN_MORON, ECHO, lugar);
    expect(b).toMatchObject({
      problema: null,
      tipoVueloID: 2,
      cargoID: 1,
      fechaHoraSalida: "2026-10-17T18:00:00.000Z",
      fechaHoraLlegada: "2026-10-17T19:00:00.000Z",
      horas: 1,
      horasDia: 1,
      horasNoche: 0,
      aterrizajes: 1,
      clase: "MONT-T",
      potencia: 100,
      matricula: "LV-S100",
      finalidad: "ENTRENAMIENTO",
      ruta: "SRDL → SADM",
      fecha: "17/10/2026",
    });
    expect(b.origen.candidatos).toEqual(["SRDL", "LJN"]);
    expect(b.discriminaciones).toEqual([]);
  });

  it("un local con capota: tipo 1, la capota en la discriminación", () => {
    const b = borradorCad(LOCAL_CAPOTA, ECHO, lugar);
    expect(b).toMatchObject({ problema: null, tipoVueloID: 1, finalidad: "INSTRUCCIÓN", ruta: "SADF (local)" });
    expect(b.discriminaciones).toEqual([{ tipoDiscriminacionID: 7, horas: "0.7" }]);
  });

  it("instructor: la discriminación de instructor con todas las horas; multimotor, igual", () => {
    const b = borradorCad({ ...LOCAL_CAPOTA, purpose: "I", capota: 0 }, { ...ECHO, type_acft: "MULT-T" }, lugar);
    expect(b.discriminaciones).toEqual([
      { tipoDiscriminacionID: 1, horas: "1.0" },
      { tipoDiscriminacionID: 2, horas: "1.0" },
    ]);
  });

  it("copiloto: cargo 2 y sus horas", () => {
    const b = borradorCad({ ...LUJAN_MORON, pic_day_tra: 0, sic_day_tra: 1 }, ECHO, lugar);
    expect(b).toMatchObject({ cargoID: 2, horasDia: 1, problema: null });
  });

  it("lo que el CAD rechazaría, se marca para revisar", () => {
    expect(borradorCad({ ...LUJAN_MORON, pic_day_tra: 0.8 }, ECHO, lugar).problema).toMatch(/no dan lo que va de la salida a la llegada/);
    expect(borradorCad({ ...LUJAN_MORON, takeoff: null }, ECHO, lugar).problema).toMatch(/hora de salida/);
    expect(borradorCad(LUJAN_MORON, { ...ECHO, type_acft: null }, lugar).problema).toMatch(/clase/);
    expect(borradorCad({ ...LUJAN_MORON, purpose: "XYZ" }, ECHO, lugar).problema).toMatch(/finalidad/);
    expect(borradorCad({ ...LUJAN_MORON, sic_day_tra: 1 }, ECHO, lugar).problema).toMatch(/piloto y de copiloto/);
    // Un simulador ya no se marca: va como sesión de simulador (2.33.0, ver abajo).
    expect(borradorCad(LUJAN_MORON, { ...ECHO, is_simulator: true }, lugar).tipoVueloID).toBe(3);
  });
});

describe("lo que se resuelve con las listas del CAD", () => {
  const finalidades = [
    { key: "63", value: "ENTRENAMIENTO" },
    { key: "68", value: "INSTRUCCIÓN" },
  ];
  // Copiadas de `GetLugarAterrizajeListItem?tipoLugar=AER` del CAD real (2026-10-21).
  const aerodromos = [
    { key: "FDO", value: "SADF -  FDO -  FDO (SAN FERNANDO)" },
    { key: "MOR", value: "SADM -  MOR (MORON)" },
    { key: "LJN", value: " LJN (LUJAN)" },
    { key: "LJNM", value: " LJNM (NOVO MESTO)" },
    { key: "SAEZ", value: " SAEZ (EZEIZA)" },
    { key: "EZE", value: "SAEZ -  EZE -  EZE (EZEIZA/MINISTRO PISTARINI)" },
    { key: "BAR", value: "SAZS -  BRC -  BAR (SAN CARLOS DE BARILOCHE)" },
    { key: "2013", value: " 2013 (VILLA JOSEFINA)" },
  ];

  it("la finalidad, por nombre, sin importar las tildes", () => {
    expect(resolverFinalidad("INSTRUCCIÓN", finalidades)).toBe("68");
    expect(resolverFinalidad("INSTRUCCION", finalidades)).toBe("68");
    expect(resolverFinalidad("ACROBACIA", finalidades)).toBeNull();
  });

  it("el aeródromo, sólo por código exacto: OACI o designador ANAC", () => {
    expect(resolverLugar(lugar("SADF"), aerodromos)).toBe("FDO");
    expect(resolverLugar(lugar("SADM"), aerodromos)).toBe("MOR");
    expect(resolverLugar(lugar("SRDL"), aerodromos)).toBe("LJN");
    expect(resolverLugar(lugar("SAZS"), aerodromos)).toBe("BAR");
    expect(resolverLugar(lugar("SADL"), aerodromos)).toBeNull();
    // Ni el código del medio (IATA) ni un prefijo.
    expect(resolverLugar(lugar("BRC"), aerodromos)).toBeNull();
    expect(resolverLugar(lugar("SAD"), aerodromos)).toBeNull();
  });

  it("si la lista repite un aeródromo, gana la entrada completa", () => {
    expect(resolverLugar(lugar("SAEZ"), aerodromos)).toBe("EZE");
    expect(resolverLugar(lugar("SAEZ"), [...aerodromos].reverse())).toBe("EZE");
  });

  it("cada finalidad de Vector existe, con ese nombre, en la lista del CAD", () => {
    // `GetFinalidadListItem?tcp=false` del CAD real (2026-10-21).
    const delCad = [
      "ACROBACIA", "ADAPTACIÓN", "AEROPLICADOR", "COMBATE CONTRA INCENDIOS DE BOSQUES Y CAMPOS", "ENTRENAMIENTO", "EXAMEN",
      "VUELO EN FORMACIÓN", "FOTOGRAFÍA", "INSTRUCTOR", "INSTRUCCIÓN", "INSPECTOR", "LANZAMIENTO DE PARACAIDISTAS", "VUELO NO REGULAR",
      "PRUEBA DE AERONAVES", "READAPTACIÓN", "REMOLQUE DE PLANEADOR", "SANITARIO", "TRABAJO AÉREO", "VUELO OFICIAL", "VUELO PRIVADO",
      "LINEA AEREA", "INSPECTOR (TCP)", "TRIPULANTE DE CABINA DE PASAJEROS EN INSTRUCCION",
    ].map((value, i) => ({ key: String(i), value }));
    for (const nombre of Object.values(FINALIDAD_CAD)) expect(resolverFinalidad(nombre, delCad), nombre).not.toBeNull();
  });

  it("un vuelo que ya está: misma salida al minuto y misma matrícula", () => {
    const enElCad = [{ vueloTripulanteID: 831538, fechaSalida: "2026-10-17T18:00:00", matricula: "LV-S100" }];
    expect(yaEstaEnElCad({ fechaHoraSalida: "2026-10-17T18:00:00.000Z", matricula: "LVS100" }, enElCad)).toBe(831538);
    expect(yaEstaEnElCad({ fechaHoraSalida: "2026-10-17T18:05:00.000Z", matricula: "LV-S100" }, enElCad)).toBeNull();
    expect(yaEstaEnElCad({ fechaHoraSalida: "2026-10-17T18:00:00.000Z", matricula: "LV-S114" }, enElCad)).toBeNull();
  });

  it("el objeto de 'Crear', como lo arma el formulario del CAD", () => {
    const b = borradorCad(LOCAL_CAPOTA, ECHO, lugar);
    const p = payloadCad(b, { finalidadID: "68", origenID: "101", destinoID: "101", autoridadID: "5", autoridadNombre: "JUAN PEREZ" });
    expect(p).toEqual({
      Discriminaciones: [{ tipoDiscriminacionID: 7, horas: "0.7" }],
      discriminaciones: [],
      tipoVueloID: "1",
      fechaHoraSalida: "2026-09-27T11:45:00.000Z",
      fechaHoraLlegada: "2026-09-27T12:45:00.000Z",
      aterrizajes: 1,
      autoridadCertificanteID: "5",
      observaciones: "JUAN PEREZ",
      finalidadID: "68",
      potencia: 100,
      clase: "MONT-T",
      horasDia: 1,
      horasNoche: 0,
      cargoID: "1",
      origenID: "101",
      destinoID: "101",
      origenPersonalizado: "",
      destinoPersonalizado: "",
      matriculaAvion: "LV-S100",
    });
  });
});

describe("matrícula y clase", () => {
  it("la matrícula con el guion del registro", () => {
    expect(matriculaCad("LVS114")).toBe("LV-S114");
    expect(matriculaCad("lv-s114")).toBe("LV-S114");
    expect(matriculaCad("N123AB")).toBe("N123AB");
  });

  it("los acuáticos de Vector son MON-A en el CAD", () => {
    expect(claseCad("MONT-H")).toBe("MON-A");
    expect(claseCad("MULT-H")).toBe("MULT-A");
    expect(claseCad("MONT-T")).toBe("MONT-T");
    expect(claseCad(null)).toBeNull();
  });
});

describe("la autoridad certificante, por vuelo", () => {
  it("propone la última usada para la misma finalidad, sin importar las tildes", () => {
    const memoria = recordarAutoridades(null, [
      { finalidad: "INSTRUCCIÓN", autoridad: { id: "2", nombre: "juan perez" } },
      { finalidad: "VUELO PRIVADO", autoridad: { id: "1", nombre: "Lucia Ferrari" } },
    ]);
    expect(autoridadSugerida(memoria, "INSTRUCCION")).toEqual({ id: "2", nombre: "JUAN PEREZ" });
    expect(autoridadSugerida(memoria, "VUELO PRIVADO")).toEqual({ id: "1", nombre: "LUCIA FERRARI" });
  });

  it("sin antecedentes para esa finalidad, vacía: no se inventa quién firma", () => {
    expect(autoridadSugerida({ porFinalidad: {} }, "EXAMEN")).toEqual({ id: "", nombre: "" });
    expect(autoridadSugerida(null, "EXAMEN")).toEqual({ id: "", nombre: "" });
  });

  it("la última carga pisa a la anterior, y una incompleta no se recuerda", () => {
    let m = recordarAutoridades(null, [{ finalidad: "INSTRUCCIÓN", autoridad: { id: "2", nombre: "JUAN PEREZ" } }]);
    m = recordarAutoridades(m, [
      { finalidad: "INSTRUCCIÓN", autoridad: { id: "2", nombre: "ANA GOMEZ" } },
      { finalidad: "EXAMEN", autoridad: { id: "3", nombre: "  " } },
    ]);
    expect(autoridadSugerida(m, "INSTRUCCIÓN").nombre).toBe("ANA GOMEZ");
    expect(autoridadSugerida(m, "EXAMEN")).toEqual({ id: "", nombre: "" });
  });

  it("falta si no hay autoridad o no hay nombre", () => {
    expect(faltaAutoridad({ id: "1", nombre: "X" })).toBe(false);
    expect(faltaAutoridad({ id: "", nombre: "X" })).toBe(true);
    expect(faltaAutoridad({ id: "1", nombre: " " })).toBe(true);
    expect(faltaAutoridad(null)).toBe(true);
  });
});



describe("del CAD a Vector", () => {
  const listas = {
    finalidades: [
      { key: "71", value: "VUELO PRIVADO" },
      { key: "68", value: "INSTRUCCIÓN" },
      { key: "99", value: "BAUTISMO" },
    ],
    lugares: [
      { key: "10", value: "SADF -  FDO -  FDO (SAN FERNANDO)" },
      { key: "11", value: "SAZS -  BRC -  BAR (SAN CARLOS DE BARILOCHE)" },
      { key: "12", value: " LJN (LUJAN)" },
    ],
  };
  const crear = {
    vueloTripulanteID: 900123,
    tipoVueloID: "2",
    cargoID: "1",
    fechaHoraSalida: "2026-09-25T13:45:00",
    fechaHoraLlegada: "2026-09-25T16:03:00",
    horasDia: 2.3,
    horasNoche: 0,
    aterrizajes: 2,
    finalidadID: "71",
    origenID: "10",
    destinoID: "11",
    matriculaAvion: "LV-ABC",
    Discriminaciones: [
      { tipoDiscriminacionID: 7, horas: "0.5" },
      { tipoDiscriminacionID: 6, horas: "0,3" },
    ],
  };

  it("arma el desglose del libro: piloto, travesía, día, capota e instrumentos", () => {
    const f = vueloDesdeCad(crear, listas, ["LVABC"]);
    expect(f.problema).toBeNull();
    expect(f.ruta).toBe("SADF → SAZS");
    expect(f.fecha).toBe("25/09/2026");
    expect(f.vuelo).toMatchObject({
      cadId: 900123,
      date: "2026-09-25",
      takeoff: "2026-09-25T13:45:00Z",
      landing: "2026-09-25T16:03:00Z",
      origen: "SADF",
      destino: "SAZS",
      landings: 2,
      duration: 2.3,
      purpose: "VP",
      pic_day_tra: 2.3,
      pic_day_loc: 0,
      sic_day_tra: 0,
      capota: 0.5,
      imc_pil: 0.3,
      imc_cop: 0,
    });
  });

  it("copiloto, local y de noche; con los nombres de la lista en vez de los IDs", () => {
    const f = vueloDesdeCad(
      {
        vueloTripulanteID: 5,
        tipoVueloID: 1,
        cargoID: 2,
        fechaSalida: "2026-07-01T22:00:00",
        fechaLlegada: "2026-07-01T23:00:00",
        horasDia: 0,
        horasNoche: 1,
        aterrizajes: 6,
        finalidadDesc: "Instrucción",
        origenDesc: " LJN (LUJAN)",
        matricula: "LV-XYZ",
        Discriminaciones: [{ tipoDiscriminacionID: 6, horas: "0.4" }],
      },
      listas,
      ["LV-XYZ"]
    );
    expect(f.problema).toBeNull();
    expect(f.ruta).toBe("LJN (local)");
    expect(f.vuelo).toMatchObject({ origen: "LJN", destino: "LJN", purpose: "INST", sic_night_loc: 1, pic_night_loc: 0, imc_cop: 0.4, imc_pil: 0 });
  });

  it("no adivina: lo que no cierra queda para revisar", () => {
    const con = (cambio: Record<string, unknown>, matriculas = ["LV-ABC"]) => vueloDesdeCad({ ...crear, ...cambio }, listas, matriculas).problema;
    expect(con({ tipoVueloID: 3 })).toMatch(/simulador/);
    expect(con({ tipoVueloID: undefined })).toMatch(/local o travesía/);
    expect(con({ cargoID: 7 })).toMatch(/piloto o copiloto/);
    expect(con({ fechaHoraSalida: "ayer" })).toMatch(/salida o la llegada/);
    expect(con({ horasDia: 2.0 })).toMatch(/no dan/);
    expect(con({}, ["LV-OTR"])).toMatch(/LV-ABC no está en tu Hangar/);
    expect(con({ finalidadID: "99" })).toMatch(/BAUTISMO/);
    expect(con({ origenID: "404", destinoID: "404" })).toMatch(/aeródromo/);
    expect(con({ vueloTripulanteID: undefined })).toMatch(/número/);
    expect(vueloDesdeCad({ ...crear, tipoVueloID: 3 }, listas, ["LV-ABC"]).vuelo).toBeNull();
  });

  it("una salida con zona se pasa a UTC", () => {
    const f = vueloDesdeCad({ ...crear, fechaHoraSalida: "2026-09-25T10:45:00-03:00", fechaHoraLlegada: "2026-09-25T13:03:00-03:00" }, listas, ["LV-ABC"]);
    expect(f.vuelo?.takeoff).toBe("2026-09-25T13:45:00Z");
  });

  it("de Vector al CAD y de vuelta da el mismo vuelo", () => {
    const v: VueloVector = {
      id: "v1",
      date: "2026-09-25",
      route: "SADF SAZS",
      landings: 2,
      duration: 2.3,
      takeoff: "2026-09-25T13:45:00Z",
      landing: "2026-09-25T16:03:00Z",
      purpose: "VP",
      pic_day_tra: 2.3,
      capota: 0.5,
    };
    const b = borradorCad(v, { registration: "LVABC", type_acft: "MONT-T" }, (c) => ({ codigo: c, candidatos: [c], nombre: null }));
    const p = payloadCad(b, { finalidadID: "71", origenID: "10", destinoID: "11", autoridadID: "1", autoridadNombre: "X" });
    const f = vueloDesdeCad({ ...p, vueloTripulanteID: 1 }, listas, ["LV-ABC"]);
    expect(f.vuelo).toMatchObject({ date: v.date, takeoff: v.takeoff, landing: v.landing, duration: 2.3, pic_day_tra: 2.3, capota: 0.5, purpose: "VP", landings: 2 });
  });

  it("sabe si un vuelo del CAD ya está en Vector", () => {
    const conocidos = [
      { cadId: 77, salida: "2026-01-01T10:00", matricula: "LV-AAA" },
      { cadId: null, salida: "2026-09-25T13:45", matricula: "LVABC" },
    ];
    expect(estaEnVector({ vueloTripulanteID: 77, fechaSalida: "2020-01-01T00:00:00", matricula: "X" }, conocidos)).toBe(true);
    expect(estaEnVector({ vueloTripulanteID: 1, fechaSalida: "2026-09-25T13:45:00", matricula: "LV-ABC" }, conocidos)).toBe(true);
    expect(estaEnVector({ vueloTripulanteID: 1, fechaSalida: "2026-09-25T13:46:00", matricula: "LV-ABC" }, conocidos)).toBe(false);
  });

  it("los nombres de lugares y finalidades", () => {
    expect(codigoDeLugarCad("SADF -  FDO -  FDO (SAN FERNANDO)")).toBe("SADF");
    expect(codigoDeLugarCad(" LJN (LUJAN)")).toBe("LJN");
    expect(codigoDeLugarCad(undefined)).toBe("");
    expect(propositoDesdeCad("Instrucción")).toBe("INST");
    expect(propositoDesdeCad("ENTRENAMIENTO")).toBe("ENT");
    expect(propositoDesdeCad("")).toBeNull();
  });

  it("el server revisa de nuevo lo que llega del CAD", () => {
    const bueno = vueloDesdeCad(crear, listas, ["LV-ABC"]).vuelo!;
    expect(validarTraido(bueno)).toEqual(bueno);
    expect(validarTraido({ ...bueno, extra: "x" })).toEqual(bueno);
    expect(validarTraido({ ...bueno, pic_day_tra: 2.2 })).toBeNull();
    expect(validarTraido({ ...bueno, duration: 2.2, pic_day_tra: 2.2 })).toBeNull();
    expect(validarTraido({ ...bueno, cadId: -1 })).toBeNull();
    expect(validarTraido({ ...bueno, purpose: "XX" })).toBeNull();
    expect(validarTraido({ ...bueno, origen: "<script>" })).toBeNull();
    expect(validarTraido({ ...bueno, date: "2026-09-24" })).toBeNull();
    expect(validarTraido({ ...bueno, capota: "0.5" })).toBeNull();
    expect(validarTraido(null)).toBeNull();
  });

  it("con la forma real del CAD: la fila de la lista con el detalle encima", () => {
    // Leídos del CAD real el 2026-10-21 (sin la autoridad), con otros datos.
    const fila = {
      vueloTripulanteID: 769075, cargoDesc: "PILOTO", origenDesc: "LJN", destinoDesc: "LJN", finalidad: "ENTRENAMIENTO",
      fechaSalida: "2026-09-27T11:45:00", fechaLlegada: "2026-09-27T12:45:00",
      fechaHoraSalida: "27/09/2026 11:45", fechaHoraLlegada: "27/09/2026 12:45",
      tipoVueloDesc: "LOCAL", matricula: "LV-ABC", tiempoTotal: "1.0 hs", tiempoVueloPorInstrumentoCapota: "0.7 hs",
    };
    const detalle = {
      vueloTripulanteID: 769075, cargoID: 1, finalidadID: 63, origenID: "LJN", destinoID: "LJN", origenPersonalizado: null,
      destinoPersonalizado: null, fechaHoraSalida: "2026-09-27T11:45:00", fechaHoraLlegada: "2026-09-27T12:45:00", tipoVueloID: 1,
      aterrizajes: 4, potencia: 100, clase: "MONT-T", horasDia: 1, horasNoche: 0, matriculaAvion: "LV-ABC", simulador: null,
      discriminaciones: [{ tipoDiscriminacionID: 7, nombre: "VUELO X INSTRUMENTO CAPOTA", horas: 0.7 }],
    };
    const lugares = [...listas.lugares, { key: "LJN", value: " LJN (LUJAN)" }];
    const fins = [...listas.finalidades, { key: "63", value: "ENTRENAMIENTO" }];
    const conDetalle = vueloDesdeCad({ ...fila, ...detalle }, { finalidades: fins, lugares }, ["LV-ABC"]);
    expect(conDetalle.problema).toBeNull();
    expect(conDetalle.vuelo).toMatchObject({ takeoff: "2026-09-27T11:45:00Z", origen: "LJN", destino: "LJN", purpose: "ENT", pic_day_loc: 1, capota: 0.7, landings: 4 });
    // Si el detalle no llegó, la lista sola no alcanza (no dice día y noche): queda para revisar.
    expect(vueloDesdeCad(fila, { finalidades: fins, lugares }, ["LV-ABC"]).problema).not.toBeNull();
    // La capota de la lista, si el detalle no trae discriminaciones.
    expect(vueloDesdeCad({ ...fila, ...detalle, discriminaciones: [] }, { finalidades: fins, lugares }, ["LV-ABC"]).vuelo?.capota).toBe(0.7);
  });
});

describe("el mismo vuelo, con otra fecha", () => {
  // El caso real: el CAD tenía 05/09 18:20 y Vector 06/09 18:20, en LV-S114.
  const otros = [
    { salida: "2026-09-05T18:20", matricula: "LV-S114" },
    { salida: "2026-08-26T20:10", matricula: "LV-S114" },
  ];
  it("un día antes o después, a la misma hora y en el mismo avión", () => {
    expect(mismoVueloOtroDia("2026-09-06T18:20", "LVS114", otros)).toBe("2026-09-05T18:20");
    expect(mismoVueloOtroDia("2026-08-25T20:10:00Z", "LV-S114", otros)).toBe("2026-08-26T20:10");
  });
  it("no: otro avión, otra hora, el mismo día o dos días", () => {
    expect(mismoVueloOtroDia("2026-09-06T18:20", "LV-S024", otros)).toBeNull();
    expect(mismoVueloOtroDia("2026-09-06T18:21", "LV-S114", otros)).toBeNull();
    expect(mismoVueloOtroDia("2026-09-05T18:20", "LV-S114", otros)).toBeNull();
    expect(mismoVueloOtroDia("2026-09-07T18:20", "LV-S114", otros)).toBeNull();
    expect(mismoVueloOtroDia("", "LV-S114", otros)).toBeNull();
  });
  it("la fecha para el aviso", () => {
    expect(fechaCortaCad("2026-09-05T18:20")).toBe("05/09 18:20");
  });
});

describe("lo que falta pasar al CAD", () => {
  const aviones = [{ id: "a1" }, { id: "sim", is_simulator: true }];
  const vuelos = [
    { date: "2025-10-31", aircraft_id: "a1" }, // antes del CAD: va en papel
    { date: "2025-11-01", aircraft_id: "a1" }, // el primer día cuenta
    { date: "2026-03-01", aircraft_id: "a1", cad_vuelo_id: 5 }, // ya está
    { date: "2026-03-02", aircraft_id: "a1", cad_omitido: "foliado" },
    { date: "2026-03-03", aircraft_id: "a1", cad_omitido: "ignorado" },
    { date: "2026-03-04", aircraft_id: "sim" }, // simulador: desde la 2.33.0 también se pasa
    { date: "2026-09-30", aircraft_id: "a1" },
    { date: "2026-10-05", aircraft_id: null },
  ];
  it("cuenta desde el 1/11/2025, sin lo pasado ni lo omitido (con los simuladores)", () => {
    expect(pendientesDelCad(vuelos, aviones)).toBe(4);
  });
  it("hasta un día, para el resumen del mes", () => {
    expect(pendientesDelCad(vuelos, aviones, "2026-09-30")).toBe(3);
  });
});

describe("la autoridad guardada en el vuelo", () => {
  it("la lista tiene los ids del CAD, sin repetir", () => {
    const ids = AUTORIDADES_CAD.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(AUTORIDADES_CAD.find((a) => a.id === 5)?.nombre).toBe("INSTRUCTOR DE VUELO");
  });
  it("del formulario: sólo ids de la lista, el nombre sin espacios de más", () => {
    expect(autoridadDelFormulario("5", "  Juan   Pérez ")).toEqual({ cad_autoridad_id: 5, cad_autoridad_nombre: "Juan Pérez" });
    expect(autoridadDelFormulario("99", "")).toEqual({ cad_autoridad_id: null, cad_autoridad_nombre: null });
    expect(autoridadDelFormulario(null, "x".repeat(200)).cad_autoridad_nombre).toHaveLength(120);
  });
  it("la última de cada finalidad, para proponerla", () => {
    const m = autoridadesPorFinalidad([
      { purpose: "INST", cad_autoridad_id: 5, cad_autoridad_nombre: "ANA GÓMEZ" },
      { purpose: "INST", cad_autoridad_id: 6, cad_autoridad_nombre: "VIEJO" },
      { purpose: "VP", cad_autoridad_id: 1, cad_autoridad_nombre: " " },
      { purpose: "vp", cad_autoridad_id: 2, cad_autoridad_nombre: "JEFE" },
    ]);
    expect(m).toEqual({ INST: { id: 5, nombre: "ANA GÓMEZ" }, VP: { id: 2, nombre: "JEFE" } });
  });
  it("el borrador lleva la autoridad del vuelo, si tiene", () => {
    const v: VueloVector = { id: "v", date: "2026-09-25", route: "SADF SADF", landings: 1, duration: 1, takeoff: "2026-09-25T13:00:00Z", landing: "2026-09-25T14:00:00Z", purpose: "INST", pic_day_loc: 1, cad_autoridad_id: 5, cad_autoridad_nombre: "Ana Gómez" };
    const lugar0 = (c: string) => ({ codigo: c, candidatos: [c], nombre: null });
    expect(borradorCad(v, { registration: "LVABC", type_acft: "MONT-T" }, lugar0).autoridad).toEqual({ id: "5", nombre: "ANA GÓMEZ" });
    expect(borradorCad({ ...v, cad_autoridad_id: null }, { registration: "LVABC", type_acft: "MONT-T" }, lugar0).autoridad).toBeNull();
  });
});

// La sesión de simulador real de Federico en el CAD (leída el 2026-10-28), como la tiene Vector.
const SIM_ASG = { id: "sim1", registration: "LV-ASG", type_acft: "C172", is_simulator: true, cad_simulador: null };
const SESION: VueloVector = {
  id: "v-sim",
  date: "2026-08-22",
  route: "LOCAL",
  landings: 0,
  duration: 0,
  takeoff: "2026-08-22T11:00:00Z",
  landing: "2026-08-22T12:00:00Z",
  purpose: "INST",
  sim_pil_en_inst: 1.0,
};
const SIMULADORES: ItemCad[] = [
  { key: "34", value: "SANTIAGO I C-172 -- ASG TRAINING CENTER" },
  { key: "39", value: "C172  -- CIAC CICA" },
  { key: "53", value: "SIMAR II -- CIAC FLIGHT CENTER" },
];
const ELEGIDO = { id: 34, nombre: "SANTIAGO I C-172 -- ASG TRAINING CENTER", clase: "ATD", modeloId: 40, modelo: "A320" };

describe("una sesión de simulador", () => {
  it("va como el CAD guarda la real: tipo 3, en instrucción, sin lugares ni matrícula, y el tiempo en la discriminación 9", () => {
    const b = borradorCad(SESION, SIM_ASG, lugar);
    expect(b.problema).toBeNull();
    expect(b).toMatchObject({ tipoVueloID: 3, cargoID: 6, matricula: "", aterrizajes: 0, horasDia: 0, horasNoche: 0, horas: 1, finalidad: "INSTRUCCIÓN" });
    expect(b.discriminaciones).toEqual([{ tipoDiscriminacionID: 9, horas: "1.0" }]);
    expect(b.simulador).toEqual({ avionId: "sim1", equipo: "LV-ASG C172", cad: null });
  });

  it("el instructor de simulador va con cargo 3 y la discriminación 8", () => {
    const b = borradorCad({ ...SESION, purpose: "I", sim_pil_en_inst: 0, sim_instructor: 1.0 }, SIM_ASG, lugar);
    expect(b).toMatchObject({ cargoID: 3, finalidad: "INSTRUCTOR" });
    expect(b.discriminaciones[0].tipoDiscriminacionID).toBe(8);
  });

  it("se revisa si tiene las dos columnas, si le faltan horarios o si las horas no cierran", () => {
    expect(borradorCad({ ...SESION, sim_instructor: 1.0 }, SIM_ASG, lugar).problema).toMatch(/una sola/);
    expect(borradorCad({ ...SESION, takeoff: null }, SIM_ASG, lugar).problema).toMatch(/hora de salida/);
    expect(borradorCad({ ...SESION, sim_pil_en_inst: 1.5 }, SIM_ASG, lugar).problema).toMatch(/1\.5.*1\.0/);
  });

  it("el payload es el de la sesión real, con el simulador elegido", () => {
    const b = borradorCad(SESION, { ...SIM_ASG, cad_simulador: ELEGIDO }, lugar);
    const p = payloadCad(b, { finalidadID: "68", origenID: "", destinoID: "", autoridadID: "19", autoridadNombre: "DANIEL MISA" });
    expect(p).toMatchObject({
      tipoVueloID: "3",
      cargoID: "6",
      clase: "ATD",
      aterrizajes: 0,
      horasDia: 0,
      horasNoche: 0,
      finalidadID: "68",
      autoridadCertificanteID: "19",
      simulador: { simuladorID: "34", nombre: ELEGIDO.nombre, modeloID: "40", modelo: "A320" },
    });
    expect(p).not.toHaveProperty("origenID");
    expect(p).not.toHaveProperty("matriculaAvion");
  });

  it("propone el simulador del CAD por la matrícula y el tipo, sólo si gana uno", () => {
    expect(simuladorSugerido("LV-ASG C172", SIMULADORES)?.key).toBe("34");
    expect(simuladorSugerido("LV-ZZZ", SIMULADORES)).toBeNull();
    // "C172" sola empata entre ASG y CICA: no se adivina.
    expect(simuladorSugerido("C172", SIMULADORES)).toBeNull();
  });

  it("falta elegirlo mientras no tenga simulador y una clase válida", () => {
    const b = borradorCad(SESION, SIM_ASG, lugar);
    expect(faltaSimulador(b)).toBe(true);
    expect(faltaSimulador(b, ELEGIDO)).toBe(false);
    expect(faltaSimulador(b, { ...ELEGIDO, clase: "MONT-T" })).toBe(true);
    expect(faltaSimulador(borradorCad(LUJAN_MORON, ECHO, lugar))).toBe(false);
  });

  it("lo elegido se revisa antes de guardarlo", () => {
    expect(simuladorValido({ ...ELEGIDO, clase: "atd" })).toEqual(ELEGIDO);
    expect(simuladorValido({ ...ELEGIDO, id: "x" })).toBeNull();
    expect(simuladorValido({ ...ELEGIDO, clase: "MONT-T" })).toBeNull();
  });

  it("propone la autoridad de simulador, y la recuerda aparte de la del vuelo", () => {
    const b = borradorCad(SESION, SIM_ASG, lugar);
    const ctx = {
      enElCad: [],
      finalidades: [{ key: "68", value: "INSTRUCCIÓN" }],
      lugares: [],
      autoridades: [{ key: "5", value: "INSTRUCTOR DE VUELO" }, { key: "19", value: "INSTRUCTOR DE SIMULADOR" }],
      corte: null,
      memoria: { porFinalidad: { "INSTRUCCIÓN": { id: "5", nombre: "OTRA PERSONA" } } },
    };
    const f = filaCad(b, ctx);
    expect(f.autoridad).toEqual({ id: "19", nombre: "" });
    expect(f.ids).toEqual({ finalidadID: "68", origenID: "", destinoID: "" });
    expect(claveDeAutoridad(b)).toBe("SIMULADOR INSTRUCCIÓN");
  });

  it("si ya está en el CAD (sin matrícula, a la misma hora), no se manda de nuevo", () => {
    const b = borradorCad(SESION, SIM_ASG, lugar);
    expect(yaEstaEnElCad(b, [{ vueloTripulanteID: 661363, fechaSalida: "2026-08-22T11:00:00", matricula: null }])).toBe(661363);
  });
});

describe("un vuelo desde un LAD", () => {
  const LUGARES: ItemCad[] = [
    { key: "FDO", value: "SADF -  FDO -  FDO (SAN FERNANDO)" },
    { key: "2013", value: " 2013 (VILLA JOSEFINA)" },
  ];
  const ladLugar = (codigo: string): LugarParaCad =>
    codigo === "LAD2013" ? { codigo, candidatos: ["LAD2013", "2013"], nombre: "VILLA JOSEFINA" } : { codigo, candidatos: [codigo, "FDO"], nombre: null };

  it("va al CAD por su número, que es su clave en la lista de aeródromos", () => {
    const b = borradorCad({ ...LUJAN_MORON, route: "LAD2013 SADF" }, ECHO, ladLugar);
    const f = filaCad(b, { enElCad: [], finalidades: [{ key: "63", value: "ENTRENAMIENTO" }], lugares: LUGARES, autoridades: [], corte: null, memoria: null });
    expect(f.problema).toBeNull();
    expect(f.ids).toEqual({ finalidadID: "63", origenID: "2013", destinoID: "FDO" });
  });

  it("y vuelve del CAD como LAD2013", () => {
    expect(codigoDeLugarCad(" 2013 (VILLA JOSEFINA)")).toBe("LAD2013");
    expect(codigoDeLugarCad("SADF -  FDO -  FDO (SAN FERNANDO)")).toBe("SADF");
  });
});

describe("un vuelo que se borró del CAD", () => {
  const marcados = [{ vectorId: "a", cadId: 843265 }, { vectorId: "b", cadId: 831534 }];
  const lista = (...ids: number[]) => ids.map((vueloTripulanteID) => ({ vueloTripulanteID }));

  it("vuelve a la lista si ya no está en el CAD", () => {
    expect(borradosDelCad(marcados, lista(843265, 1))).toEqual([{ vectorId: "b", cadId: 831534 }]);
    expect(borradosDelCad(marcados, lista(843265, 831534))).toEqual([]);
  });

  it("con una lista vacía (pudo fallar la lectura) o llena hasta el tope (puede estar cortada), no se toca nada", () => {
    expect(borradosDelCad(marcados, [])).toEqual([]);
    expect(borradosDelCad(marcados, lista(...Array.from({ length: 1000 }, (_, i) => i + 1)))).toEqual([]);
  });
});

describe("la declaración jurada pendiente", () => {
  it("lee el estado como lo escribe el CAD", () => {
    expect(pendienteDeDdjj("PENDIENTE DE DDJJ")).toBe(true);
    expect(pendienteDeDdjj("DECLARADO")).toBe(false);
    expect(pendienteDeDdjj(null)).toBe(false);
  });
  it("cuenta sólo los que están en el CAD", () => {
    expect(
      cuantosPendientesDeDdjj([
        { cad_vuelo_id: 1, cad_estado: "PENDIENTE DE DDJJ" },
        { cad_vuelo_id: 2, cad_estado: "DECLARADO" },
        { cad_vuelo_id: null, cad_estado: "PENDIENTE DE DDJJ" },
      ])
    ).toBe(1);
  });
});

describe("leidoDelCad", () => {
  const ahora = new Date("2026-10-29T18:30:00Z"); // 15:30 en Argentina
  it("nunca leído", () => {
    expect(leidoDelCad(null, ahora)).toBeNull();
    expect(leidoDelCad("cualquier cosa", ahora)).toBeNull();
  });
  it("hoy, ayer y antes, en hora argentina", () => {
    expect(leidoDelCad("2026-10-29T15:05:00Z", ahora)).toEqual({ cuando: "hoy a las 12:05", viejo: false });
    // 01:30 UTC del 29 son las 22:30 del 28 en Argentina: ayer.
    expect(leidoDelCad("2026-10-29T01:30:00Z", ahora)).toEqual({ cuando: "ayer a las 22:30", viejo: false });
    expect(leidoDelCad("2026-10-26T21:00:00Z", ahora)).toEqual({ cuando: "el 26/10 a las 18:00", viejo: false });
  });
  it("pasados los días, recomienda actualizar", () => {
    expect(leidoDelCad("2026-10-26T18:00:00Z", ahora)?.viejo).toBe(true);
    expect(leidoDelCad("2026-10-26T19:00:00Z", ahora)?.viejo).toBe(false);
  });
});

/**
 * Corregir en el CAD un vuelo que ya está allá (3.18.0 la autoridad; 3.19.0 los demás campos;
 * Federico: "que me ofrezca corregirlo en el CAD desde Vector").
 *
 * **Se hace como lo hace el CAD.** Su formulario de edición (`vuelotripulante.edit.component.js`
 * de `/foliadoweb/`, leído el 2026-11-11 con la sesión de Federico; un `Get` real confirmó los
 * nombres y que las horas vienen sin zona) carga el vuelo con `Get?id=`, lo pasa al formulario y al
 * guardar arma el vuelo entero y lo manda con `PUT /foliadoweb/api/VueloTripulante/Edit`. Acá se
 * arma el mismo cuerpo a partir del mismo `Get` (`cuerpoBase`) y se le pisan **sólo los campos de
 * `CAMPOS_EDITABLES` que manda Vector** (`cuerpoParaEditar`). Todo lo demás vuelve como vino:
 *
 * - Las fechas: el formulario las muestra con el `DatePipe` (la hora "de pared" del texto sin
 *   zona) y al guardar les pone `Z` (`createDateTimeFromFechaHoraString`). Con un texto sin zona
 *   eso es devolver la misma hora en UTC. **Si el CAD trae una fecha con zona, no se edita**: el
 *   formulario la correría a la hora local y no se sabe cuál es la que corresponde.
 * - La discriminación: si no se abre su ventana, el formulario manda la que cargó, tal cual
 *   (`tipoDiscriminacionID` y `horas`).
 * - Vuelo (tipo 1 o 2): cargo, lugares, día y noche y matrícula. Simulador (tipo 3): cargo, el
 *   simulador y 0 aterrizajes. Un vuelo no pasa a simulador ni al revés desde Vector.
 *
 * Si falta algo de lo que el formulario manda, no se arma nada (invariante 2): mejor no editar que
 * mandar un vuelo incompleto a un registro de ANAC.
 *
 * Puro y sin imports: lo compilan la extensión y el marcador.
 */

export interface CuerpoEdicion {
  ok: true;
  cuerpo: Record<string, unknown>;
}

export interface NoSeEdita {
  ok: false;
  motivo: string;
}

/**
 * Lo único que Vector puede pisar de un vuelo del CAD. Nunca el id ni el simulador: lo que no está
 * acá se descarta en la pestaña del CAD, venga lo que venga de Vector.
 */
export const CAMPOS_EDITABLES = [
  "fechaHoraSalida",
  "fechaHoraLlegada",
  "horasDia",
  "horasNoche",
  "Discriminaciones",
  "matriculaAvion",
  "clase",
  "potencia",
  "tipoVueloID",
  "origenID",
  "destinoID",
  "origenPersonalizado",
  "destinoPersonalizado",
  "aterrizajes",
  "finalidadID",
  "cargoID",
  "autoridadCertificanteID",
  "observaciones",
] as const;

const tiene = (v: unknown) => v !== undefined && v !== null;

/** "2026-10-17T18:00:00" (o con fracción) → "2026-10-17T18:00:00.000Z". Con zona, `null`. */
export function fechaComoLaGuardaElCad(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?$/);
  return m ? `${m[1]}T${m[2]}:00.000Z` : null;
}

/** Una hora de Vector (UTC, "…Z" o sin zona) en el formato del formulario del CAD. */
function fechaDeVector(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z?$/);
  return m ? `${m[1]}T${m[2]}:00.000Z` : null;
}

/** El vuelo del `Get` como lo mandaría el formulario del CAD sin tocar nada. */
export function cuerpoBase(detalle: Record<string, unknown>): CuerpoEdicion | NoSeEdita {
  const d = detalle;
  if (!tiene(d.vueloTripulanteID)) return { ok: false, motivo: "El CAD no devolvió el vuelo." };

  const salida = fechaComoLaGuardaElCad(d.fechaHoraSalida);
  const llegada = fechaComoLaGuardaElCad(d.fechaHoraLlegada);
  if (!salida || !llegada) return { ok: false, motivo: "El CAD devolvió las horas en un formato que Vector no reconoce: corregilo desde el CAD." };

  for (const k of ["tipoVueloID", "finalidadID", "clase", "cargoID"] as const)
    if (!tiene(d[k])) return { ok: false, motivo: `Al vuelo del CAD le falta ${k}: corregilo desde el CAD.` };

  const cuerpo: Record<string, unknown> = {
    vueloTripulanteID: d.vueloTripulanteID,
    fechaHoraSalida: salida,
    fechaHoraLlegada: llegada,
    tipoVueloID: d.tipoVueloID,
    aterrizajes: d.aterrizajes ?? 0,
    autoridadCertificanteID: d.autoridadCertificanteID ?? null,
    observaciones: d.observaciones ?? null,
    finalidadID: d.finalidadID,
    potencia: d.potencia ?? null,
    clase: d.clase,
  };

  const tipo = String(d.tipoVueloID);
  if (tipo === "1" || tipo === "2") {
    for (const k of ["origenID", "destinoID", "horasDia", "horasNoche", "matriculaAvion"] as const)
      if (!tiene(d[k])) return { ok: false, motivo: `Al vuelo del CAD le falta ${k}: corregilo desde el CAD.` };
    Object.assign(cuerpo, {
      cargoID: d.cargoID,
      origenID: d.origenID,
      destinoID: d.destinoID,
      // Como vienen (el CAD real manda `null`): el formulario los devuelve sin tocarlos.
      origenPersonalizado: d.origenPersonalizado ?? null,
      destinoPersonalizado: d.destinoPersonalizado ?? null,
      horasDia: d.horasDia,
      horasNoche: d.horasNoche,
      matriculaAvion: d.matriculaAvion,
    });
  } else if (tipo === "3") {
    const s = d.simulador as Record<string, unknown> | null | undefined;
    if (!s || !tiene(s.simuladorID) || !tiene(s.modeloID)) return { ok: false, motivo: "Al simulador del CAD le faltan datos: corregilo desde el CAD." };
    Object.assign(cuerpo, {
      cargoID: d.cargoID,
      aterrizajes: 0,
      simulador: { simuladorID: s.simuladorID, nombre: s.nombre ?? "", modeloID: s.modeloID, modelo: s.modelo ?? "" },
    });
  } else {
    return { ok: false, motivo: "Ese tipo de vuelo no se edita desde Vector: corregilo desde el CAD." };
  }

  const discriminaciones = Array.isArray(d.discriminaciones) ? d.discriminaciones : Array.isArray(d.Discriminaciones) ? d.Discriminaciones : [];
  cuerpo.Discriminaciones = (discriminaciones as Record<string, unknown>[])
    .filter((x) => x && tiene(x.tipoDiscriminacionID))
    .map((x) => ({ tipoDiscriminacionID: x.tipoDiscriminacionID, horas: x.horas }));

  return { ok: true, cuerpo };
}

/** El vuelo del `Get` con los campos que manda Vector pisados (sólo los de `CAMPOS_EDITABLES`). */
export function cuerpoParaEditar(detalle: Record<string, unknown>, cambios: Record<string, unknown>): CuerpoEdicion | NoSeEdita {
  const base = cuerpoBase(detalle);
  if (!base.ok) return base;
  const permitidos = Object.entries(cambios ?? {}).filter(([k]) => (CAMPOS_EDITABLES as readonly string[]).includes(k));
  if (!permitidos.length) return { ok: false, motivo: "No hay nada para cambiar." };
  const cuerpo = { ...base.cuerpo };
  for (const [k, v] of permitidos) {
    if (k === "fechaHoraSalida" || k === "fechaHoraLlegada") {
      const f = fechaDeVector(v);
      if (!f) return { ok: false, motivo: "La hora de Vector no tiene la forma esperada." };
      cuerpo[k] = f;
    } else if (k === "Discriminaciones") {
      if (!Array.isArray(v)) return { ok: false, motivo: "La discriminación de Vector no tiene la forma esperada." };
      cuerpo[k] = (v as Record<string, unknown>[])
        .filter((x) => x && tiene(x.tipoDiscriminacionID))
        .map((x) => ({ tipoDiscriminacionID: x.tipoDiscriminacionID, horas: x.horas }));
    } else if (k === "observaciones") {
      const n = typeof v === "string" ? v.trim().replace(/\s+/g, " ").toUpperCase() : "";
      if (!n) return { ok: false, motivo: "Falta el nombre de la autoridad." };
      cuerpo[k] = n;
    } else cuerpo[k] = v;
  }
  // Un vuelo no pasa a ser simulador, ni al revés, desde Vector: cambia todo lo que el CAD pide.
  const antes = String(base.cuerpo.tipoVueloID) === "3";
  const despues = String(cuerpo.tipoVueloID) === "3";
  if (antes !== despues) return { ok: false, motivo: "Pasar de vuelo a simulador (o al revés) se hace desde el CAD." };
  if (despues) for (const k of ["origenID", "destinoID", "matriculaAvion", "origenPersonalizado", "destinoPersonalizado"]) delete cuerpo[k];
  return { ok: true, cuerpo };
}

/** Sólo la autoridad y su nombre (3.18.0; la extensión 1.2.0 sólo sabe esto). */
export function cuerpoParaCambiarAutoridad(detalle: Record<string, unknown>, autoridadId: string, nombre: string): CuerpoEdicion | NoSeEdita {
  if (!/^\d+$/.test(autoridadId) || !nombre.trim()) return { ok: false, motivo: "Falta la autoridad o su nombre." };
  return cuerpoParaEditar(detalle, { autoridadCertificanteID: autoridadId, observaciones: nombre });
}

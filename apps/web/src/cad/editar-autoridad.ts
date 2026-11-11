/**
 * Cambiar la autoridad certificante de un vuelo que ya está en el CAD (3.18.0, Federico: "que me
 * ofrezca corregirlo en el CAD desde Vector").
 *
 * **Se hace como lo hace el CAD.** Su formulario de edición (`vuelotripulante.edit.component.js`
 * de `/foliadoweb/`, leído el 2026-11-11 con la sesión de Federico; un `Get` real confirmó los
 * nombres y que las horas vienen sin zona) carga el vuelo con `Get?id=`,
 * lo pasa al formulario y al guardar arma el vuelo entero y lo manda con `PUT
 * /foliadoweb/api/VueloTripulante/Edit`. Acá se arma el mismo cuerpo a partir del mismo `Get`,
 * **cambiando sólo la autoridad (`autoridadCertificanteID`) y su nombre (`observaciones`)**; todo
 * lo demás vuelve como vino:
 *
 * - Las fechas: el formulario las muestra con el `DatePipe` (la hora "de pared" del texto sin
 *   zona) y al guardar les pone `Z` (`createDateTimeFromFechaHoraString`). Con un texto sin zona
 *   eso es devolver la misma hora en UTC. **Si el CAD trae una fecha con zona, no se edita**: el
 *   formulario la correría a la hora local y no se sabe cuál es la que corresponde.
 * - La discriminación: si no se abre su ventana, el formulario manda la que cargó, tal cual
 *   (`tipoDiscriminacionID` y `horas`).
 * - Vuelo (tipo 1 o 2): cargo, lugares, día y noche y matrícula. Simulador (tipo 3): cargo, el
 *   simulador y 0 aterrizajes.
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

const tiene = (v: unknown) => v !== undefined && v !== null;

/** "2026-10-17T18:00:00" (o con fracción) → "2026-10-17T18:00:00.000Z". Con zona, `null`. */
export function fechaComoLaGuardaElCad(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?$/);
  return m ? `${m[1]}T${m[2]}:00.000Z` : null;
}

export function cuerpoParaCambiarAutoridad(detalle: Record<string, unknown>, autoridadId: string, nombre: string): CuerpoEdicion | NoSeEdita {
  const d = detalle;
  const nuevoNombre = nombre.trim().replace(/\s+/g, " ").toUpperCase();
  if (!/^\d+$/.test(autoridadId) || !nuevoNombre) return { ok: false, motivo: "Falta la autoridad o su nombre." };
  if (!tiene(d.vueloTripulanteID)) return { ok: false, motivo: "El CAD no devolvió el vuelo." };

  const salida = fechaComoLaGuardaElCad(d.fechaHoraSalida);
  const llegada = fechaComoLaGuardaElCad(d.fechaHoraLlegada);
  if (!salida || !llegada) return { ok: false, motivo: "El CAD devolvió las horas en un formato que Vector no reconoce: cambiala desde el CAD." };

  const tipo = String(d.tipoVueloID ?? "");
  const comunes = ["tipoVueloID", "finalidadID", "clase", "cargoID"] as const;
  for (const k of comunes) if (!tiene(d[k])) return { ok: false, motivo: `Al vuelo del CAD le falta ${k}: cambiala desde el CAD.` };

  const cuerpo: Record<string, unknown> = {
    vueloTripulanteID: d.vueloTripulanteID,
    fechaHoraSalida: salida,
    fechaHoraLlegada: llegada,
    tipoVueloID: d.tipoVueloID,
    aterrizajes: d.aterrizajes ?? 0,
    autoridadCertificanteID: autoridadId,
    observaciones: nuevoNombre,
    finalidadID: d.finalidadID,
    potencia: d.potencia ?? null,
    clase: d.clase,
  };

  if (tipo === "1" || tipo === "2") {
    for (const k of ["origenID", "destinoID", "horasDia", "horasNoche", "matriculaAvion"] as const)
      if (!tiene(d[k])) return { ok: false, motivo: `Al vuelo del CAD le falta ${k}: cambiala desde el CAD.` };
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
    if (!s || !tiene(s.simuladorID) || !tiene(s.modeloID)) return { ok: false, motivo: "Al simulador del CAD le faltan datos: cambiala desde el CAD." };
    Object.assign(cuerpo, {
      cargoID: d.cargoID,
      aterrizajes: 0,
      simulador: { simuladorID: s.simuladorID, nombre: s.nombre ?? "", modeloID: s.modeloID, modelo: s.modelo ?? "" },
    });
  } else {
    return { ok: false, motivo: "Ese tipo de vuelo no se edita desde Vector: cambiala desde el CAD." };
  }

  const discriminaciones = Array.isArray(d.discriminaciones) ? d.discriminaciones : Array.isArray(d.Discriminaciones) ? d.Discriminaciones : [];
  cuerpo.Discriminaciones = (discriminaciones as Record<string, unknown>[])
    .filter((x) => x && tiene(x.tipoDiscriminacionID))
    .map((x) => ({ tipoDiscriminacionID: x.tipoDiscriminacionID, horas: x.horas }));

  return { ok: true, cuerpo };
}

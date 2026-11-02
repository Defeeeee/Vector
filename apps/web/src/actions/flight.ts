"use server";

import { horariosDelVuelo } from "@/lib/horarios";
import { autoridadDelFormulario } from "@/lib/cad";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { esErrorDeRedirect } from "@/lib/redirect-error";

function getNumber(val: any): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/**
 * Las pantallas que un vuelo nuevo, editado o borrado también cambia.
 *
 * Compartida por `logFlight`, `updateFlight`, `deleteFlight` y `bulkLogFlights`
 * porque las cuatro tocan la misma bitácora y hasta ahora cada una revalidaba un
 * subconjunto distinto —ninguna incluía resumen, balance, aeródromos, auditoría
 * ni ajustes—, así que un vuelo cargado podía verse en Historial y seguir
 * faltando en el promedio mensual de Resumen hasta que algo más revalidara esa
 * ruta. Mismo patrón que `revalidateEverythingThatCounts` en `logbook.ts` y
 * `revalidarProgramados` en `planned-flight.ts`.
 */
function revalidarLoQueCambiaUnVuelo() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/history");
  revalidatePath("/dashboard/summary");
  revalidatePath("/dashboard/balance");
  revalidatePath("/dashboard/airports");
  revalidatePath("/dashboard/audit");
  revalidatePath("/dashboard/settings");
  // El plan que se acaba de cerrar tiene que desaparecer del calendario sin que
  // el piloto refresque a mano.
  revalidatePath("/dashboard/calendario");
}

export async function logFlight(
  formData: FormData
): Promise<{ error: string } | { success: true; id: string | null }> {
  const aircraft_id = formData.get("aircraft_id") as string;
  // Optional: the picker only renders with more than one logbook, and the
  // backend files the flight in the pilot's default when this is absent.
  const logbook_id = (formData.get("logbook_id") as string) || undefined;
  const remarks = ((formData.get("remarks") as string) || "").trim() || undefined;
  const date = formData.get("date") as string;
  const rawRoute = formData.get("route") as string;
  const landings = parseInt(formData.get("landings") as string, 10);
  const duration = parseFloat(formData.get("duration") as string);
  const takeoff_time = formData.get("takeoff") as string;
  const landing_time = formData.get("landing") as string;

  let route = rawRoute.trim();
  if (route.includes('-')) {
    route = route.replace(/\s+/g, '');
  }

  const { takeoff_dt, landing_dt } = horariosDelVuelo(date, takeoff_time, landing_time);

  // Server-side validation
  const total = Number(duration);
  const sumLogs = [
    formData.get("pic_day_loc"), formData.get("pic_day_tra"), formData.get("pic_night_loc"), formData.get("pic_night_tra"),
    formData.get("sic_day_loc"), formData.get("sic_day_tra"), formData.get("sic_night_loc"), formData.get("sic_night_tra")
  ].reduce((acc, val) => acc + (parseFloat(val as string) || 0), 0);

  if (sumLogs > total + 0.01) {
    return {
      error: `La suma de tiempos PIC/SIC (${sumLogs.toFixed(1)}h) no puede superar el total (${total.toFixed(1)}h)`,
    };
  }

  const payload = {
    aircraft_id,
    logbook_id,
    remarks,
    date,
    route,
    landings: Number(landings),
    duration: Number(duration),
    takeoff: takeoff_dt,
    landing: landing_dt,
    pic_day_loc: getNumber(formData.get("pic_day_loc")),
    pic_day_tra: getNumber(formData.get("pic_day_tra")),
    pic_night_loc: getNumber(formData.get("pic_night_loc")),
    pic_night_tra: getNumber(formData.get("pic_night_tra")),
    sic_day_loc: getNumber(formData.get("sic_day_loc")),
    sic_day_tra: getNumber(formData.get("sic_day_tra")),
    sic_night_loc: getNumber(formData.get("sic_night_loc")),
    sic_night_tra: getNumber(formData.get("sic_night_tra")),
    "IMC Pil": getNumber(formData.get("imc_pil")),
    "IMC Cop": getNumber(formData.get("imc_cop")),
    "Capota": getNumber(formData.get("capota")),
    "Sim Instructor": getNumber(formData.get("sim_instructor")),
    "Sim Pil en Inst": getNumber(formData.get("sim_pil_en_inst")),
    discount_type: (formData.get("discount_type") as string) || null,
    discount_amount: getNumber(formData.get("discount_amount")),
    purpose: (formData.get("purpose") as string) || "VP",
    // "Cerrar la hoja después de este vuelo": el último renglón de su hoja en el libro.
    cierra_hoja: formData.get("cierra_hoja") === "true",
    // Quién certifica el vuelo en el CAD, si la cargó (migración 032; `lib/cad.ts`).
    ...autoridadDelFormulario(formData.get("cad_autoridad_id"), formData.get("cad_autoridad_nombre")),
  };

  const response = await apiFetch("/flights", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { error: error.detail || "No se pudo registrar el vuelo" };
  }

  // El vuelo creado, con su id. La respuesta se descartaba, pero cerrar un vuelo
  // programado necesita saber **con qué vuelo** se cerró.
  const creado = await response.json().catch(() => null);

  // Si esta carga vino de "Completar" en la tarjeta de vuelos programados, se marca
  // el plan. `planned_id` viaja como hidden input desde `FlightLogForm`.
  //
  // **Best-effort, y a propósito.** El vuelo ya está guardado, que es lo único que
  // importa: es el registro legal. Si el PATCH falla, el plan queda en `programado`
  // y la tarjeta vuelve a preguntar — un recordatorio duplicado, molesto y visible.
  // Revertir el vuelo para mantener limpio un recordatorio sería perder una entrada
  // de bitácora por un post-it. Es la misma dirección de falla que el marcado de
  // los avisos de vencimiento: el peor caso es repetir, nunca callar.
  const plannedId = (formData.get("planned_id") as string) || "";
  if (plannedId) {
    try {
      await apiFetch(`/planned-flights/${plannedId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completado", flight_id: creado?.id ?? null }),
      });
    } catch (err) {
      console.error("No se pudo cerrar el vuelo programado", plannedId, err);
    }
  }

  // Si se registró desde un plan de vuelo (el "¿ya volaste?" del inicio), se une el plan
  // al vuelo y el inicio deja de preguntar. Best-effort, como el vuelo programado de arriba:
  // si falla, el peor caso es que pregunte de nuevo.
  const planVueloId = (formData.get("plan_vuelo_id") as string) || "";
  if (planVueloId && creado?.id) {
    try {
      await apiFetch(`/planes-de-vuelo/${planVueloId}`, {
        method: "PATCH",
        body: JSON.stringify({ vuelo_id: creado.id }),
      });
      revalidatePath("/dashboard/plan-de-vuelo");
    } catch (err) {
      console.error("No se pudo unir el plan de vuelo al vuelo", planVueloId, err);
    }
  }

  /*
    **Ya no hay `redirect()` acá, y no es un detalle menor.** Next 16 rechaza la
    promesa de una server action que redirige —a propósito, para que la maneje el
    `RedirectBoundary`— y `FlightLogForm` esperaba una promesa que resuelve: el
    `catch` atrapaba ese rechazo y pintaba un cartel de error con el texto
    `NEXT_REDIRECT`, en **cada** carga exitosa. El piloto que reportó "no obtengo
    confirmación que se cargó el vuelo" estaba viendo exactamente eso: no faltaba
    la confirmación, sobraba un error falso en su lugar.

    Devolver `{ success }` es la misma convención que `updateFlight`,
    `deleteFlight` y el resto de las acciones de este archivo — y la que
    `FlightLogForm` puede manejar sin que la promesa se rechace nunca.
  */
  revalidarLoQueCambiaUnVuelo();
  return { success: true, id: creado?.id ?? null };
}

/**
 * "Cerrar la hoja" en un vuelo ya cargado: pasa a ser el último renglón de su hoja en
 * el libro de papel, y en el PDF lo que queda en blanco se tacha (`lib/libro-anac.ts`).
 *
 * Manda sólo la marca: el backend la guarda sin recalcular el cobro del vuelo, que con
 * el precio por hora de hoy reescribiría lo que se cobró ese día.
 */
export async function marcarCierreDeHoja(id: string, cierra: boolean) {
  try {
    const response = await apiFetch(`/flights/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ cierra_hoja: cierra }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.detail || "No se pudo marcar la hoja." };
    }
    revalidatePath("/dashboard/history");
    return { success: true };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor" };
  }
}

export async function updateFlight(formData: FormData) {
  const id = formData.get("id") as string;
  const aircraft_id = formData.get("aircraft_id") as string;
  // Optional: the picker only renders with more than one logbook, and the
  // backend files the flight in the pilot's default when this is absent.
  const logbook_id = (formData.get("logbook_id") as string) || undefined;
  const remarks = ((formData.get("remarks") as string) || "").trim() || undefined;
  const date = formData.get("date") as string;
  const rawRoute = formData.get("route") as string;
  const landings = parseInt(formData.get("landings") as string, 10);
  const duration = parseFloat(formData.get("duration") as string);
  const takeoff_time = formData.get("takeoff") as string;
  const landing_time = formData.get("landing") as string;

  if (!id) return { error: "ID de vuelo no encontrado" };

  if (!takeoff_time || !landing_time) {
    return { error: "Las horas de despegue y aterrizaje son obligatorias" };
  }

  let route = rawRoute.trim();
  if (route.includes('-')) {
    route = route.replace(/\s+/g, '');
  }

  const { takeoff_dt, landing_dt } = horariosDelVuelo(date, takeoff_time, landing_time);

  // Server-side validation
  const total = Number(duration);
  const sumLogs = [
    formData.get("pic_day_loc"), formData.get("pic_day_tra"), formData.get("pic_night_loc"), formData.get("pic_night_tra"),
    formData.get("sic_day_loc"), formData.get("sic_day_tra"), formData.get("sic_night_loc"), formData.get("sic_night_tra")
  ].reduce((acc, val) => acc + (parseFloat(val as string) || 0), 0);

  if (sumLogs > total + 0.01) {
    return { error: `La suma de tiempos PIC/SIC (${sumLogs.toFixed(1)}h) no puede superar el total (${total.toFixed(1)}h)` };
  }

  const payload = {
    remarks,
    aircraft_id: String(aircraft_id),
    date: String(date),
    route: String(route),
    landings: Number(landings),
    duration: Number(duration),
    takeoff: takeoff_dt,
    landing: landing_dt,
    pic_day_loc: getNumber(formData.get("pic_day_loc")),
    pic_day_tra: getNumber(formData.get("pic_day_tra")),
    pic_night_loc: getNumber(formData.get("pic_night_loc")),
    pic_night_tra: getNumber(formData.get("pic_night_tra")),
    sic_day_loc: getNumber(formData.get("sic_day_loc")),
    sic_day_tra: getNumber(formData.get("sic_day_tra")),
    sic_night_loc: getNumber(formData.get("sic_night_loc")),
    sic_night_tra: getNumber(formData.get("sic_night_tra")),
    "IMC Pil": getNumber(formData.get("imc_pil")),
    "IMC Cop": getNumber(formData.get("imc_cop")),
    "Capota": getNumber(formData.get("capota")),
    "Sim Instructor": getNumber(formData.get("sim_instructor")),
    "Sim Pil en Inst": getNumber(formData.get("sim_pil_en_inst")),
    discount_type: (formData.get("discount_type") as string) || null,
    discount_amount: getNumber(formData.get("discount_amount")),
    purpose: (formData.get("purpose") as string) || undefined,
    // Sólo si el formulario la trae: un PATCH sin estos campos no la toca (migración 032).
    ...(formData.has("cad_autoridad_id") ? autoridadDelFormulario(formData.get("cad_autoridad_id"), formData.get("cad_autoridad_nombre")) : {}),
  };

  try {
    const response = await apiFetch(`/flights/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.detail || "Error de validación en el servidor" };
    }

    revalidarLoQueCambiaUnVuelo();
    return { success: true };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor" };
  }
}

export async function deleteFlight(id: string) {
  try {
    const response = await apiFetch(`/flights/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.detail || "Error al eliminar el vuelo" };
    }

    revalidarLoQueCambiaUnVuelo();
    return { success: true };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor" };
  }
}

/**
 * Un número positivo del formulario, o `null`.
 *
 * `null` y no cero por dos motivos que apuntan al mismo lado: la base tiene un CHECK
 * de `> 0` que un cero rompería, y semánticamente **vacío significa "no lo sé"**, que
 * es distinto de "vale cero". Acepta coma decimal porque acá se escribe 31,5.
 */
function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim().replace(",", ".");
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** La potencia en HP: un entero en la base (`aircraft.potencia_hp`, migración 020). */
function potenciaOpcional(valor: FormDataEntryValue | null): number | null {
  const n = numeroOpcional(valor);
  return n === null ? null : Math.round(n);
}

/**
 * La casilla "es un simulador", leída del par hidden + checkbox de `CampoSimulador`.
 *
 * `getAll` y no `get`: el campo llega dos veces cuando está tildado y el primero es
 * siempre el `"false"` del hidden, que existe para que desmarcar la casilla llegue
 * como un `false` explícito en vez de como un campo ausente.
 */
function marcadoComoSimulador(formData: FormData): boolean {
  return formData.getAll("is_simulator").includes("true");
}

export async function addAircraft(formData: FormData) {
  const registration = formData.get("registration") as string;
  const icao = formData.get("icao") as string;
  const type = formData.get("type") as string;
  const type_acft = formData.get("type_acft") as string;

  const response = await apiFetch("/aircraft", {
    method: "POST",
    body: JSON.stringify({
      registration, icao, type, type_acft,
      is_simulator: marcadoComoSimulador(formData),
      cruise_tas_kt: numeroOpcional(formData.get("cruise_tas_kt")),
      fuel_burn_lph: numeroOpcional(formData.get("fuel_burn_lph")),
      fuel_capacity_l: numeroOpcional(formData.get("fuel_capacity_l")),
      potencia_hp: potenciaOpcional(formData.get("potencia_hp")),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to add aircraft");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  // Nuevo Vuelo también depende de esta lista: sin aeronaves muestra `SinAeronaves`,
  // y el alta se hace **desde ahí**. Sin esta línea, los GET cacheados 20s
  // (`api.ts`) dejan la pantalla que pide cargar una aeronave en su lugar después
  // de haberla cargado — sin ningún error, que es el peor modo de falla.
  revalidatePath("/dashboard/log-flight");
}

export async function updateAircraft(formData: FormData) {
  const id = formData.get("id") as string;
  const registration = formData.get("registration") as string;
  const icao = formData.get("icao") as string;
  const type = formData.get("type") as string;
  const type_acft = formData.get("type_acft") as string;

  if (!id) return { error: "ID de aeronave no encontrado" };

  try {
    const response = await apiFetch(`/aircraft/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        registration, icao, type, type_acft,
        is_simulator: marcadoComoSimulador(formData),
        cruise_tas_kt: numeroOpcional(formData.get("cruise_tas_kt")),
        fuel_burn_lph: numeroOpcional(formData.get("fuel_burn_lph")),
        fuel_capacity_l: numeroOpcional(formData.get("fuel_capacity_l")),
        potencia_hp: potenciaOpcional(formData.get("potencia_hp")),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.detail || "Error al actualizar aeronave" };
    }

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor" };
  }
}

export async function deleteAircraft(id: string) {
  try {
    const response = await apiFetch(`/aircraft/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { error: error.detail || "No se puede eliminar: la aeronave podría tener vuelos asociados" };
    }

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e: any) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor" };
  }
}

export async function toggleFlightSession(formData: FormData) {
  const aircraft_id = formData.get("aircraft_id") as string;
  const route = formData.get("route") as string;
  const landings = parseInt(formData.get("landings") as string, 10) || 0;

  const body = aircraft_id ? JSON.stringify({ aircraft_id, route, landings }) : undefined;

  const response = await apiFetch("/flight-helper/session", {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to toggle session");
  }

  const data = await response.json();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/history");
  return data;
}

export async function bulkLogFlights(flights: any[]) {
  try {
    for (const f of flights) {
      const aircraft_id = f.aircraft_id;
      const date = f.date;
      const rawRoute = f.route || "";
      const landings = parseInt(f.landings, 10) || 1;
      const duration = parseFloat(f.duration) || 0;
      const takeoff_time = f.takeoff;
      const landing_time = f.landing;

      if (!aircraft_id || !date || !takeoff_time || !landing_time) {
        throw new Error("Datos incompletos para uno de los vuelos. Matrícula, fecha, despegue y aterrizaje son requeridos.");
      }

      let route = rawRoute.trim();
      if (route.includes('-')) {
        route = route.replace(/\s+/g, '');
      }

      const { takeoff_dt, landing_dt } = horariosDelVuelo(date, takeoff_time, landing_time);

      const payload = {
        aircraft_id,
        date,
        route,
        landings,
        duration,
        takeoff: takeoff_dt,
        landing: landing_dt,
        pic_day_loc: getNumber(f.pic_day_loc),
        pic_day_tra: getNumber(f.pic_day_tra),
        pic_night_loc: getNumber(f.pic_night_loc),
        pic_night_tra: getNumber(f.pic_night_tra),
        sic_day_loc: getNumber(f.sic_day_loc),
        sic_day_tra: getNumber(f.sic_day_tra),
        sic_night_loc: getNumber(f.sic_night_loc),
        sic_night_tra: getNumber(f.sic_night_tra),
        "IMC Pil": getNumber(f.imc_pil),
        "IMC Cop": getNumber(f.imc_cop),
        "Capota": getNumber(f.capota),
        "Sim Instructor": getNumber(f.sim_instructor),
        "Sim Pil en Inst": getNumber(f.sim_pil_en_inst),
        discount_type: f.discount_type || null,
        discount_amount: getNumber(f.discount_amount),
        purpose: f.purpose || "VP",
      };

      const response = await apiFetch("/flights", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Error al registrar vuelo del ${date} (${route})`);
      }
    }

    revalidarLoQueCambiaUnVuelo();
    return { success: true };
  } catch (err: any) {
    console.error("bulkLogFlights error:", err);
    return { error: err.message || "Error al registrar los vuelos" };
  }
}


import { Flight, PilotDocument } from "@/types";
import { documentStatus } from "@/lib/utils";
import { ClassRecency } from "@/lib/recency";

/**
 * ¿Se pueden ejercer las atribuciones de la licencia hoy?
 *
 * No es una pregunta que haya que inventar: la RAAC 61 la define. **61.060(a)(1)**
 * dice que las atribuciones sólo se ejercen cuando se cumplen, a la vez:
 *
 *   (i)   certificación médica aeronáutica vigente (RAAC 67)
 *   (ii)  habilitaciones válidas
 *   (iii) experiencia reciente (61.140)
 *   (iv)  repaso de vuelo (61.135)
 *
 * Vector ya tenía tres de las cuatro repartidas en pantallas distintas y ninguna
 * que las juntara. Esto las junta.
 *
 * A las cuatro condiciones de la norma se suman las que el piloto declare: un
 * documento puede marcarse como bloqueante de vuelo o sólo de pasajeros. Una cuota
 * de aeroclub no está en la RAAC, pero si el piloto dice que sin eso no vuela,
 * no vuela.
 *
 * **La respuesta no es sí/no.** La norma define estados con salidas distintas: a
 * quien se le venció la experiencia reciente puede volar **solo** a recuperarla
 * (61.140(c)(2)(i)); a quien se le venció el repaso, no. Devolver un booleano
 * perdería justo lo que el piloto necesita saber.
 */

export type EstadoPiloto =
  | "vigente"
  | "sin_recencia"
  | "repaso_vencido"
  | "documento_vencido"
  | "documento_faltante"
  /** No llegaron los documentos. No es un estado del piloto: es uno nuestro. */
  | "datos_no_disponibles"
  | "inactividad_prolongada";

export interface PilotStatus {
  estado: EstadoPiloto;
  /** Qué puede hacer hoy, en una línea. */
  puede: string;
  /** Qué tiene que hacer para volver, si algo falta. */
  paraVolver?: string;
  /** Sección de la RAAC que lo dice, para que sea verificable. */
  seccion: string;
  /** Detalle de qué disparó el estado (nombre del documento, clase, etc.). */
  detalle?: string;
}

/** 61.060(a)(2) — más de 24 meses sin actividad de vuelo. */
export const INACTIVIDAD_MESES = 24;

const mesesDesde = (iso: string, hoy: Date): number => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return (hoy.getUTCFullYear() - d.getUTCFullYear()) * 12 + (hoy.getUTCMonth() - d.getUTCMonth());
};

/**
 * Los tipos de documento que bloquean el ejercicio de las atribuciones.
 *
 * `seguro` y `aeronavegabilidad` no entran: son de la aeronave, no del piloto, y
 * 61.060(a)(1) habla de la licencia. Vencidos son un problema, pero no de esta
 * pregunta.
 */
const BLOQUEANTES: Record<string, { etiqueta: string; seccion: string }> = {
  cma: { etiqueta: "certificado médico", seccion: "61.060(a)(1)(i)" },
  licencia: { etiqueta: "licencia", seccion: "61.060(a)(1)(ii)" },
  habilitacion: { etiqueta: "habilitación", seccion: "61.060(a)(1)(ii)" },
};

/**
 * Evalúa el estado, del más grave al más leve.
 *
 * El orden importa: si alguien lleva tres años sin volar **y** tiene el CMA
 * vencido, lo que necesita saber es que perdió las atribuciones y necesita examen
 * de pericia, no que le falta un trámite médico.
 */
export function pilotStatus(
  documentos: PilotDocument[],
  recencias: ClassRecency[],
  flights: Flight[],
  hoy = new Date(),
  /**
   * `false` cuando la consulta de documentos falló y `documentos` llegó vacía
   * **porque no se pudo preguntar**, no porque no haya.
   *
   * Sin esto la lista vacía es ambigua y esta función resuelve la ambigüedad de
   * la peor manera posible: afirmando. Un piloto con el CMA cargado veía "no
   * tenés un certificado médico cargado" cada tanto al entrar, hasta que pasaba
   * por el Hangar —otra pantalla, otra consulta— y ahí sí aparecía.
   */
  documentosDisponibles = true,
  /** Un alumno piloto se evalúa con su propio capítulo de la RAAC: ver `estadoAlumno`. */
  { alumno = false }: { alumno?: boolean } = {}
): PilotStatus {
  if (alumno) return estadoAlumno(documentos, hoy, documentosDisponibles);

  // 61.060(a)(2) — el peor estado, y el más fácil de detectar.
  const ultimo = flights.reduce<string | null>(
    (acc, f) => (!acc || f.date > acc ? f.date : acc), null
  );
  if (ultimo && mesesDesde(ultimo, hoy) > INACTIVIDAD_MESES) {
    return {
      estado: "inactividad_prolongada",
      puede: "No podés ejercer las atribuciones de tu licencia.",
      paraVolver:
        "Más de 24 meses sin volar: hace falta certificación médica vigente, " +
        "reentrenamiento con instructor y aprobar un examen de pericia ante la ANAC.",
      seccion: "61.060(a)(2)",
      detalle: `Tu último vuelo registrado es del ${ultimo.slice(0, 10)}.`,
    };
  }

  // Si no llegaron los documentos, todo lo que sigue es sobre documentos y no
  // hay nada honesto que decir. Va después de la inactividad porque esa se
  // deriva de los vuelos, que sí llegaron, y es más grave.
  //
  // **Callarse no es una opción**: sin este corte, la lista vacía cae en el
  // `!cma` de abajo y sale como "no tenés un certificado médico cargado", que es
  // una afirmación sobre el piloto sacada de una falla nuestra.
  if (!documentosDisponibles) {
    return {
      estado: "datos_no_disponibles",
      puede: "No podemos confirmar que puedas volar.",
      paraVolver: "Probá recargar la página en un momento.",
      seccion: "61.060(a)(1)",
      detalle:
        "No pudimos leer tus documentos. Es una falla nuestra, no algo que te " +
        "falte: lo que tengas cargado sigue ahí.",
    };
  }

  // 61.060(a)(1)(i) y (ii) — sin esto no se ejerce nada, ni siquiera volar solo.
  const vencido = documentos.find(
    (d) => BLOQUEANTES[d.kind] && documentStatus(d.expiry_date, hoy).tone === "expired"
  );
  if (vencido) {
    const info = BLOQUEANTES[vencido.kind];
    return {
      estado: "documento_vencido",
      puede: "No podés ejercer las atribuciones de tu licencia.",
      paraVolver: `Renová tu ${info.etiqueta} antes de volar.`,
      seccion: info.seccion,
      detalle: `${vencido.name} — ${documentStatus(vencido.expiry_date, hoy).label.toLowerCase()}.`,
    };
  }

  // Documentos que el piloto marcó como bloqueantes de vuelo. Van acá, entre las
  // condiciones de la norma y el repaso: no son RAAC —una cuota del aeroclub no
  // está en la 61— pero si el piloto dice que sin eso no vuela, no vuela.
  const bloqueaVuelo = documentos.find(
    (d) => d.blocking === "vuelo" && documentStatus(d.expiry_date, hoy).tone === "expired"
  );
  if (bloqueaVuelo) {
    return {
      estado: "documento_vencido",
      puede: "No podés volar.",
      paraVolver: `Renová ${bloqueaVuelo.name} antes de volar.`,
      seccion: "requisito propio",
      detalle: `${bloqueaVuelo.name} — ${documentStatus(bloqueaVuelo.expiry_date, hoy).label.toLowerCase()}. Lo marcaste como bloqueante.`,
    };
  }

  // 61.060(a)(1)(i) — el CMA que **no está cargado**.
  //
  // Sin esto la función devolvía `vigente` a un piloto cuyo estado médico no
  // conocemos: el `find` de arriba sólo matchea documentos vencidos, y uno que no
  // existe no entra. Afirmar que puede volar es justo lo que no hay que hacer.
  //
  // Es la misma forma que ya tiene el repaso unas líneas más abajo (`!repaso`),
  // aplicada a la condición que la norma nombra primero.
  //
  // **Sólo el CMA, a propósito.** `licencia` y `habilitacion` también están en
  // BLOQUEANTES, pero ningún piloto los tiene cargados como documento —el tipo de
  // licencia vive en `profiles.license_type`— así que exigirlos dispararía este
  // estado para todos y no significaría nada. El CMA sí se pide en el alta, y
  // desde el wizard de onboarding se puede saltear: ese es el hueco real.
  const cma = documentos.find((d) => d.kind === "cma");
  if (!cma) {
    return {
      estado: "documento_faltante",
      puede: "No podemos confirmar que puedas volar.",
      paraVolver: "Cargá tu certificado médico aeronáutico en el Hangar.",
      seccion: "61.060(a)(1)(i)",
      detalle:
        "No tenés un certificado médico cargado, así que no podemos evaluar si " +
        "está vigente. Esto no dice que no puedas volar: dice que Vector no lo sabe.",
    };
  }

  // 61.135 — el repaso. Sin él no se puede actuar como piloto al mando.
  //
  // No tenerlo **cargado** no es tenerlo vencido: es "no sé", igual que el CMA de más
  // arriba. Hasta el 2026-09-24 las dos cosas decían "No podés actuar como piloto al
  // mando", y el alta nunca pide el repaso: era la primera respuesta que veía un
  // piloto nuevo en el inicio, afirmada sobre un dato que nadie le había pedido.
  const repaso = documentos.find((d) => d.kind === "repaso_vuelo");
  if (!repaso) {
    return {
      estado: "documento_faltante",
      puede: "No podemos confirmar que puedas volar como piloto al mando.",
      paraVolver: "Cargá tu repaso de vuelo en el Hangar.",
      seccion: "61.135",
      detalle:
        "No tenés un repaso de vuelo cargado, así que no podemos saber si está vigente. " +
        "Esto no dice que no puedas volar: dice que Vector no lo sabe.",
    };
  }
  if (documentStatus(repaso.expiry_date, hoy).tone === "expired") {
    return {
      estado: "repaso_vencido",
      puede: "No podés actuar como piloto al mando.",
      paraVolver:
        "Hacé un repaso de vuelo con un instructor: mínimo 1 hora de instrucción " +
        "en tierra y 1 hora en vuelo, firmado en tu libro.",
      seccion: "61.135",
      detalle: `Tu repaso ${documentStatus(repaso.expiry_date, hoy).label.toLowerCase()}.`,
    };
  }

  // Documentos que impiden volar solo. Misma consecuencia que el repaso vencido,
  // y se levantan igual: volando con un instructor. Van después del repaso porque
  // si los dos faltan, conviene nombrar primero el que exige la norma.
  const bloqueaSolo = documentos.find(
    (d) => d.blocking === "solo" && documentStatus(d.expiry_date, hoy).tone === "expired"
  );
  if (bloqueaSolo) {
    return {
      estado: "repaso_vencido",
      puede: "Sólo podés volar con instructor.",
      paraVolver: `Necesitás un vuelo con instructor para renovar ${bloqueaSolo.name}.`,
      seccion: "requisito propio",
      detalle: `${bloqueaSolo.name} — ${documentStatus(bloqueaSolo.expiry_date, hoy).label.toLowerCase()}. Lo marcaste como bloqueante de vuelo solo.`,
    };
  }

  // Documentos que sólo impiden llevar pasajeros. Misma salida que la falta de
  // experiencia reciente: se puede volar solo.
  const bloqueaPasajeros = documentos.find(
    (d) => d.blocking === "pasajeros" && documentStatus(d.expiry_date, hoy).tone === "expired"
  );
  if (bloqueaPasajeros) {
    return {
      estado: "sin_recencia",
      puede: "Podés volar solo, pero no llevar pasajeros.",
      paraVolver: `Renová ${bloqueaPasajeros.name} para volver a llevar pasajeros.`,
      seccion: "requisito propio",
      detalle: `${bloqueaPasajeros.name} — ${documentStatus(bloqueaPasajeros.expiry_date, hoy).label.toLowerCase()}. Lo marcaste como bloqueante de pasajeros.`,
    };
  }

  // 61.140 — la experiencia reciente. Acá sí hay salida volando solo.
  const sinRecencia = recencias.filter((r) => !r.vigente);
  if (sinRecencia.length > 0) {
    return {
      estado: "sin_recencia",
      puede: "Podés volar solo, pero no llevar pasajeros.",
      paraVolver:
        "Auto-reentrenamiento: volá sin personas a bordo ni carga y completá los " +
        "circuitos de tránsito que te faltan. Anotalo en tu libro y recuperás la vigencia.",
      seccion: "61.140(c)(2)(i)",
      detalle: `Sin experiencia reciente en ${sinRecencia.map((r) => r.clase).join(", ")}.`,
    };
  }

  const proxima = [...recencias].sort((a, b) =>
    (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999")
  )[0];

  return {
    estado: "vigente",
    puede: "Podés volar como piloto al mando y llevar pasajeros.",
    seccion: "61.060(a)(1)",
    detalle: proxima?.expiresOn
      ? `Tu experiencia reciente en ${proxima.clase} vence el ${proxima.expiresOn}.`
      : undefined,
  };
}

/**
 * "¿Puedo volar hoy?" para un alumno piloto: RAAC 61, Capítulo C (Ed. VI, enero 2026).
 *
 * El alumno no tiene licencia, así que no le aplican el repaso (61.135) ni la experiencia
 * reciente (61.140), que son de quien ejerce una licencia, ni la inactividad de 24 meses
 * de 61.060(a)(2). Lo que sí le aplica:
 *
 * - 61.060(b): la autorización de alumno piloto vale 24 meses "contándose con la
 *   certificación médica aeronáutica adecuada", y 61.405(f) exige el CMA para el vuelo
 *   solo. Sin el CMA cargado, "no sé"; vencido, no vuela solo.
 * - 61.410: el vuelo solo lo autoriza el instructor. Vector no tiene ese dato, así que
 *   no lo afirma: dice que vuela con su instructor, y que solo, con su autorización.
 * - 61.415: sin pasajeros, con visibilidad de 5 km o más y en vuelo visual.
 *
 * Hasta el 2026-09-24 un alumno veía el estado de un piloto con licencia: "No podemos
 * confirmar que puedas volar como piloto al mando. Cargá tu repaso", que nunca iba a
 * poder cargar.
 */
function estadoAlumno(documentos: PilotDocument[], hoy: Date, documentosDisponibles: boolean): PilotStatus {
  if (!documentosDisponibles) {
    return {
      estado: "datos_no_disponibles",
      puede: "No podemos confirmar que puedas volar.",
      paraVolver: "Probá recargar la página en un momento.",
      seccion: "61.060(b)",
      detalle: "No pudimos leer tus documentos. Es una falla nuestra, no algo que te falte.",
    };
  }
  const bloqueaVuelo = documentos.find(
    (d) => d.blocking === "vuelo" && documentStatus(d.expiry_date, hoy).tone === "expired"
  );
  if (bloqueaVuelo) {
    return {
      estado: "documento_vencido",
      puede: "No podés volar.",
      paraVolver: `Renová ${bloqueaVuelo.name} antes de volar.`,
      seccion: "requisito propio",
      detalle: `${bloqueaVuelo.name} — ${documentStatus(bloqueaVuelo.expiry_date, hoy).label.toLowerCase()}. Lo marcaste como bloqueante.`,
    };
  }
  const cma = documentos.find((d) => d.kind === "cma");
  if (!cma) {
    return {
      estado: "documento_faltante",
      puede: "No podemos confirmar que puedas volar solo.",
      paraVolver: "Cargá tu certificado médico aeronáutico en el Hangar.",
      seccion: "61.405(f)",
      detalle:
        "No tenés un certificado médico cargado, así que no podemos saber si está vigente. " +
        "Esto no dice que no puedas volar: dice que Vector no lo sabe.",
    };
  }
  if (documentStatus(cma.expiry_date, hoy).tone === "expired") {
    return {
      estado: "documento_vencido",
      puede: "No podés volar solo.",
      paraVolver: "Renová tu certificado médico: la autorización de alumno piloto lo exige.",
      seccion: "61.060(b) · 61.405(f)",
      detalle: `${cma.name} — ${documentStatus(cma.expiry_date, hoy).label.toLowerCase()}.`,
    };
  }
  return {
    estado: "vigente",
    puede: "Podés volar con tu instructor.",
    seccion: "61.410 · 61.415",
    detalle:
      "Solo, con su autorización. Sin pasajeros, con visibilidad de 5 km o más y en vuelo visual.",
  };
}

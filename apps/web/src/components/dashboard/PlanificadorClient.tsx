"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Compass, Info, Plus, Printer, Route, Trash2, Wind } from "lucide-react";
import type { Aircraft } from "@/types";
import type { PuntoResuelto } from "@/app/api/puntos/route";
import { anotarOrigen, leerOrigenLocal, suscribirOrigen } from "@/lib/origen-datos";
import PuntoResolver from "./PuntoResolver";
import TramoAerovia from "./TramoAerovia";
import PageHeader from "./PageHeader";
import PlanMapa from "./PlanMapa";
import BriefingRuta from "./BriefingRuta";
import AlternativasCerca from "./AlternativasCerca";
import ArmarDesdePlanificador from "./plan-de-vuelo/ArmarDesdePlanificador";
import StyledSelect from "./StyledSelect";
import { fmt, hoursToHm, num, NumberField, ToolNote } from "./tools/ToolPrimitives";
import { calcularPlan, type ParametrosTramo } from "@/lib/navegacion";
import { computeFuel } from "@/lib/aviation";
import {
  diferenciaConSuperficie,
  nivelParaAltitud,
  type NivelViento,
} from "@/lib/vientos-altura";
import {
  DISPERSION_TOLERABLE,
  MAX_PUNTOS,
  dispersionDeVariacion,
  elementosDeRuta,
  esAerovia,
  moverElemento,
  parsearRuta,
  posicionDespuesDe,
  puntosConBriefing,
  rutaAUrl,
  type PuntoRuta,
} from "@/lib/ruta-planificada";

/**
 * El planificador de navegación.
 *
 * Vector entraba recién cuando el vuelo había terminado. Los tramos, rumbos, tiempos y
 * combustible se hacían la noche anterior en una planilla fotocopiada, y para el
 * usuario de esta app eso pesa doble: es un PPA construyendo horas de travesía para el
 * PCA, o sea que planificar es lo que más hace.
 *
 * ## Reglas que sigue, y de dónde salen
 *
 * - **No hay botón "Calcular".** Es la convención de todos los calculadores de Vector
 *   (`ToolPrimitives`): los campos se guardan como texto y se parsean en cada render,
 *   nunca en el `blur`. Un `number` en el estado pelearía con el usuario por valores a
 *   medio tipear como "1." o "-".
 * - **Toda la matemática en verdadero; la variación se aplica al mostrar.** Ver
 *   `lib/navegacion.ts`. Acá eso se traduce en una sola cosa: el viento que se le pasa
 *   al cálculo es el del METAR **sin convertir**, porque el METAR escrito ya viene en
 *   grados verdaderos.
 * - **Cuando no se sabe, se dice.** Un tramo con un código sin resolver no se saltea:
 *   anula el cálculo y la pantalla señala cuál falta. Saltearlo uniría los vecinos con
 *   una recta que nadie va a volar y daría un total más corto con pinta de válido.
 * - **Un punto que no es aeródromo no va al briefing.** Una coordenada propia nunca va a
 *   tener METAR, y `veredictoDeRuta` cuenta cuántas estaciones contestaron para decidir
 *   si puede opinar: mandarla igual la contaría como una estación caída y bajaría el
 *   veredicto de una ruta impecable. Ver `puntosConBriefing`.
 *
 * ## Un punto ya no es sólo un aeródromo
 *
 * Se puede escribir `SADM` como siempre, y además `S34.68/W58.64` —el pueblo, el cruce
 * de rutas, la laguna, que es como se vuela VFR de verdad— o `BAR/045/25`, que son 25 NM
 * en el radial 045 del VOR de Bariloche. La gramática vive en `lib/puntos.ts` y el campo
 * es `PuntoResolver`, que existe justamente porque `AirportResolver` sólo acepta cuatro
 * letras y lo usan otras seis pantallas.
 *
 * ## Sin persistencia, a propósito
 *
 * El estado vive en la URL. Un plan se comparte mandando el link y se imprime desde el
 * navegador. Guardarlo en la base exigiría tabla, endpoints, permisos y una pantalla de
 * "mis planes" para algo que se usa una vez, la noche antes.
 */

/** Lo que se usa cuando la aeronave no tiene performance cargada. */
const TAS_POR_DEFECTO = 110;
const CONSUMO_POR_DEFECTO = 32;

interface Props {
  aeronaves: Aircraft[];
  /** Estado inicial leído de la URL por la página. */
  rutaInicial: string[];
  aeronaveInicial: string;
  /** Para el plan de vuelo, del perfil: "NOMBRE PPA 12345678" y el celular. */
  piloto: { comandante: string; telefono: string };
}

export default function PlanificadorClient({ aeronaves, rutaInicial, aeronaveInicial, piloto }: Props) {
  const [codigos, setCodigos] = useState<string[]>(() =>
    rutaInicial.length >= 2 ? rutaInicial : ["", ""]
  );
  const [resueltos, setResueltos] = useState<(PuntoResuelto | null)[]>(() =>
    Array(Math.max(rutaInicial.length, 2)).fill(null)
  );
  const [aeronaveId, setAeronaveId] = useState(aeronaveInicial);

  /**
   * Por qué no se pudo armar el tramo de una aerovía, por índice de la ruta.
   *
   * Vive acá y no adentro de `resueltos` porque un tramo que falla **no es un punto sin
   * resolver**: la aerovía existe y el error dice qué le falta. Mezclarlos haría que la
   * pantalla dijera "no reconocemos W67" cuando el problema es el punto de entrada.
   */
  const [erroresAerovia, setErroresAerovia] = useState<Record<number, string>>({});

  /**
   * Qué posiciones de la ruta son una aerovía **todavía sin elegir**.
   *
   * Hace falta porque hasta que el piloto elige, el token está vacío y no hay forma de
   * saber si esa fila es un punto a medio escribir o una banda de aerovía esperando. Una
   * vez elegido, `esAerovia(codigo)` alcanza y este conjunto deja de importar para esa
   * posición.
   */
  const [huecosAerovia, setHuecosAerovia] = useState<Set<number>>(new Set());

  const [tas, setTas] = useState("");
  const [consumo, setConsumo] = useState("");
  const [combustible, setCombustible] = useState("");
  const [reserva, setReserva] = useState("45");
  /*
    La performance tipeada sobrevive a una recarga; **el viento no**.

    La ruta ya viajaba en la URL, así que un plan se comparte con un link. Pero la TAS,
    el consumo, el combustible y la reserva vivían sólo en `useState`, y en el celular
    —donde la app pierde el foco todo el tiempo— se perdían constantemente. Son los
    números de *la aeronave*: no cambian entre vuelos, y volver a tipearlos era la
    fricción que este planificador venía a sacar.

    **El viento queda deliberadamente afuera**, y no es un olvido. Es el único de estos
    valores que **caduca**: restaurar el de ayer con la etiqueta de hoy es exactamente
    el error que la Fase 5 existe para impedir con el METAR. Un viento viejo mostrado
    como actual da una planilla con pinta de válida y tiempos equivocados.

    `altitud` tampoco: es del vuelo, no de la aeronave.
  */
  const performance = usarPerformanceGuardada({ tas, consumo, combustible, reserva });

  /*
    Se aplica **una sola vez y sólo sobre lo que está vacío**. Si el piloto llegó con
    una aeronave elegida —que trae su propia TAS y su consumo— o con un plan prefijado
    desde el calendario, lo guardado no puede pisarlo: la aeronave de este vuelo gana
    sobre lo que quedó de la sesión anterior.
  */
  const yaRestaure = useRef(false);
  useEffect(() => {
    if (yaRestaure.current || !performance.restaurada) return;
    yaRestaure.current = true;
    const g = performance.restaurada;
    setTas((v) => v || g.tas);
    setConsumo((v) => v || g.consumo);
    setCombustible((v) => v || g.combustible);
    setReserva((v) => (v === "45" ? g.reserva : v));
  }, [performance.restaurada]);

  const [vientoDir, setVientoDir] = useState("");
  const [vientoVel, setVientoVel] = useState("");
  const [variacion, setVariacion] = useState("");

  /*
    Tres banderas de "el piloto ya lo tocó". Sin ellas, el autocompletado desde la
    aeronave o desde el METAR pisaría lo que la persona acaba de escribir cada vez que
    cambia otra cosa — el peor modo de falla de un formulario que se completa solo.
  */
  const tocoPerformance = useRef(false);
  const tocoViento = useRef(false);
  const tocoVariacion = useRef(false);

  const [metar, setMetar] = useState<{ estacion: string; texto: string } | null>(null);

  /** Altitud de crucero. Es lo que decide qué nivel de viento en altura corresponde. */
  const [altitud, setAltitud] = useState("");
  const [niveles, setNiveles] = useState<NivelViento[]>([]);
  /** El viento de superficie que trajo el METAR, para poder compararlo con el de altura. */
  const vientoSuperficie = useRef<{ direccion: number; velocidad: number } | null>(null);

  const aeronave = aeronaves.find((a) => a.id === aeronaveId) ?? null;

  /* ---------------------------------------------------------------------- */
  /* Autocompletado                                                          */
  /* ---------------------------------------------------------------------- */

  // Performance desde la aeronave elegida.
  useEffect(() => {
    if (!aeronave || tocoPerformance.current) return;
    if (aeronave.cruise_tas_kt) setTas(String(aeronave.cruise_tas_kt));
    if (aeronave.fuel_burn_lph) setConsumo(String(aeronave.fuel_burn_lph));
    if (aeronave.fuel_capacity_l) setCombustible(String(aeronave.fuel_capacity_l));
  }, [aeronave]);

  const salida = resueltos[0] ?? null;

  // Variación desde el aeródromo de salida.
  useEffect(() => {
    if (tocoVariacion.current) return;
    if (salida?.variacionW !== undefined) setVariacion(String(salida.variacionW));
  }, [salida]);

  /*
    Viento desde el METAR de salida — **sólo si la salida es un aeródromo**. Se puede
    empezar una ruta en una coordenada, y pedirle el METAR a `S34.68/W58.64` sería pedirle
    el clima a un código que no existe: un 404 y un campo de viento que no se completa
    nunca, sin explicación.
  */
  const icaoSalida = salida?.clase === "aerodromo" ? salida.codigo : null;

  useEffect(() => {
    if (!icaoSalida || tocoViento.current) return;
    let cancelado = false;

    (async () => {
      try {
        const res = await fetch(`/api/weather?icao=${encodeURIComponent(icaoSalida)}`);
        if (!res.ok || cancelado) return;
        const datos = await res.json();
        if (cancelado || tocoViento.current) return;

        // `windDir` puede venir "VRB" cuando el viento es variable. No es un número y
        // no hay rumbo que corregir: se deja el campo vacío en vez de inventar un cero,
        // que sería viento del norte.
        const dir = Number(datos.windDir);
        const vel = Number(datos.windSpeed);
        if (Number.isFinite(dir)) setVientoDir(String(dir));
        if (Number.isFinite(vel)) setVientoVel(String(vel));
        if (Number.isFinite(dir) && Number.isFinite(vel)) {
          vientoSuperficie.current = { direccion: dir, velocidad: vel };
        }
        if (datos.metar) {
          setMetar({ estacion: datos.nearestStation?.icao || icaoSalida, texto: datos.metar });
        }
      } catch {
        // Sin METAR se planifica igual, con viento cero o el que el piloto tipee. No
        // vale la pena molestar con un error por un dato que es una comodidad.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [icaoSalida]);

  // Viento en altura para el punto de salida.
  useEffect(() => {
    if (salida?.lat === undefined || salida?.lon === undefined) return;
    let cancelado = false;

    (async () => {
      try {
        const res = await fetch(`/api/winds-aloft?lat=${salida.lat}&lon=${salida.lon}`);
        if (!res.ok || cancelado) return;
        const datos = await res.json();
        if (!cancelado) setNiveles(datos.niveles ?? []);
      } catch {
        // Sin viento en altura se planifica con el de superficie, que es lo que se venía
        // haciendo. No es un error que valga la pena mostrar.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [salida?.lat, salida?.lon]);

  /*
    Cuando hay altitud de crucero y hay niveles, el viento sale del nivel que corresponde
    en vez del METAR de superficie. **Es el salto de calidad del planificador**: a 3.000 ft
    el viento suele rolar 20-30° a la derecha y soplar 10-15 kt más que en la pista.

    Respeta `tocoViento` igual que el METAR: si el piloto escribió un viento, manda el suyo.
  */
  const altitudNum = num(altitud);
  const nivelElegido = altitudNum > 0 ? nivelParaAltitud(niveles, altitudNum) : null;

  useEffect(() => {
    if (!nivelElegido || tocoViento.current) return;
    setVientoDir(String(nivelElegido.direccion));
    setVientoVel(String(nivelElegido.velocidad));
  }, [nivelElegido]);

  /**
   * Resuelve cada aerovía de la ruta contra sus vecinos.
   *
   * Va en un efecto y no en el campo porque **una aerovía es la única cosa de la ruta que
   * no se resuelve sola**: `W67` no significa nada sin saber por dónde se entra y por dónde
   * se sale, y esos dos son los tokens de al lado. Cuando cambia cualquiera de los tres,
   * este efecto vuelve a pedir el tramo.
   */
  useEffect(() => {
    const pendientes = codigos
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => esAerovia(c) && !resueltos[i] && codigos[i - 1] && codigos[i + 1]);
    if (pendientes.length === 0) return;

    let cancelado = false;
    (async () => {
      for (const { c, i } of pendientes) {
        try {
          const q = new URLSearchParams({ q: c, desde: codigos[i - 1], hasta: codigos[i + 1] });
          const res = await fetch(`/api/puntos?${q}`);
          if (!res.ok || cancelado) continue;
          const datos = await res.json();
          anotarOrigen(datos);
          if (cancelado) continue;

          if (datos.punto) {
            setResueltos((prev) => {
              const copia = [...prev];
              copia[i] = datos.punto;
              // El punto de salida no tiene campo propio —lo elige el desplegable de la
              // banda— así que su resolución llega con la de la aerovía. Sin esto, el
              // último punto del tramo queda sin posición y el plan entero no se calcula.
              if (datos.salida && i + 1 < copia.length) copia[i + 1] = datos.salida;
              return copia;
            });
            setErroresAerovia((prev) => {
              const { [i]: _, ...resto } = prev;
              return resto;
            });
          } else if (datos.error) {
            setErroresAerovia((prev) => ({ ...prev, [i]: datos.error }));
          }
        } catch {
          // Sin señal se deja pendiente y se reintenta cuando cambie algo.
        }
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigos.join("|"), resueltos]);

  /* ---------------------------------------------------------------------- */
  /* Estado en la URL                                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const params = new URLSearchParams();
    const ruta = rutaAUrl(codigos.filter(Boolean));
    if (ruta) params.set("ruta", ruta);
    if (aeronaveId) params.set("av", aeronaveId);
    const query = params.toString();

    /*
      `history.replaceState` y no `router.replace`: esto corre con cada tecla del campo
      de ruta, y `router.replace` dispara un render del server component en cada una.
      La URL es estado de esta pantalla, no una navegación.
    */
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [codigos, aeronaveId]);

  /* ---------------------------------------------------------------------- */
  /* Puntos y cálculo                                                        */
  /* ---------------------------------------------------------------------- */

  const deRef = (codigo: string, ref: PuntoResuelto | null): PuntoRuta => ({
    codigo,
    label: ref?.label ?? "",
    lat: ref?.lat,
    lon: ref?.lon,
    variacionW: ref?.variacionW,
    resuelto: !!ref,
    clase: ref?.clase,
    elevacionFt: ref?.elevacionFt,
    pistas: ref?.pistas,
    estacion: ref?.estacion,
    rutas: ref?.rutas,
    vigencia: ref?.vigencia,
  });

  /**
   * La ruta como la ve el cálculo: **la aerovía se abre en sus puntos acá y no antes**.
   *
   * Ésa es toda la diferencia con la versión anterior. Antes la expansión pisaba `codigos`
   * y la aerovía desaparecía: quedaban trece campos sueltos y cambiar el punto de salida
   * obligaba a borrar once. Ahora `codigos` guarda `SADM · BCA · W67 · OSA · SAZS` —cinco
   * tokens, un link corto, un plan editable— y los trece puntos existen sólo del lado del
   * cálculo, que es el único que los necesita.
   */
  const puntos: PuntoRuta[] = useMemo(
    () =>
      codigos.flatMap((codigo, i) => {
        const ref = resueltos[i];
        if (ref?.clase === "aerovia") return (ref.tramo ?? []).map((p) => deRef(p.codigo, p));
        return [deRef(codigo, ref ?? null)];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codigos, resueltos]
  );

  const elementos = useMemo(
    () => elementosDeRuta(codigos, huecosAerovia),
    [codigos, huecosAerovia]
  );

  const cargados = puntos.filter((p) => p.codigo.trim());
  const faltantes = cargados.filter((p) => p.lat === undefined || p.lon === undefined);
  const listos = faltantes.length === 0 && cargados.length >= 2;

  const tasNum = num(tas, aeronave?.cruise_tas_kt ?? TAS_POR_DEFECTO);
  const consumoNum = num(consumo, aeronave?.fuel_burn_lph ?? CONSUMO_POR_DEFECTO);
  const usandoTasEstimada = !tas.trim() && !aeronave?.cruise_tas_kt;

  const parametros: ParametrosTramo = {
    tasKt: tasNum,
    viento: { direccion: num(vientoDir), velocidad: num(vientoVel) },
    variacionW: num(variacion),
    consumoLh: consumoNum,
  };

  const plan = useMemo(
    () =>
      listos
        ? calcularPlan(
            cargados.map((p) => ({ lat: p.lat!, lon: p.lon! })),
            parametros
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listos, JSON.stringify(cargados.map((p) => [p.lat, p.lon])), JSON.stringify(parametros)]
  );

  const dispersion = dispersionDeVariacion(puntos);

  const combustibleNum = num(combustible);
  const chequeoCombustible =
    plan?.totales.minutos != null && combustibleNum > 0
      ? computeFuel({
          fuelOnBoard: combustibleNum,
          burnRate: consumoNum,
          reserveMinutes: num(reserva, 45),
          legMinutes: plan.totales.minutos,
          groundSpeed: 0,
        })
      : null;

  /* ---------------------------------------------------------------------- */
  /* Edición de la ruta                                                      */
  /* ---------------------------------------------------------------------- */

  const cambiarCodigo = useCallback((i: number, valor: string) => {
    setCodigos((prev) => prev.map((c, j) => (j === i ? valor : c)));
  }, []);

  const resolverPunto = useCallback((i: number, ref: PuntoResuelto | null) => {
    setResueltos((prev) => {
      if (prev[i]?.codigo === ref?.codigo) return prev;
      const copia = [...prev];
      copia[i] = ref;
      return copia;
    });
  }, []);

  /**
   * Mete un punto vacío en la posición `en`.
   *
   * Antes esto era un `push` y el botón decía "Agregar punto intermedio" cuando en realidad
   * agregaba **al final**: para meter un punto en el medio había que borrar todo lo que
   * venía después y volver a escribirlo. Ahora la acción vive entre cada par de puntos y la
   * posición es la que se clickeó.
   */
  const insertarPunto = (en: number) => {
    if (codigos.length >= MAX_PUNTOS) return;
    setCodigos((prev) => [...prev.slice(0, en), "", ...prev.slice(en)]);
    setResueltos((prev) => [...prev.slice(0, en), null, ...prev.slice(en)]);
    setHuecosAerovia((prev) => {
      const nuevo = new Set<number>();
      for (const h of prev) nuevo.add(h >= en ? h + 1 : h);
      return nuevo;
    });
  };

  /**
   * Sube o baja un elemento de la ruta.
   *
   * **Se mueve el orden, no los textos.** `moverElemento` devuelve una permutación de
   * índices que se aplica igual a `codigos`, a `resueltos` y a los huecos: si se movieran
   * por separado, un punto terminaría con la resolución de otro, que en esta pantalla
   * significa mostrar el nombre de un aeródromo arriba del código de otro.
   *
   * Las resoluciones de las aerovías se descartan a propósito: al cambiar de vecinos, el
   * tramo que tenían calculado ya no es el que corresponde, y el efecto lo vuelve a pedir.
   */
  const mover = (elemento: number, direccion: -1 | 1) => {
    const orden = moverElemento(codigos, huecosAerovia, elemento, direccion);
    if (!orden) return;

    const eraAerovia = new Set(
      elementosDeRuta(codigos, huecosAerovia)
        .filter((e) => e.tipo === "aerovia")
        .map((e) => e.indices[0])
    );

    setCodigos(orden.map((i) => codigos[i]));
    setResueltos(orden.map((i) => (eraAerovia.has(i) ? null : resueltos[i])));
    setHuecosAerovia(new Set(orden.map((viejo, nuevo) => (eraAerovia.has(viejo) ? nuevo : -1)).filter((i) => i >= 0)));
    setErroresAerovia({});
  };

  const quitarPunto = (i: number) => {
    // Dos es el mínimo: con uno no hay tramo que calcular y la pantalla no tendría
    // nada que mostrar.
    if (codigos.length <= 2) return;
    // Sacar una aerovía se lleva también su punto de salida: quedó ahí porque la aerovía lo
    // puso, y dejarlo suelto convertiría "sacar el tramo" en "sacar el tramo y quedarte con
    // un punto en el medio de la nada que no pediste".
    const aEliminar = new Set([i]);
    if (esAerovia(codigos[i]) || huecosAerovia.has(i)) aEliminar.add(i + 1);
    setCodigos((prev) => prev.filter((_, j) => !aEliminar.has(j)));
    setResueltos((prev) => prev.filter((_, j) => !aEliminar.has(j)));
    // Los marcadores son índices, así que hay que correrlos: sin esto, borrar un punto de
    // arriba deja una banda de aerovía dibujada sobre un punto cualquiera.
    setHuecosAerovia((prev) => {
      const nuevo = new Set<number>();
      for (const h of prev) {
        if (aEliminar.has(h)) continue;
        nuevo.add(h - [...aEliminar].filter((x) => x < h).length);
      }
      return nuevo;
    });
    setErroresAerovia({});
  };

  /**
   * Reemplaza la ruta entera de un saque.
   *
   * **Conserva lo ya resuelto, y no es una optimización: sin eso queda roto.**
   * `AirportResolver` avisa su resolución sólo cuando su `value` cambia, así que si
   * acá se borran todas las resoluciones, un código que quedó en la misma posición
   * —el SADM de salida, casi siempre— nunca vuelve a avisar y el plan se queda
   * diciendo "no reconocemos SADM" para siempre. Se remapea por código.
   */
  const aplicarRuta = useCallback(
    (nuevos: string[]) => {
      const porCodigo = new Map<string, PuntoResuelto>();
      resueltos.forEach((ref, i) => {
        if (ref) porCodigo.set(codigos[i].trim().toUpperCase(), ref);
      });
      setCodigos(nuevos);
      setResueltos(nuevos.map((c) => porCodigo.get(c) ?? null));
      setErroresAerovia({});
    },
    [codigos, resueltos]
  );

  /**
   * Pega la ruta entera.
   *
   * **Ya no expande**: `ALBAL UM424 EZE` deja los tres tokens y la aerovía se resuelve
   * sola, igual que si se hubiera agregado con el botón. Que las dos puertas dejen el mismo
   * modelo es lo que hace que se pueda editar lo pegado — antes, pegar una ruta con
   * aerovía daba trece campos sueltos y salir de ahí era borrar y volver a empezar.
   */
  const pegarRuta = (texto: string) => {
    const nuevos = parsearRuta(texto);
    if (nuevos.length >= 2) aplicarRuta(nuevos);
  };

  /**
   * Mete una aerovía después del punto `i`.
   *
   * **Inserta dos casilleros, no uno**: la aerovía y su punto de salida. El punto de salida
   * es un punto propio de la ruta —el tramo siguiente arranca ahí— y la primera versión de
   * esto insertaba sólo la banda, con lo cual al elegir el destino se pisaba el aeródromo
   * de llegada: una ruta SADM · BCA · SAZS se convertía en SADM · BCA · W67 · OSA y
   * **desaparecía SAZS**. Se vio manejando la pantalla con un navegador.
   */
  const agregarAerovia = (i: number) => {
    if (codigos.length + 2 > MAX_PUNTOS) return;
    setCodigos((prev) => [...prev.slice(0, i + 1), "", "", ...prev.slice(i + 1)]);
    setResueltos((prev) => [...prev.slice(0, i + 1), null, null, ...prev.slice(i + 1)]);
    // Marca el hueco como aerovía aunque todavía no tenga designador, para que la fila se
    // dibuje como banda y no como campo de punto.
    setHuecosAerovia((prev) => {
      const nuevo = new Set<number>();
      for (const h of prev) nuevo.add(h > i ? h + 2 : h);
      nuevo.add(i + 1);
      return nuevo;
    });
  };

  const cambiarAerovia = (i: number, aerovia: string, hasta: string) => {
    setCodigos((prev) => {
      const copia = [...prev];
      copia[i] = aerovia;
      if (hasta && i + 1 < copia.length) copia[i + 1] = hasta;
      return copia;
    });
    setResueltos((prev) => {
      const copia = [...prev];
      copia[i] = null;
      if (hasta && i + 1 < copia.length) copia[i + 1] = null;
      return copia;
    });
  };

  const puntosMapa = cargados
    .filter((p) => p.lat !== undefined && p.lon !== undefined)
    .map((p) => ({ codigo: p.codigo, label: p.label, lat: p.lat!, lon: p.lon! }));

  /* ---------------------------------------------------------------------- */

  return (
    <div className="space-y-8 md:space-y-10">
      <PageHeader
        eyebrow="Planificación"
        title="Planificador"
        action={
          <button
            type="button"
            onClick={() => window.print()}
            data-imprimir="no"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        }
      >
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
          Tramos, rumbos, tiempos y combustible. Se calcula solo mientras cargás; el plan queda en la
          dirección de esta página, así que se comparte con el link.
        </p>
      </PageHeader>

      <div
        data-imprimir="planilla"
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 md:gap-10"
      >
        {/* ------------------------------------------------ Entradas ---- */}
        <div className="space-y-8" data-imprimir="no">
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Ruta</h3>

            {/*
              La ruta se dibuja **por elementos**, no por token: una aerovía y su punto de
              salida son una sola fila. Es lo que permite reordenar sin que la banda se
              separe de su destino y sin que un punto caiga en el medio de las dos.
            */}
            <div className="space-y-2">
              {elementos.map((elemento, e) => {
                const i = elemento.indices[0];
                const codigo = codigos[i];
                const puedeSubir = moverElemento(codigos, huecosAerovia, e, -1) !== null;
                const puedeBajar = moverElemento(codigos, huecosAerovia, e, 1) !== null;

                const flechas = (
                  <div className="flex flex-col shrink-0" data-imprimir="no">
                    <button
                      type="button"
                      onClick={() => mover(e, -1)}
                      disabled={!puedeSubir}
                      aria-label={`Subir ${codigo || "este punto"}`}
                      className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 enabled:hover:text-aviation-blue enabled:hover:bg-aviation-blue/10 disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(e, 1)}
                      disabled={!puedeBajar}
                      aria-label={`Bajar ${codigo || "este punto"}`}
                      className="p-1 rounded-md text-zinc-300 dark:text-zinc-600 enabled:hover:text-aviation-blue enabled:hover:bg-aviation-blue/10 disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );

                /*
                  Las acciones van **entre** dos elementos, que es donde cae lo que se
                  agrega. No se ofrecen después del último: ahí ya está el botón de abajo, y
                  dos formas de hacer lo mismo en el mismo lugar no ayudan a nadie.
                */
                const entreMedio = e < elementos.length - 1 && (
                  <div className="flex items-center gap-3 pl-1" data-imprimir="no">
                    {codigos.length < MAX_PUNTOS && (
                      <button
                        type="button"
                        onClick={() => insertarPunto(posicionDespuesDe(codigos, huecosAerovia, e))}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-aviation-blue transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Punto acá
                      </button>
                    )}
                    {elemento.tipo === "punto" &&
                      resueltos[i] &&
                      elementos[e + 1]?.tipo === "punto" &&
                      codigos.length + 2 <= MAX_PUNTOS && (
                        <button
                          type="button"
                          onClick={() => agregarAerovia(i)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-aviation-blue transition-colors"
                        >
                          <Route className="w-3.5 h-3.5" />
                          Por aerovía desde {codigo}
                        </button>
                      )}
                  </div>
                );

                if (elemento.tipo === "aerovia") {
                  const ref = resueltos[i];
                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        {flechas}
                        <div className="flex-1 min-w-0">
                          <TramoAerovia
                            desde={codigos[i - 1] ?? ""}
                            aerovia={codigo}
                            hasta={codigos[i + 1] ?? ""}
                            intermedios={(ref?.tramo ?? []).map((p) => p.codigo)}
                            error={erroresAerovia[i] ?? null}
                            onCambiar={(a, h) => cambiarAerovia(i, a, h)}
                            onQuitar={() => quitarPunto(i)}
                          />
                        </div>
                      </div>
                      {entreMedio}
                    </div>
                  );
                }

                return (
                  <div key={i} className="space-y-2">
                    <div className="flex items-end gap-1.5">
                      <div className="pb-5">{flechas}</div>
                      <div className="flex-1 min-w-0">
                        <PuntoResolver
                          label={etiquetaPunto(codigos, i)}
                          value={codigo}
                          onChange={(v) => cambiarCodigo(i, v)}
                          onResolve={(ref) => resolverPunto(i, ref)}
                          autoFocus={i === 0 && !codigo}
                        />
                      </div>
                      {elementos.length > 2 && (
                        <button
                          type="button"
                          onClick={() => quitarPunto(i)}
                          aria-label={`Quitar ${codigo || "punto"}`}
                          className="mb-1 p-2.5 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          data-imprimir="no"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {entreMedio}
                  </div>
                );
              })}
            </div>

            {codigos.length < MAX_PUNTOS && (
              <button
                type="button"
                onClick={() => insertarPunto(codigos.length)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-aviation-blue hover:underline"
              >
                <Plus className="w-4 h-4" />
                Agregar punto al final
              </button>
            )}

            <label className="block">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                O pegá la ruta entera
              </span>
              <input
                type="text"
                placeholder="SADM CHV SAAJ"
                title="Separá los puntos con espacios, comas o guiones. La barra va adentro de un punto: BAR/045/25"
                /*
                  El único campo de la pantalla que **no** se aplica en vivo, y es a
                  propósito. Los demás son valores; éste es un reemplazo masivo: aplicado
                  tecla por tecla, escribir "SADM SADF" pasaría por el estado "SADM S" y
                  tiraría la ruta abajo a mitad de tipeo. Se aplica al salir del campo o
                  con Enter.
                */
                onBlur={(e) => pegarRuta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pegarRuta((e.target as HTMLInputElement).value);
                  }
                }}
                className="w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 py-2 text-sm font-bold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
              />
              <span className="block mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                También entra la sintaxis de plan de vuelo: <span className="data">ALBAL UM424 EZE</span>.
              </span>
            </label>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Aeronave</h3>

            {aeronaves.length > 0 ? (
              <StyledSelect
                name="aeronave"
                value={aeronaveId}
                onChange={(v) => setAeronaveId(v)}
                options={[
                  { value: "", label: "Sin elegir" },
                  ...aeronaves.map((a) => ({
                    value: a.id,
                    label: `${a.registration} — ${a.type}`,
                  })),
                ]}
              />
            ) : (
              <p className="text-xs text-zinc-400">
                No tenés aeronaves cargadas. Podés planificar igual tipeando la performance.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="TAS crucero"
                suffix="kt"
                value={tas}
                onChange={(v) => {
                  tocoPerformance.current = true;
                  setTas(v);
                }}
                placeholder={String(TAS_POR_DEFECTO)}
              />
              <NumberField
                label="Consumo"
                suffix="L/h"
                value={consumo}
                onChange={(v) => {
                  tocoPerformance.current = true;
                  setConsumo(v);
                }}
                placeholder={String(CONSUMO_POR_DEFECTO)}
              />
              <NumberField
                label="Combustible"
                suffix="L"
                value={combustible}
                onChange={(v) => {
                  tocoPerformance.current = true;
                  setCombustible(v);
                }}
              />
              <NumberField
                label="Reserva"
                suffix="min"
                value={reserva}
                onChange={setReserva}
                placeholder="45"
              />
            </div>

            {usandoTasEstimada && (
              <ToolNote>
                Sin TAS cargada se estima con {TAS_POR_DEFECTO} kt y {CONSUMO_POR_DEFECTO} L/h. Cargá la
                performance de la aeronave en el Hangar y el plan deja de ser una estimación.
              </ToolNote>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-zinc-400" />
              Viento y variación
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Viento de"
                suffix="°"
                value={vientoDir}
                onChange={(v) => {
                  tocoViento.current = true;
                  setVientoDir(v);
                }}
                min={0}
                max={360}
              />
              <NumberField
                label="Intensidad"
                suffix="kt"
                value={vientoVel}
                onChange={(v) => {
                  tocoViento.current = true;
                  setVientoVel(v);
                }}
                min={0}
              />
            </div>

            <NumberField
              label="Altitud de crucero"
              suffix="ft"
              value={altitud}
              onChange={setAltitud}
              placeholder="4500"
              min={0}
            />

            <NumberField
              label="Variación magnética (W positiva)"
              suffix="°"
              value={variacion}
              onChange={(v) => {
                tocoVariacion.current = true;
                setVariacion(v);
              }}
            />

            {/*
              De dónde salió el viento que está en los campos. Antes decía siempre "del
              METAR"; ahora puede venir del modelo en altura, y **el piloto tiene que
              saber cuál está usando**: son números distintos y llevan a rumbos distintos.
            */}
            {nivelElegido ? (
              <ToolNote>
                Viento a {fmt(nivelElegido.altitudFt, 0)} ft ({nivelElegido.hPa} hPa) del modelo GFS.
                {(() => {
                  const sup = vientoSuperficie.current;
                  if (!sup) return null;
                  const d = diferenciaConSuperficie(sup, nivelElegido);
                  return (
                    <>
                      {" "}Contra la superficie{" "}
                      <strong>
                        {d.giroGrados === 0
                          ? "no rola"
                          : `rola ${fmt(Math.abs(d.giroGrados), 0)}° a la ${d.giroGrados > 0 ? "derecha" : "izquierda"}`}
                      </strong>{" "}
                      y sopla {d.masNudos >= 0 ? `${fmt(d.masNudos, 0)} kt más` : `${fmt(-d.masNudos, 0)} kt menos`}.
                    </>
                  );
                })()}
              </ToolNote>
            ) : metar ? (
              <ToolNote>
                Viento tomado del METAR de {metar.estacion}. <strong>Es viento de superficie</strong>, y
                se está usando para crucero. Cargá la altitud de crucero y lo tomamos del modelo en
                altura, que es bastante distinto: suele rolar a la derecha y soplar más fuerte.
              </ToolNote>
            ) : null}

            {altitudNum > 0 && niveles.length === 0 && (
              <ToolNote>
                No pudimos traer el viento en altura para esta zona. Se sigue usando el de superficie.
              </ToolNote>
            )}

            {dispersion !== null && dispersion > DISPERSION_TOLERABLE && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Entre las puntas de esta ruta la variación cambia {fmt(dispersion, 1)}°. Una sola para
                  todo el plan alcanza en travesías cortas; acá conviene recalcular los últimos tramos con
                  la del destino.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ Resultados --- */}
        <div className="space-y-6">
          {!listos ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 px-6 py-14 text-center">
              <Compass className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" strokeWidth={1.5} />
              <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-white">
                {faltantes.length > 0
                  ? `No reconocemos ${faltantes.map((p) => p.codigo).join(", ")}`
                  : "Cargá salida y llegada"}
              </p>
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {faltantes.length > 0
                  ? "El plan no se calcula salteando un punto: uniría los vecinos con una recta que no vas a volar y el total saldría más corto de lo que es."
                  : "Indicador ICAO (SADM), designador de ANAC (MOR), un punto de aerovía del AIP (DORVO), una coordenada propia (S34.68/W58.64) o un punto por radial y distancia (BAR/045/25). En el campo de abajo también entran aerovías enteras."}
              </p>
            </div>
          ) : (
            <>
              {/*
                Con qué se calculó. **En papel es imprescindible**: la planilla se lleva
                al avión sin la pantalla al lado, y un rumbo sin saber con qué viento
                salió no se puede corregir cuando el viento cambia. En pantalla ocupa una
                línea y no molesta.
              */}
              <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 flex flex-wrap gap-x-4 gap-y-1">
                {aeronave && <span>{aeronave.registration}</span>}
                <span>TAS {fmt(tasNum, 0)} kt</span>
                <span>
                  Viento {num(vientoVel) > 0 ? `${grados(num(vientoDir))}/${fmt(num(vientoVel), 0)}` : "calma"}
                </span>
                <span>
                  Var {fmt(Math.abs(num(variacion)), 1)}° {num(variacion) >= 0 ? "W" : "E"}
                </span>
                <span>Consumo {fmt(consumoNum, 0)} L/h</span>
                {altitudNum > 0 && <span>{fmt(altitudNum, 0)} ft</span>}
                <span>
                  Viento {nivelElegido ? `de altura (${nivelElegido.hPa} hPa)` : "de superficie"}
                </span>
              </p>

              <PlanillaTramos plan={plan!} puntos={cargados} />

              <Sintonizar puntos={cargados} />

              <CatalogoDeBordo />
              <VigenciaAip puntos={cargados} refs={resueltos} />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-imprimir="junto">
                <Total label="Distancia" valor={fmt(plan!.totales.distanciaNm, 1)} unidad="NM" />
                <Total
                  label="Tiempo"
                  valor={plan!.totales.minutos === null ? "—" : hoursToHm(plan!.totales.minutos / 60)}
                />
                <Total
                  label="Combustible"
                  valor={plan!.totales.litros === null ? "—" : fmt(plan!.totales.litros, 1)}
                  unidad="L"
                />
                <Total
                  label={chequeoCombustible ? "Sobra" : "A bordo"}
                  valor={
                    chequeoCombustible
                      ? fmt(chequeoCombustible.remainingAfterLeg, 1)
                      : combustibleNum > 0
                        ? fmt(combustibleNum, 0)
                        : "—"
                  }
                  unidad="L"
                  tono={
                    chequeoCombustible && chequeoCombustible.remainingAfterLeg < 0 ? "bad" : "neutral"
                  }
                />
              </div>

              {chequeoCombustible && chequeoCombustible.remainingAfterLeg < 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-500" />
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    <strong>No alcanza.</strong> Faltan {fmt(Math.abs(chequeoCombustible.remainingAfterLeg), 1)} L
                    para este plan con {num(reserva, 45)} minutos de reserva.
                  </p>
                </div>
              )}

              {plan!.tramosImposibles > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-500" />
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    Con este viento{" "}
                    {plan!.tramosImposibles === 1
                      ? "hay un tramo que no se puede volar"
                      : `hay ${plan!.tramosImposibles} tramos que no se pueden volar`}
                    . Los totales de tiempo y combustible quedan sin calcular: sumar sólo los tramos que
                    cierran daría un número más chico que la realidad.
                  </p>
                </div>
              )}

              {/* En papel el mapa no sirve: las reglas de impresión sacan los fondos
                  —para no gastar tinta— y con ellos los tiles, así que quedaría un
                  rectángulo vacío ocupando un tercio de la hoja. La planilla es lo que
                  se lleva al avión. */}
              <div data-imprimir="no">
                <PlanMapa puntos={puntosMapa} />
              </div>

              {/*
                El briefing absorbido de la pantalla de Ruta METAR. Antes el piloto
                tipeaba la misma ruta dos veces, en dos pantallas distintas.
              */}
              <BriefingRuta
                puntos={puntosConBriefing(cargados).map((p) => ({
                  codigo: p.codigo,
                  label: p.label,
                  lat: p.lat,
                  lon: p.lon,
                  elevacionFt: p.elevacionFt,
                  pistas: p.pistas,
                  variacionW: p.variacionW,
                }))}
              />

              <AlternativasCerca
                puntos={cargados.map((p) => ({ codigo: p.codigo, lat: p.lat, lon: p.lon }))}
                groundSpeedKt={plan!.tramos[0]?.groundSpeed ?? null}
              />

              <ArmarDesdePlanificador
                codigos={codigos}
                resueltos={resueltos}
                aeronave={aeronave}
                tasKt={tasNum}
                tasEstimada={!tas.trim() && !aeronave?.cruise_tas_kt}
                consumoEstimado={!consumo.trim() && !aeronave?.fuel_burn_lph}
                altitudFt={num(altitud) > 0 ? num(altitud) : null}
                minutosTotales={plan!.totales.minutos}
                distanciaNm={plan!.totales.distanciaNm}
                litros={combustibleNum}
                consumoLh={consumoNum}
                piloto={piloto}
              />

              {metar && (
                <details className="text-[11px]" data-imprimir="no">
                  <summary className="cursor-pointer font-semibold text-zinc-500 dark:text-zinc-400">
                    METAR usado
                  </summary>
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400 break-all">
                    {metar.texto}
                  </p>
                </details>
              )}

              <div className="flex items-start gap-2 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  Planilla de apoyo, no un plan de vuelo ANAC. Los rumbos salen de coordenadas por
                  loxodrómica —rumbo constante— y se convierten a magnético con la variación de arriba.
                  Contrastalos con la carta antes de volar.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlanillaTramos({
  plan,
  puntos,
}: {
  plan: ReturnType<typeof calcularPlan>;
  puntos: PuntoRuta[];
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <table className="w-full min-w-[520px] text-sm border-collapse">
        <thead>
          <tr className="text-left">
            {["Tramo", "Dist", "CV", "CM", "WCA", "RM", "GS", "Tiempo", "Comb"].map((h) => (
              <th
                key={h}
                className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 pb-2 pr-3 border-b border-zinc-200 dark:border-white/10"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.tramos.map((tramo, i) => (
            <tr key={i} className="border-b border-zinc-100 dark:border-white/5">
              <td className="py-2.5 pr-3 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                {puntos[i]?.codigo} → {puntos[i + 1]?.codigo}
              </td>
              <td className="py-2.5 pr-3 data text-zinc-600 dark:text-zinc-300">{fmt(tramo.distanciaNm, 1)}</td>
              <td className="py-2.5 pr-3 data text-zinc-400 dark:text-zinc-500">{grados(tramo.cursoVerdadero)}</td>
              <td className="py-2.5 pr-3 data text-zinc-600 dark:text-zinc-300">{grados(tramo.cursoMagnetico)}</td>
              <td className="py-2.5 pr-3 data text-zinc-600 dark:text-zinc-300">
                {tramo.wca >= 0 ? "+" : "−"}
                {fmt(Math.abs(tramo.wca), 0)}
              </td>
              {/* El rumbo magnético es el número que va al DG, así que es el único en
                  negrita: la planilla se lee de reojo en vuelo. */}
              <td className="py-2.5 pr-3 data font-bold text-zinc-900 dark:text-white">
                {grados(tramo.rumboMagnetico)}
              </td>
              <td className="py-2.5 pr-3 data text-zinc-600 dark:text-zinc-300">{fmt(tramo.groundSpeed, 0)}</td>
              <td className="py-2.5 pr-3 data text-zinc-600 dark:text-zinc-300">
                {tramo.minutos === null ? (
                  <span className="text-red-600 dark:text-red-400 font-semibold">no vuela</span>
                ) : (
                  `${Math.round(tramo.minutos)}′`
                )}
              </td>
              <td className="py-2.5 data text-zinc-600 dark:text-zinc-300">
                {tramo.litros === null ? "—" : fmt(tramo.litros, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
        CV curso verdadero · CM curso magnético · WCA corrección por viento · RM rumbo magnético a volar
      </p>
    </div>
  );
}

/**
 * De cuándo es el dato del AIP, y qué parte de él estamos usando.
 *
 * **El AIP se enmienda cada 28 días (ciclo AIRAC).** Un punto de aerovía sin fecha obliga
 * al piloto a suponer que sigue vigente, y lo que suponga va a ser optimista — es la misma
 * regla por la que la ficha de aeródromo muestra la edición de su AD 2.
 *
 * Lista **un renglón por documento**, y no uno solo, porque una ruta puede apoyarse en dos
 * a la vez: los puntos salen de ENR 4.4 y las aerovías de ENR 3. La primera versión
 * mostraba el primero que encontrara y dejaba al otro sin fecha.
 *
 * Va en la planilla impresa: es justo cuando la pantalla no está al lado que importa saber
 * de cuándo es lo que se está leyendo.
 */
/** Lo que se guarda entre sesiones: los números de la aeronave, no los del vuelo. */
interface PerformanceGuardada {
  tas: string;
  consumo: string;
  combustible: string;
  reserva: string;
}

const CLAVE_PERFORMANCE = "vector:planificador:performance";

/**
 * Guarda y restaura la performance tipeada.
 *
 * Sigue el molde de `Kneeboard.tsx`, que es el único otro lugar del repo que usa
 * `localStorage`: **no se lee durante el render** —no existe en el servidor y el HTML
 * no coincidiría— sino en un efecto después de montar, y todo va envuelto en
 * `try/catch` porque **Safari en modo privado tira al tocar storage**.
 *
 * Devuelve los valores restaurados una sola vez, para que el llamador los aplique.
 */
function usarPerformanceGuardada(actual: PerformanceGuardada) {
  const [listo, setListo] = useState(false);
  const [restaurada, setRestaurada] = useState<PerformanceGuardada | null>(null);

  useEffect(() => {
    try {
      const crudo = window.localStorage.getItem(CLAVE_PERFORMANCE);
      if (crudo) {
        const leido = JSON.parse(crudo) as Partial<PerformanceGuardada>;
        const texto = (v: unknown) => (typeof v === "string" ? v : "");
        setRestaurada({
          tas: texto(leido.tas),
          consumo: texto(leido.consumo),
          combustible: texto(leido.combustible),
          reserva: texto(leido.reserva) || "45",
        });
      }
    } catch {
      // Una entrada corrupta o ilegible no puede costarle la pantalla al piloto.
    }
    setListo(true);
  }, []);

  useEffect(() => {
    if (!listo) return;
    try {
      window.localStorage.setItem(CLAVE_PERFORMANCE, JSON.stringify(actual));
    } catch {
      // Sin espacio o en modo privado: se pierde la comodidad, no el plan.
    }
  }, [listo, actual]);

  return { listo, restaurada };
}

/**
 * "Esto lo resolvió el catálogo de a bordo."
 *
 * Aparece sólo cuando el service worker contestó `/api/puntos` sin llegar a la red. No
 * es una advertencia sobre la calidad del dato —es el mismo algoritmo y los mismos
 * datos del AIP— sino sobre **lo que falta**: el catálogo de a bordo tiene Argentina
 * sola, así que un código extranjero que con señal resuelve, sin señal no. Sin este
 * aviso, eso se lee como "el punto no existe".
 *
 * Dice además lo otro que no puede hacer sin red, y que es fácil de no notar: la
 * planilla se calcula igual —la geometría es toda del lado del cliente— pero el METAR,
 * el viento en altura y los NOTAM no llegan.
 */
function CatalogoDeBordo() {
  const local = useSyncExternalStore(suscribirOrigen, leerOrigenLocal, () => false);
  if (!local) return null;

  return (
    <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-relaxed mb-2">
      <span className="font-semibold">Resuelto con el catálogo a bordo.</span> Sin señal
      Vector usa los datos guardados en el teléfono: la planilla se calcula igual, pero
      sólo conoce aeródromos argentinos y no puede traer METAR ni NOTAM.
    </p>
  );
}

function VigenciaAip({
  puntos,
  refs,
}: {
  puntos: PuntoRuta[];
  refs: (PuntoResuelto | null)[];
}) {
  /*
    Las aerovías no están en `puntos` —ahí ya se abrieron en los puntos que aportan— así
    que su documento hay que buscarlo en las referencias sin expandir. Sin esto, una ruta
    por aerovía citaba ENR 4.4 y nunca ENR 3.
  */
  const porDocumento = new Map<string, NonNullable<PuntoRuta["vigencia"]>>();
  for (const v of [...puntos.map((p) => p.vigencia), ...refs.map((r) => r?.vigencia)]) {
    if (v && !porDocumento.has(v.documento)) porDocumento.set(v.documento, v);
  }
  if (porDocumento.size === 0) return null;

  const hayAerovia = refs.some((r) => r?.clase === "aerovia");

  return (
    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed space-y-1">
      {[...porDocumento.values()].map((v) => (
        <p key={v.documento}>
          {v.documento === "ENR 3" ? "Las aerovías" : "Los puntos de aerovía"} salen del{" "}
          <a
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-aviation-blue hover:underline"
          >
            AIP Argentina {v.documento}
          </a>
          , edición <span className="data font-semibold">{v.edicion}</span>, vigente desde{" "}
          <span className="data font-semibold">{v.vigenteDesde}</span>.
        </p>
      ))}
      {/*
        **Lo que la planilla NO sabe de la aerovía.** Un piloto que ve "W67" en una planilla
        podría suponer que alguien verificó que puede volarla a la altura que cargó. De la
        aerovía se usa por dónde pasa y nada más: los límites verticales, la clase de
        espacio aéreo y la dirección de los niveles de crucero están en ENR 3 y no se leen
        acá.
      */}
      {hayAerovia && (
        <p>
          De la aerovía se usa <strong>sólo por dónde pasa</strong>. Los niveles, la clase de espacio aéreo y
          la dirección de crucero hay que consultarlos aparte.
        </p>
      )}
      <p>El AIP se enmienda cada 28 días.</p>
    </div>
  );
}

/**
 * Qué sintonizar, cuando algún punto sale de una radioayuda.
 *
 * **Va en la planilla impresa, no atrás de un desplegable.** Es la razón por la que el
 * directorio de radioayudas existe: si un punto está definido como "25 NM en el radial
 * 045 de BAR", el número que hay que poner en el NAV es parte del punto, no un dato de
 * consulta. Buscarlo en la carta con el avión andando es justo lo que esta pantalla
 * viene a evitar.
 *
 * No se muestra nada cuando la ruta es toda de aeródromos, que es la mayoría.
 */
function Sintonizar({ puntos }: { puntos: PuntoRuta[] }) {
  // Una estación puede definir varios puntos —dos radiales del mismo VOR— y se sintoniza
  // una sola vez. Se listan por ident, en el orden en que aparecen en la ruta.
  const estaciones = new Map<string, NonNullable<PuntoRuta["estacion"]>>();
  for (const p of puntos) {
    if (p.estacion && !estaciones.has(p.estacion.ident)) estaciones.set(p.estacion.ident, p.estacion);
  }
  if (estaciones.size === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.03] px-4 py-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Sintonizar
      </p>
      <ul className="mt-2 space-y-1">
        {[...estaciones.values()].map((e) => (
          <li key={e.ident} className="flex items-baseline gap-2 text-xs">
            <span className="font-bold tracking-wider text-zinc-900 dark:text-white">{e.ident}</span>
            {e.frecuencia && (
              <span className="data font-semibold text-zinc-600 dark:text-zinc-300">{e.frecuencia}</span>
            )}
            <span className="text-zinc-400 dark:text-zinc-500 truncate">
              {e.tipo} · {e.nombre}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cómo se llama cada campo de la ruta.
 *
 * **Cuenta sólo los puntos, no las aerovías.** Si una banda ocupara un número, la ruta
 * `SADM · BCA · W67 · OSA` mostraría "Punto 4" arriba del tercer punto que se escribe, y
 * el piloto tendría que descontar mentalmente las bandas para saber dónde está.
 */
function etiquetaPunto(codigos: string[], i: number): string {
  if (i === 0) return "Salida";
  const esUltimo = codigos.slice(i + 1).every((c) => !c.trim());
  if (esUltimo) return "Llegada";
  const numero = codigos.slice(0, i + 1).filter((c) => !esAerovia(c)).length;
  return `Punto ${numero}`;
}

/** Grados de rumbo, siempre con tres dígitos: así se cantan y así se leen. */
function grados(valor: number): string {
  return String(Math.round(valor) % 360).padStart(3, "0");
}

function Total({
  label,
  valor,
  unidad,
  tono = "neutral",
}: {
  label: string;
  valor: string;
  unidad?: string;
  tono?: "neutral" | "bad";
}) {
  return (
    <div className="bg-zinc-50 dark:bg-white/[0.03] rounded-2xl p-4 border border-zinc-100 dark:border-white/5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold data leading-none ${
          tono === "bad" ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-white"
        }`}
      >
        {valor}
        {unidad && <span className="ml-1 text-sm font-bold text-zinc-400 dark:text-zinc-500">{unidad}</span>}
      </p>
    </div>
  );
}

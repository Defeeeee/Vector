"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  CloudOff,
  Copy,
  Download,
  Loader2,
  Mail,
  Phone,
  Save,
  Sparkles,
} from "lucide-react";
import fondoEana from "@/lib/plan-de-vuelo-eana.jpg";
import fondoDla from "@/lib/plan-de-vuelo-dla.png";
import fondoCnl from "@/lib/plan-de-vuelo-cnl.png";
import { cancelarPlan, duplicarPlan, enviarDemora, enviarPlan, guardarDemoras, marcarCancelado, guardarPerfilAvion, guardarPlan, marcarDescargado } from "@/actions/plan-de-vuelo";
import type { EnvioPlan } from "@/lib/plan-de-vuelo-servidor";
import { borradorParaRecuperar, claveBorrador, leerBorrador } from "@/lib/borrador-plan";
import {
  aplicarAvion,
  horaDeTexto,
  leerFormulario,
  localDesdeUtc,
  normalizar,
  revisar,
  salidaDelPlan,
  sugerirAutonomia,
  type FormularioPlan,
  type PerfilAvionPlan,
  type PilotoParaPlan,
  type Sugerencia,
} from "@/lib/formulario-plan";
import { asuntoDelMail, cuerpoDelMail, mensajeFpl, nombreDelArchivo, type Indicador18 } from "@/lib/plan-de-vuelo";
import {
  demoraDesdeHoraUtc,
  dofDeDemora,
  eobtVigente,
  MAXIMO_DEMORAS,
  nombreDeCancelacion,
  nombreDeDemora,
  planConDemora,
  planVigente,
  revisarDemora,
  type Demora,
} from "@/lib/demora-plan";
import { horarioAro, oficinaParaSalida, oficinasCercanas, primerTelefono, type OficinaUbicada } from "@/lib/oficinas-aro";
import CampoAerodromo from "./CampoAerodromo";
import MeteoDelVuelo from "./MeteoDelVuelo";
import { horariosDelPlan } from "@/lib/plan-cierre";
import FirmaPiloto from "./FirmaPiloto";
import EditorRuta from "./EditorRuta";
import { useRutaResuelta } from "./useRutaResuelta";

export interface AvionEditor {
  id: string;
  registration: string;
  icao: string;
  type: string;
  cruise_tas_kt?: number | null;
  fuel_burn_lph?: number | null;
  fuel_capacity_l?: number | null;
  plan_vuelo?: PerfilAvionPlan | null;
}

interface Props {
  id: string;
  formularioInicial: unknown;
  demorasIniciales: Demora[];
  aviones: AvionEditor[];
  piloto: PilotoParaPlan;
  firmaInicial: string | null;
  oficinas: OficinaUbicada[];
  /** La hora del server, para el primer render; después se actualiza en el navegador. */
  ahoraIso: string;
  /** Lo que ya se mandó por mail: pruebas y envíos a la oficina. */
  enviosIniciales: EnvioPlan[];
  /** Cuándo se canceló (CNL), si se canceló. */
  canceladoInicial: string | null;
  /** Si el envío a la oficina está prendido (`PLAN_DE_VUELO_ENVIO_ARO`). Hasta entonces, sólo la prueba. */
  envioAroActivo: boolean;
  /** Cuándo lo guardó el servidor por última vez: un borrador del teléfono más nuevo le gana. */
  actualizadoInicial: string | null;
}

/** "19/10 23:52Z": sin `toLocaleString`, igual en el server y en el navegador (invariante 1). */
function cuandoEnvio(iso?: string | null): string {
  if (!iso || iso.length < 16) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}Z`;
}

/* -------------------------------------------------------------------------- */
/* Estilos                                                                     */
/* -------------------------------------------------------------------------- */

const INPUT =
  "w-full bg-transparent py-2 text-sm font-bold data text-zinc-900 dark:text-white outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 placeholder:font-medium";

const BORDE: Record<string, string> = {
  ok: "border-emerald-300 dark:border-emerald-500/40",
  falta: "border-red-300 dark:border-red-500/40",
  error: "border-red-400 dark:border-red-500/60",
  opcional: "border-zinc-200 dark:border-white/10",
};

const INDICADORES: Indicador18[] = [
  "STS", "PBN", "NAV", "COM", "DAT", "SUR", "REG", "EET", "SEL", "TYP", "CODE", "DLE", "OPR", "ORGN", "PER", "RALT", "TALT", "RIF", "RMK",
];

/**
 * Una casilla. Es un `<label>` para que tocar en cualquier parte enfoque el campo, **salvo
 * con `sinLabel`**: un label reenvía el clic a su primer control, y en el campo de
 * aeródromo ese control es la "×" de borrar. Tocar el campo borraba el aeródromo, y elegir
 * una sugerencia también (Federico, 2026-10-19). Ahí va un `div`.
 */
function Campo({
  casilla,
  etiqueta,
  estado,
  delAvion,
  children,
  debajo,
  className = "",
  sinLabel = false,
}: {
  casilla?: string;
  etiqueta: string;
  estado?: string;
  delAvion?: boolean;
  children: ReactNode;
  /** Una sugerencia o una nota: va adentro de la casilla, abajo, para no correrla de su fila. */
  debajo?: ReactNode;
  className?: string;
  sinLabel?: boolean;
}) {
  const borde = BORDE[estado ?? "opcional"] ?? BORDE.opcional;
  const Contenedor = sinLabel ? "div" : "label";
  return (
    // El borde va en la caja de afuera, que estira a la altura de la fila: así las casillas de
    // un mismo renglón quedan parejas aunque una tenga una sugerencia y la otra no.
    <div
      className={`flex flex-col rounded-2xl border px-3.5 pt-2 pb-1 transition-colors ${borde} ${
        delAvion ? "bg-violet-50/60 dark:bg-violet-500/[0.06]" : "bg-white dark:bg-white/[0.02]"
      } ${className}`}
    >
      <Contenedor className="block min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {casilla && <span className="data font-bold text-zinc-400 dark:text-zinc-500 mr-1">{casilla}</span>}
            {etiqueta}
          </span>
          {estado === "ok" && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
          {(estado === "falta" || estado === "error") && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
        </span>
        {children}
      </Contenedor>
      {debajo && <div className="pb-1.5">{debajo}</div>}
    </div>
  );
}

/**
 * Una hora en UTC con cuatro cifras (`1830`), escrita como texto y no con el reloj del
 * navegador: el `<input type="time">` con el teléfono en 12 horas no da valor hasta elegir
 * AM o PM, y Federico la veía escrita mientras el plan decía que faltaba (2026-10-19).
 * Acepta `1830` y `18:30`; al salir del campo queda con cuatro cifras.
 */
function HoraUtc({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => {
    // Lo que cambie desde afuera (duplicar, otro dispositivo) se refleja, salvo mientras se escribe.
    setTexto((t) => (horaDeTexto(t)?.replace(":", "") === valor ? t : valor));
  }, [valor]);
  return (
    <input
      value={texto}
      onChange={(ev) => {
        setTexto(ev.target.value);
        onCambio(ev.target.value);
      }}
      onBlur={() => {
        const h = horaDeTexto(texto);
        if (h) setTexto(h.replace(":", ""));
      }}
      placeholder={placeholder}
      inputMode="numeric"
      maxLength={5}
      className={INPUT}
    />
  );
}

function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.015] p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Sugerido({ s, onUsar, actual }: { s: Sugerencia | null; onUsar: () => void; actual: string }) {
  if (!s) return null;
  const igual = s.valor === actual;
  return (
    <button
      type="button"
      onClick={onUsar}
      disabled={igual}
      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 disabled:opacity-60 transition-colors text-left"
    >
      <Sparkles className="w-3 h-3 shrink-0" />
      <span>
        Sugerido <span className="data font-bold">{s.valor}</span> · {s.motivo}
        {!igual && <span className="ml-1 underline underline-offset-2">usar</span>}
      </span>
    </button>
  );
}

function Tilde({ activo, onChange, children }: { activo: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
      <input type="checkbox" checked={activo} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-zinc-900 dark:accent-white" />
      {children}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* El editor                                                                   */
/* -------------------------------------------------------------------------- */

export default function EditorPlanDeVuelo({
  id,
  formularioInicial,
  demorasIniciales,
  aviones,
  piloto,
  firmaInicial,
  oficinas,
  ahoraIso: ahoraServer,
  enviosIniciales,
  canceladoInicial,
  envioAroActivo,
  actualizadoInicial,
}: Props) {
  const [f, setF] = useState<FormularioPlan>(() => leerFormulario(formularioInicial));
  const [guardado, setGuardado] = useState<"guardado" | "guardando" | "error">("guardado");
  // Sin señal (2026-10-23): lo escrito queda en el teléfono y se sube al volver la red.
  const [sinSenal, setSinSenal] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  const [ahoraIso, setAhoraIso] = useState(ahoraServer);
  const [firma, setFirma] = useState<string | null>(firmaInicial);
  const [demoras, setDemoras] = useState<Demora[]>(demorasIniciales);
  const [pdf, setPdf] = useState<"" | "armando" | "error">("");
  const [envios, setEnvios] = useState<EnvioPlan[]>(enviosIniciales);
  const [envio, setEnvio] = useState<{ estado: "" | "mandando" | "listo" | "error"; texto?: string }>({ estado: "" });

  /**
   * Manda el plan por mail desde el server, a la oficina con copia al piloto. Antes de
   * mandar se espera el guardado pendiente, para que el mail salga con lo último que se
   * escribió. La prueba al piloto existe en el server (`enviarPlan(id, "prueba")`), pero la
   * pantalla ya no la ofrece (Federico, 2026-10-20).
   */
  const mandar = async () => {
    if (!oficina || !window.confirm(`¿Mandar el plan a ${oficina.correo} (ARO/AIS ${oficina.nombre})? Te llega una copia.`)) return;
    setEnvio({ estado: "mandando" });
    await esperarGuardado();
    const res = await enviarPlan(id, "aro");
    if ("error" in res) {
      setEnvio({ estado: "error", texto: res.error });
      return;
    }
    setEnvios((e) => [...e, { modo: "aro", tipo: "fpl", a: res.a, at: new Date().toISOString() }]);
    setEnvio({ estado: "listo", texto: `Mandado a ${res.a}, con copia a ${res.cc.join(", ")}. Ahora llamá para confirmar que lo recibieron.` });
  };
  const [perfilGuardado, setPerfilGuardado] = useState<"" | "guardando" | "listo" | "error">("");
  const [indicadoresAbiertos, setIndicadoresAbiertos] = useState<Set<string>>(() => new Set(Object.keys(f.otros)));
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef(f);

  // La hora real del navegador, después de montar: para avisar si la salida ya pasó.
  useEffect(() => {
    setAhoraIso(new Date().toISOString());
    const i = setInterval(() => setAhoraIso(new Date().toISOString()), 60_000);
    // El fondo del formulario se pide al abrir: queda en el cache del service worker.
    fetch(fondoEana.src).catch(() => {});
    return () => clearInterval(i);
  }, []);

  const guardar = useCallback(async () => {
    temporizador.current = null;
    setGuardado("guardando");
    const enviado = ultimo.current;
    const promesa = guardarPlan(id, enviado);
    // Lo que esté en vuelo, para que mandar el plan por mail espere a que llegue.
    enCurso.current = promesa.then(() => undefined);
    const r = await promesa;
    if ("error" in r) {
      // Sin conexión o el servidor no contestó: se reintenta solo, no espera a que el piloto
      // vuelva a escribir.
      setGuardado("error");
      if (!temporizador.current) temporizador.current = setTimeout(() => void guardarRef.current(), 5000);
      return;
    }
    setGuardado("guardado");
    // Ya está en el servidor: el borrador del teléfono sobra, salvo que se haya seguido escribiendo.
    if (ultimo.current === enviado) {
      try {
        localStorage.removeItem(claveBorrador(id));
      } catch {
        /* sin almacenamiento, no había borrador */
      }
    }
  }, [id]);
  const enCurso = useRef<Promise<void> | null>(null);
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;

  const cambiar = useCallback(
    (cambio: Partial<FormularioPlan> | ((prev: FormularioPlan) => FormularioPlan)) => {
      setF((prev) => {
        const nuevo = normalizar(typeof cambio === "function" ? cambio(prev) : { ...prev, ...cambio });
        ultimo.current = nuevo;
        // En el teléfono también, por si no hay señal o se cierra la app (`borrador-plan.ts`).
        try {
          localStorage.setItem(claveBorrador(id), JSON.stringify({ formulario: nuevo, at: new Date().toISOString() }));
        } catch {
          /* sin almacenamiento: queda el guardado en el servidor */
        }
        return nuevo;
      });
      setGuardado("guardando");
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(guardar, 1500);
    },
    [guardar, id]
  );

  /*
    Al abrir: si el teléfono tiene un borrador más nuevo que lo del servidor (se escribió sin
    señal y no llegó a subir), se recupera y se sube. Y al volver la señal, se sube lo pendiente
    sin esperar el reintento.
  */
  useEffect(() => {
    let texto: string | null = null;
    try {
      texto = localStorage.getItem(claveBorrador(id));
    } catch {
      /* sin almacenamiento, no hay borrador */
    }
    const recuperar = borradorParaRecuperar(leerBorrador<FormularioPlan>(texto), actualizadoInicial);
    if (recuperar) {
      const f2 = normalizar(leerFormulario(recuperar));
      ultimo.current = f2;
      setF(f2);
      setRecuperado(true);
      setGuardado("guardando");
      void guardarRef.current();
    }
    const enLinea = () => {
      setSinSenal(false);
      void guardarRef.current();
    };
    const sinLinea = () => setSinSenal(true);
    setSinSenal(!navigator.onLine);
    window.addEventListener("online", enLinea);
    window.addEventListener("offline", sinLinea);
    // El código del PDF y los formularios de la demora y la cancelación, ya: así se puede armar sin señal.
    void import("@/lib/plan-de-vuelo-pdf").catch(() => {});
    for (const fondo of [fondoDla.src, fondoCnl.src]) fetch(fondo).catch(() => {});
    return () => {
      window.removeEventListener("online", enLinea);
      window.removeEventListener("offline", sinLinea);
    };
    // Sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Que no se pierda lo último si se cierra la pestaña con el guardado pendiente.
  useEffect(() => {
    const antes = () => {
      if (temporizador.current) void guardar();
    };
    window.addEventListener("pagehide", antes);
    return () => window.removeEventListener("pagehide", antes);
  }, [guardar]);

  const r = useMemo(() => revisar(f, ahoraIso), [f, ahoraIso]);
  const avion = aviones.find((a) => a.id === f.aircraftId) ?? null;
  const rutaResuelta = useRutaResuelta(f, avion?.cruise_tas_kt ?? null);
  const { sugerencia: sugEet, nota: notaEet } = rutaResuelta;
  const sugAutonomia: Sugerencia | null =
    f.sugerencias.autonomia ??
    (avion?.fuel_capacity_l && avion.fuel_burn_lph
      ? sugerirAutonomia(avion.fuel_capacity_l, avion.fuel_burn_lph, "con los tanques llenos")
      : null);

  const sugerida = useMemo(() => (f.salida ? oficinaParaSalida(f.salida, oficinas) : null), [f.salida, oficinas]);
  const cercanas = useMemo(() => (f.salida ? oficinasCercanas(f.salida, oficinas) : []), [f.salida, oficinas]);
  const oficina = oficinas.find((o) => o.oaci === f.oficina) ?? sugerida?.oficina ?? null;
  const telOficina = oficina ? primerTelefono(oficina.telefonos) : null;
  const horario = oficina ? horarioAro(oficina.horario, f.eobtUtc || undefined) : null;
  const e = r.estados;
  const utc = salidaDelPlan(f);
  const local = utc ? localDesdeUtc(f.dofUtc, f.eobtUtc) : null;
  const listo = r.completo && !!firma;

  /* ------------------------------------------------------------ el PDF ---- */

  const generar = async (): Promise<File | null> => {
    setPdf("armando");
    try {
      const [{ pdfPlanDeVuelo }, fondo] = await Promise.all([
        import("@/lib/plan-de-vuelo-pdf"),
        fetch(fondoEana.src).then((x) => x.arrayBuffer()),
      ]);
      const firmaPng = firma ? new Uint8Array(await (await fetch(firma)).arrayBuffer()) : undefined;
      const bytes = await pdfPlanDeVuelo(r.plan, { fondoJpg: new Uint8Array(fondo), firmaPng });
      setPdf("");
      void marcarDescargado(id);
      return new File([bytes as BlobPart], nombreDelArchivo(r.plan), { type: "application/pdf" });
    } catch {
      setPdf("error");
      return null;
    }
  };

  const bajarArchivo = (archivo: File) => {
    const url = URL.createObjectURL(archivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /** Que el mail salga con lo último que se escribió: el guardado pendiente y el que está en vuelo. */
  async function esperarGuardado() {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      await guardar();
    } else if (enCurso.current) {
      await enCurso.current;
    }
  }

  /* ------------------------------------------------- guardar en el avión -- */

  const guardarEnAvion = async () => {
    if (!avion) return;
    setPerfilGuardado("guardando");
    const res = await guardarPerfilAvion(avion.id, {
      ...(avion.plan_vuelo ?? {}),
      estela: f.estela,
      equipo: f.equipo.trim().toUpperCase(),
      vigilancia: f.vigilancia.trim().toUpperCase(),
      nav: f.otros.NAV ?? "",
      pbn: f.otros.PBN ?? "",
      opr: f.otros.OPR ?? "",
      per: f.otros.PER ?? "",
      colorMarcas: f.colorMarcas,
      elt: f.radio.e,
      radioUhf: f.radio.u,
      radioVhf: f.radio.v,
    });
    setPerfilGuardado("error" in res ? "error" : "listo");
  };

  /* ---------------------------------------------------------- la demora -- */

  const [horaDemora, setHoraDemora] = useState("");
  const [demoraEstado, setDemoraEstado] = useState<{ estado: "" | "armando" | "mandando" | "listo" | "error"; texto?: string }>({ estado: "" });
  const vigente = eobtVigente(f, demoras);
  const demoraNueva = horaDemora ? demoraDesdeHoraUtc(f, demoras, horaDemora) : null;
  const chequeoDemora = revisarDemora(f, demoras, ahoraIso);
  const ocupadoDemora = demoraEstado.estado === "armando" || demoraEstado.estado === "mandando";

  /** Baja el formulario de demora y la anota (una de las tres del 7.3). */
  const bajarDemora = async () => {
    if (!demoraNueva) return;
    setDemoraEstado({ estado: "armando" });
    try {
      const plan = planConDemora(r.plan, demoraNueva);
      const [{ pdfDemora }, fondo] = await Promise.all([
        import("@/lib/plan-de-vuelo-pdf"),
        fetch(fondoDla.src).then((x) => x.arrayBuffer()),
      ]);
      const firmaPng = firma ? new Uint8Array(await (await fetch(firma)).arrayBuffer()) : undefined;
      const bytes = await pdfDemora(
        { plan, eobt: demoraNueva.eobt, c18: plan.c18, nombre: (piloto.nombre || f.piloto).toUpperCase(), licencia: piloto.licencia ?? "" },
        { fondoPng: new Uint8Array(fondo), firmaPng }
      );
      const nuevas = [...demoras, { ...demoraNueva, creada: new Date().toISOString() }];
      const g = await guardarDemoras(id, nuevas);
      if (!("error" in g)) setDemoras(nuevas);
      bajarArchivo(new File([bytes as BlobPart], nombreDeDemora(r.plan, demoraNueva), { type: "application/pdf" }));
      setHoraDemora("");
      setDemoraEstado({ estado: "" });
    } catch {
      setDemoraEstado({ estado: "error", texto: "No se pudo armar la demora." });
    }
  };

  /** Manda la demora por mail desde el server, a la misma oficina que el plan. */
  const mandarDemora = async () => {
    if (!demoraNueva || !oficina) return;
    if (!window.confirm(`¿Mandar la demora a las ${demoraNueva.eobt}Z a ${oficina.correo} (ARO/AIS ${oficina.nombre})? Te llega una copia.`)) return;
    setDemoraEstado({ estado: "mandando" });
    await esperarGuardado();
    const res = await enviarDemora(id, "aro", horaDemora);
    if ("error" in res) {
      setDemoraEstado({ estado: "error", texto: res.error });
      return;
    }
    setEnvios((e) => [...e, { modo: "aro", tipo: "dla", a: res.a, at: new Date().toISOString() }]);
    setDemoras(res.demoras);
    setHoraDemora("");
    setDemoraEstado({
      estado: "listo",
      texto: `Demora a las ${res.eobt}Z mandada a ${res.a}, con copia a ${res.cc.join(", ")}. Llamá para confirmar que la recibieron.`,
    });
  };

  /* ------------------------------------------------------- la cancelación -- */

  const [cancelado, setCancelado] = useState<string | null>(canceladoInicial);
  const [cancelacion, setCancelacion] = useState<{ estado: "" | "armando" | "mandando" | "listo" | "error"; texto?: string }>({ estado: "" });
  const ocupadoCancelacion = cancelacion.estado === "armando" || cancelacion.estado === "mandando";

  /** Manda la cancelación (CNL) desde el server a la misma oficina que el plan. */
  const mandarCancelacion = async () => {
    if (!oficina) return;
    if (!window.confirm(`¿Cancelar el plan y mandar la cancelación a ${oficina.correo} (ARO/AIS ${oficina.nombre})? Te llega una copia.`)) return;
    setCancelacion({ estado: "mandando" });
    await esperarGuardado();
    const res = await cancelarPlan(id, "aro");
    if ("error" in res) {
      setCancelacion({ estado: "error", texto: res.error });
      return;
    }
    const ahora = new Date().toISOString();
    setEnvios((e) => [...e, { modo: "aro", tipo: "cnl", a: res.a, at: ahora }]);
    setCancelado(ahora);
    setCancelacion({ estado: "listo", texto: `Cancelación mandada a ${res.a}, con copia a ${res.cc.join(", ")}. Llamá para confirmar que la recibieron.` });
  };

  /** Baja el formulario de cancelación, para mandarlo a mano, y anota el plan como cancelado. */
  const bajarCancelacion = async () => {
    if (!window.confirm("¿Bajar la cancelación? El plan queda cancelado en Vector.")) return;
    setCancelacion({ estado: "armando" });
    try {
      const plan = planVigente(r.plan, demoras);
      const [{ pdfCancelacion }, fondo] = await Promise.all([
        import("@/lib/plan-de-vuelo-pdf"),
        fetch(fondoCnl.src).then((x) => x.arrayBuffer()),
      ]);
      const firmaPng = firma ? new Uint8Array(await (await fetch(firma)).arrayBuffer()) : undefined;
      const bytes = await pdfCancelacion(
        { plan, eobt: plan.c13hora, c18: plan.c18, nombre: (piloto.nombre || f.piloto).toUpperCase(), licencia: piloto.licencia ?? "" },
        { fondoPng: new Uint8Array(fondo), firmaPng }
      );
      bajarArchivo(new File([bytes as BlobPart], nombreDeCancelacion(r.plan, demoras), { type: "application/pdf" }));
      const g = await marcarCancelado(id);
      if (!("error" in g)) setCancelado(new Date().toISOString());
      setCancelacion({ estado: "" });
    } catch {
      setCancelacion({ estado: "error", texto: "No se pudo armar la cancelación." });
    }
  };

  /* ----------------------------------------------- meteo y NOTAM a tu hora -- */

  // La salida vigente (con la última demora) y la llegada estimada, para recortar el TAF y
  // cruzar los NOTAM. Las horas viajan en ISO al server; acá no se muestran (invariante 1).
  const meteo = useMemo(() => {
    const h = horariosDelPlan(f, demoras);
    const codigo = (a: { codigo: string } | null) => {
      const c = a?.codigo?.trim().toUpperCase() ?? "";
      return /^[A-Z0-9]{3,4}$/.test(c) ? c : null;
    };
    const aerodromos = [
      { rol: "salida" as const, codigo: codigo(f.salida) },
      { rol: "destino" as const, codigo: codigo(f.destino) },
      { rol: "alternativa" as const, codigo: codigo(f.altn1) },
      { rol: "alternativa" as const, codigo: codigo(f.altn2) },
    ].filter((a): a is { rol: "salida" | "destino" | "alternativa"; codigo: string } => !!a.codigo);
    if (!h || aerodromos.length === 0) return null;
    // Un destino igual a la salida (un local) no se pide dos veces.
    const unicos = aerodromos.filter((a, i) => aerodromos.findIndex((b) => b.codigo === a.codigo) === i);
    return { aerodromos: unicos, salidaIso: new Date(h.salidaMs).toISOString(), llegadaIso: new Date(h.llegadaMs).toISOString() };
  }, [f, demoras]);

  /* ------------------------------------------------------------ render ---- */

  const cambiarOtro = (ind: Indicador18, valor: string) =>
    cambiar((prev) => {
      const otros = { ...prev.otros, [ind]: valor };
      const origen = { ...prev.origen };
      delete origen[`otros.${ind}`];
      return { ...prev, otros, origen };
    });

  const autoOtros = useMemo(() => {
    const auto: Partial<Record<Indicador18, string>> = {};
    for (const parte of r.plan.c18.split(/ (?=[A-Z]{2,4}\/)/)) {
      const m = /^([A-Z]{2,4})\/(.*)$/.exec(parte);
      if (m && ["DEP", "DEST", "ALTN", "DOF"].includes(m[1])) auto[m[1] as Indicador18] = m[2];
    }
    return auto;
  }, [r.plan.c18]);

  return (
    <div className="space-y-6 pb-16">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/plan-de-vuelo" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Planes
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {guardado === "guardando" && (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>)}
          {guardado === "guardado" && (<><Check className="w-3.5 h-3.5 text-emerald-500" /> Guardado</>)}
          {guardado === "error" &&
            (sinSenal ? (
              <><CloudOff className="w-3.5 h-3.5 text-amber-500" /> Sin señal: guardado en este teléfono</>
            ) : (
              <><CloudOff className="w-3.5 h-3.5 text-amber-500" /> Sin guardar: reintentando…</>
            ))}
        </span>
      </div>

      {(sinSenal || recuperado) && (
        <p className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          {sinSenal
            ? "Sin señal. Podés seguir armando el plan y bajar el PDF: lo que escribas queda en este teléfono y se sube solo cuando vuelva la señal. Para mandarlo a la oficina hace falta señal."
            : "Recuperamos lo que escribiste sin señal y ya lo estamos subiendo."}
        </p>
      )}

      <div className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-2xl md:text-3xl font-display font-bold text-zinc-900 dark:text-white">
            <span className="data">{r.plan.c13ad || "????"}</span>
            <ArrowRight className="w-5 h-5 text-zinc-400" />
            <span className="data">{r.plan.c16ad || "????"}</span>
          </p>
          <p className="data text-sm text-zinc-500 dark:text-zinc-400">
            {r.plan.c7 || "—"} · {r.plan.c9tipo || "—"}/{f.reglas} · EOBT {r.plan.c13hora || "????"}Z · ETE {r.plan.c16eet || "????"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${r.completo ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${r.porcentaje}%` }} />
          </div>
          <span className={`data text-xs font-bold ${r.completo ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}>
            {r.completo ? "Completo" : `${r.porcentaje}%`}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-emerald-300" /> Completo</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-zinc-300 bg-violet-100 dark:bg-violet-500/20" /> Lo llenó Vector (avión o planificador)</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-red-300" /> Falta o está mal</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-6 items-start">
        <div className="space-y-6">
          {/* 7 a 10 */}
          <Seccion
            titulo="Aeronave · casillas 7 a 10"
            accion={
              avion && (
                <button
                  type="button"
                  onClick={guardarEnAvion}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  {perfilGuardado === "guardando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : perfilGuardado === "listo" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
                  {perfilGuardado === "listo" ? `Guardado en ${avion.registration}` : `Guardar en ${avion.registration}`}
                </button>
              )
            }
          >
            {aviones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aviones.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => cambiar((prev) => aplicarAvion(prev, a, piloto))}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border data transition-colors ${
                      a.id === f.aircraftId
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
                        : "border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400"
                    }`}
                  >
                    {a.registration}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo casilla="7" etiqueta="Matrícula" estado={e.matricula} delAvion={f.origen.matricula === "avion"} className="col-span-2 md:col-span-1">
                <input value={f.matricula} onChange={(ev) => cambiar({ matricula: ev.target.value })} placeholder="LV-S114" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="8" etiqueta="Reglas" estado={e.reglas}>
                <select value={f.reglas} onChange={(ev) => cambiar({ reglas: ev.target.value })} className={INPUT}>
                  <option value="V">V · VFR</option>
                  <option value="I">I · IFR</option>
                  <option value="Y">Y · IFR → VFR</option>
                  <option value="Z">Z · VFR → IFR</option>
                </select>
              </Campo>
              <Campo casilla="8" etiqueta="Tipo de vuelo" estado={e.tipoVuelo}>
                <select value={f.tipoVuelo} onChange={(ev) => cambiar({ tipoVuelo: ev.target.value })} className={INPUT}>
                  <option value="G">G · General</option>
                  <option value="N">N · No regular</option>
                  <option value="S">S · Regular</option>
                  <option value="M">M · Militar</option>
                  <option value="X">X · Otro</option>
                </select>
              </Campo>
              <Campo casilla="9" etiqueta="Número" estado={e.numero}>
                <input value={f.numero} onChange={(ev) => cambiar({ numero: ev.target.value })} placeholder="Sólo si son 2+" className={INPUT} inputMode="numeric" />
              </Campo>
              <Campo casilla="9" etiqueta="Tipo OACI" estado={e.tipoAeronave} delAvion={f.origen.tipoAeronave === "avion"}>
                <input value={f.tipoAeronave} onChange={(ev) => cambiar({ tipoAeronave: ev.target.value })} placeholder="C152" maxLength={4} className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="9" etiqueta="Estela" estado={e.estela}>
                <select value={f.estela} onChange={(ev) => cambiar({ estela: ev.target.value })} className={INPUT}>
                  <option value="L">L · Ligera</option>
                  <option value="M">M · Media</option>
                  <option value="H">H · Pesada</option>
                  <option value="J">J · Súper</option>
                </select>
              </Campo>
              <Campo casilla="10a" etiqueta="Equipo" estado={e.equipo} delAvion={f.origen.equipo === "avion"}>
                <input value={f.equipo} onChange={(ev) => cambiar({ equipo: ev.target.value })} placeholder="SDGZ" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="10b" etiqueta="Transponder" estado={e.vigilancia} delAvion={f.origen.vigilancia === "avion"}>
                <input value={f.vigilancia} onChange={(ev) => cambiar({ vigilancia: ev.target.value })} placeholder="C, EB2" className={`${INPUT} uppercase`} />
              </Campo>
            </div>
            {!avion?.plan_vuelo?.equipo && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                10a: S = VHF, VOR e ILS; D DME, F ADF, G GPS, Z otro (va en NAV/). 10b: N sin transponder, C modo C, S modo S,
                E modo S con ADS-B; B1/B2 ADS-B. {avion ? `Con "Guardar en ${avion.registration}" queda para la próxima.` : ""}
              </p>
            )}
          </Seccion>

          {/* 13 y 15 */}
          <Seccion titulo="Salida y ruta · casillas 13 y 15">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Campo casilla="13" etiqueta="Aeródromo de salida" estado={e.salida} sinLabel>
                <CampoAerodromo valor={f.salida} onCambio={(a) => cambiar({ salida: a, oficina: "" })} placeholder="SADF o nombre" claseInput={INPUT} />
              </Campo>
              <Campo casilla="13" etiqueta="Fecha (DOF, UTC)" estado={e.fecha}>
                <input type="date" value={f.dofUtc} onChange={(ev) => cambiar({ dofUtc: ev.target.value })} className={INPUT} />
              </Campo>
              <Campo
                casilla="13"
                etiqueta="EOBT (UTC)"
                estado={e.hora}
                debajo={
                  local ? (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {local.hora} hora argentina{local.fecha !== f.dofUtc ? ` del ${local.fecha.slice(8)}/${local.fecha.slice(5, 7)}` : ""}
                    </p>
                  ) : undefined
                }
              >
                <HoraUtc valor={f.eobtUtc} onCambio={(v) => cambiar({ eobtUtc: v })} placeholder="1830" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo casilla="15" etiqueta="Velocidad" estado={e.velocidad} delAvion={f.origen.velocidad === "planificador"}>
                <input value={f.velocidad} onChange={(ev) => cambiar({ velocidad: ev.target.value })} placeholder="N0090" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="15" etiqueta="Nivel" estado={e.nivel}>
                <input value={f.nivel} onChange={(ev) => cambiar({ nivel: ev.target.value })} placeholder="A015 o VFR" className={`${INPUT} uppercase`} />
              </Campo>

            </div>
            <EditorRuta
              ruta={f.ruta}
              salida={f.salida}
              destino={f.destino}
              nodos={rutaResuelta.nodos}
              cache={rutaResuelta.cache}
              estado={e.ruta}
              onCambio={(ruta) => cambiar({ ruta })}
            />
            {!avion?.cruise_tas_kt && !f.velocidad && (
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                La velocidad es la TAS de crucero, en nudos con N y cuatro cifras: 90 kt es N0090.
              </p>
            )}
          </Seccion>

          {/* 16 */}
          <Seccion titulo="Destino · casilla 16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo casilla="16" etiqueta="Destino" estado={e.destino} className="col-span-2 md:col-span-1" sinLabel>
                <CampoAerodromo valor={f.destino} onCambio={(a) => cambiar({ destino: a })} placeholder="SAAK o nombre" claseInput={INPUT} />
              </Campo>
              <Campo
                casilla="16"
                etiqueta="Duración total (EET)"
                estado={e.eet}
                className="col-span-2 md:col-span-1"
                debajo={<Sugerido s={sugEet} actual={f.eet} onUsar={() => sugEet && cambiar({ eet: sugEet.valor })} />}
              >
                <input value={f.eet} onChange={(ev) => cambiar({ eet: ev.target.value })} placeholder="0035" maxLength={4} className={INPUT} inputMode="numeric" />
              </Campo>
              <Campo casilla="16" etiqueta="Alternativa" estado={e.altn1} sinLabel>
                <CampoAerodromo valor={f.altn1} onCambio={(a) => cambiar({ altn1: a })} placeholder="SADM" claseInput={INPUT} />
              </Campo>
              <Campo casilla="16" etiqueta="2ª alternativa" estado={e.altn2} sinLabel>
                <CampoAerodromo valor={f.altn2} onCambio={(a) => cambiar({ altn2: a })} placeholder="Opcional" claseInput={INPUT} alinear="derecha" />
              </Campo>
            </div>
            {!sugEet && notaEet && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{notaEet}</p>}
          </Seccion>

          {/* 18 */}
          <Seccion titulo="Otros datos · casilla 18">
            <div className="flex flex-wrap gap-1.5">
              {INDICADORES.map((ind) => {
                const activo = indicadoresAbiertos.has(ind) || !!f.otros[ind];
                return (
                  <button
                    key={ind}
                    type="button"
                    onClick={() =>
                      setIndicadoresAbiertos((s) => {
                        const n = new Set(s);
                        if (activo && !f.otros[ind]) n.delete(ind);
                        else n.add(ind);
                        return n;
                      })
                    }
                    className={`data px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                      activo ? "border-emerald-400 text-emerald-700 dark:text-emerald-300" : "border-zinc-200 dark:border-white/10 text-zinc-500"
                    }`}
                  >
                    {ind}/
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(autoOtros).map(([ind, valor]) => (
                <div key={ind} className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 px-3.5 py-2">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    <span className="data font-bold">{ind}/</span> · lo arma Vector
                  </span>
                  <p className="data text-sm font-bold text-zinc-700 dark:text-zinc-300 py-1">{valor}</p>
                </div>
              ))}
              {INDICADORES.filter((ind) => indicadoresAbiertos.has(ind) || f.otros[ind]).map((ind) => (
                <Campo key={ind} etiqueta={`${ind}/`} estado={f.otros[ind] ? "ok" : "opcional"} delAvion={f.origen[`otros.${ind}`] === "avion"}>
                  {ind === "PER" ? (
                    <select value={f.otros.PER ?? ""} onChange={(ev) => cambiarOtro("PER", ev.target.value)} className={INPUT}>
                      <option value="">—</option>
                      <option value="A">A · menos de 91 kt en el umbral</option>
                      <option value="B">B · 91 a 120 kt</option>
                      <option value="C">C · 121 a 140 kt</option>
                      <option value="D">D · 141 a 165 kt</option>
                      <option value="E">E · más de 165 kt</option>
                    </select>
                  ) : (
                    <input value={f.otros[ind] ?? ""} onChange={(ev) => cambiarOtro(ind, ev.target.value)} className={`${INPUT} uppercase`} />
                  )}
                </Campo>
              ))}
            </div>
            {r.errores.filter((x) => x.campo.startsWith("otros")).map((x) => (
              <p key={x.campo} className="text-xs text-red-600 dark:text-red-400">{x.mensaje}</p>
            ))}
          </Seccion>

          {/* 19 */}
          <Seccion titulo="Información suplementaria · casilla 19">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo
                casilla="E/"
                etiqueta="Autonomía"
                estado={e.autonomia}
                className="col-span-2 md:col-span-1"
                debajo={<Sugerido s={sugAutonomia} actual={f.autonomia} onUsar={() => sugAutonomia && cambiar({ autonomia: sugAutonomia.valor })} />}
              >
                <input value={f.autonomia} onChange={(ev) => cambiar({ autonomia: ev.target.value })} placeholder="0400" maxLength={4} className={INPUT} inputMode="numeric" />
              </Campo>
              <Campo casilla="P/" etiqueta="Personas a bordo" estado={e.personas}>
                <input value={f.personas} onChange={(ev) => cambiar({ personas: ev.target.value })} placeholder="2 o TBN" maxLength={3} className={`${INPUT} uppercase`} />
              </Campo>
            </div>
            <div className="space-y-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4">
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Lo que no se marca sale tachado en el formulario, como pide la AIP.</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span className="data text-xs font-bold text-zinc-400 w-8">R/</span>
                <Tilde activo={f.radio.e} onChange={(v) => cambiar((p) => ({ ...p, radio: { ...p.radio, e: v } }))}>ELT</Tilde>
                <Tilde activo={f.radio.v} onChange={(v) => cambiar((p) => ({ ...p, radio: { ...p.radio, v: v } }))}>Radio de emergencia VHF 121,5</Tilde>
                <Tilde activo={f.radio.u} onChange={(v) => cambiar((p) => ({ ...p, radio: { ...p.radio, u: v } }))}>UHF 243,0</Tilde>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span className="data text-xs font-bold text-zinc-400 w-8">S/</span>
                <Tilde activo={f.supervivencia.s} onChange={(v) => cambiar((p) => ({ ...p, supervivencia: { ...p.supervivencia, s: v } }))}>Equipo de supervivencia</Tilde>
                {f.supervivencia.s &&
                  (["p", "d", "m", "j"] as const).map((k) => (
                    <Tilde key={k} activo={f.supervivencia[k]} onChange={(v) => cambiar((p) => ({ ...p, supervivencia: { ...p.supervivencia, [k]: v } }))}>
                      {{ p: "Polar", d: "Desierto", m: "Marítimo", j: "Selva" }[k]}
                    </Tilde>
                  ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <span className="data text-xs font-bold text-zinc-400 w-8">J/</span>
                <Tilde activo={f.chalecos.j} onChange={(v) => cambiar((p) => ({ ...p, chalecos: { ...p.chalecos, j: v } }))}>Chalecos salvavidas</Tilde>
                {f.chalecos.j &&
                  (["l", "f", "u", "v"] as const).map((k) => (
                    <Tilde key={k} activo={f.chalecos[k]} onChange={(v) => cambiar((p) => ({ ...p, chalecos: { ...p.chalecos, [k]: v } }))}>
                      {{ l: "Con luz", f: "Fluoresceína", u: "UHF", v: "VHF" }[k]}
                    </Tilde>
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="data text-xs font-bold text-zinc-400 w-8">D/</span>
                <Tilde activo={f.botes.d} onChange={(v) => cambiar((p) => ({ ...p, botes: { ...p.botes, d: v } }))}>Botes neumáticos</Tilde>
                {f.botes.d && (
                  <>
                    <input value={f.botes.numero} onChange={(ev) => cambiar((p) => ({ ...p, botes: { ...p.botes, numero: ev.target.value } }))} placeholder="Cantidad" className={`${INPUT} w-24 border-b border-zinc-200`} />
                    <input value={f.botes.capacidad} onChange={(ev) => cambiar((p) => ({ ...p, botes: { ...p.botes, capacidad: ev.target.value } }))} placeholder="Capacidad" className={`${INPUT} w-24 border-b border-zinc-200`} />
                    <Tilde activo={f.botes.c} onChange={(v) => cambiar((p) => ({ ...p, botes: { ...p.botes, c: v } }))}>Cubiertos</Tilde>
                    <input value={f.botes.color} onChange={(ev) => cambiar((p) => ({ ...p, botes: { ...p.botes, color: ev.target.value } }))} placeholder="Color" className={`${INPUT} w-32 border-b border-zinc-200`} />
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Campo casilla="A/" etiqueta="Color y marcas del avión" estado={e.colorMarcas} delAvion={f.origen.colorMarcas === "avion"}>
                <input value={f.colorMarcas} onChange={(ev) => cambiar({ colorMarcas: ev.target.value })} placeholder="Blanco y azul" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="N/" etiqueta="Observaciones" estado={f.observaciones.trim() ? "ok" : "opcional"} delAvion={f.origen.observaciones === "avion"}>
                <input value={f.observaciones} onChange={(ev) => cambiar({ observaciones: ev.target.value })} placeholder="T.E. +54 9 11…" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo casilla="C/" etiqueta="Comandante (nombre, licencia y número)" estado={e.piloto} delAvion={f.origen.piloto === "avion"}>
                <input value={f.piloto} onChange={(ev) => cambiar({ piloto: ev.target.value })} placeholder="Nombre PPA 12345678" className={`${INPUT} uppercase`} />
              </Campo>
              <Campo etiqueta="Presentado por (si lo presenta otro)" estado="opcional">
                <input value={f.presentadoPor} onChange={(ev) => cambiar({ presentadoPor: ev.target.value })} placeholder="Opcional" className={`${INPUT} uppercase`} />
              </Campo>
            </div>
          </Seccion>
        </div>

        {/* Columna derecha: firma, revisión, presentar, demora */}
        <div className="space-y-6 xl:sticky xl:top-6">
          <Seccion titulo="Firma del comandante">
            <FirmaPiloto inicial={firma} onCambio={setFirma} />
          </Seccion>

          <Seccion titulo="Revisión">
            <p className="data text-[11px] leading-relaxed break-all rounded-2xl bg-white dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5 p-3 text-zinc-700 dark:text-zinc-300">
              {mensajeFpl(r.plan)}
            </p>
            {(r.errores.length > 0 || r.avisos.length > 0 || !firma) && (
              <ul className="space-y-1.5">
                {r.errores.map((x, i) => (
                  <li key={`e${i}`} className="flex gap-2 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {x.mensaje}
                  </li>
                ))}
                {!firma && (
                  <li className="flex gap-2 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Falta la firma: la AIC A 19/2026 pide el plan firmado.
                  </li>
                )}
                {r.avisos.map((x, i) => (
                  <li key={`a${i}`} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {x.mensaje}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {meteo && (
            <Seccion titulo="Meteo y NOTAM a tu hora">
              <MeteoDelVuelo {...meteo} />
            </Seccion>
          )}

          <Seccion titulo="Presentarlo">
            <Campo etiqueta="Oficina ARO/AIS" estado={oficina ? "ok" : "falta"}>
              <select value={oficina?.oaci ?? ""} onChange={(ev) => cambiar({ oficina: ev.target.value })} className={INPUT}>
                {!oficina && <option value="">Elegí la oficina…</option>}
                {oficinas.map((o) => (
                  <option key={o.oaci} value={o.oaci}>
                    {o.nombre} ({o.oaci})
                  </option>
                ))}
              </select>
            </Campo>
            {cercanas.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Las más cercanas a {f.salida?.codigo}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {cercanas.map((c) => {
                    const h = horarioAro(c.oficina.horario, f.eobtUtc || undefined);
                    const elegida = c.oficina.oaci === oficina?.oaci;
                    return (
                      <button
                        key={c.oficina.oaci}
                        type="button"
                        onClick={() => cambiar({ oficina: c.oficina.oaci })}
                        aria-pressed={elegida}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors ${
                          elegida
                            ? "border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                            : "border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-white/30"
                        }`}
                      >
                        {h?.abierta !== undefined && h?.abierta !== null && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${h.abierta ? "bg-emerald-500" : "bg-red-500"}`}
                            title={h.abierta ? "Abierta a esa hora" : "Cerrada a esa hora"}
                          />
                        )}
                        {c.oficina.nombre} <span className="data opacity-70">{c.propia ? "acá" : `${Math.round(c.distanciaNm)} NM`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {oficina && (
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Horario del ARO (AIP AD 2.3):{" "}
                {horario ? <span className="data font-bold text-zinc-700 dark:text-zinc-200">{horario.texto}</span> : "no publicado"}
                {horario?.abierta === true && f.eobtUtc && <span className="text-emerald-600 dark:text-emerald-400"> · abierta a las {f.eobtUtc}Z</span>}
                {horario?.abierta === false && (
                  <span className="text-red-600 dark:text-red-400"> · a las {f.eobtUtc}Z está cerrada: mandalo a la más cercana que atienda</span>
                )}
                {horario && horario.abierta === null && <span> · revisá que atienda a tu hora</span>}
              </p>
            )}
            {sugerida && !sugerida.propia && !f.oficina && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {f.salida?.codigo} no tiene oficina ARO/AIS: la más cercana es {sugerida.oficina.nombre}, a {Math.round(sugerida.distanciaNm ?? 0)} NM.
                Si a esa hora está cerrada, elegí otra (AIC A 19/2026).
              </p>
            )}
            {envioAroActivo && (
              <div className="space-y-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Mandarlo por mail desde Vector</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Con el PDF firmado adjunto y la matrícula en el asunto, como pide la AIC A 19/2026. Te llega una copia, y
                  las respuestas de la oficina van a tu mail.
                </p>
                <button
                  type="button"
                  disabled={!listo || !oficina || !!cancelado || envio.estado === "mandando" || sinSenal}
                  onClick={mandar}
                  className="inline-flex max-w-full items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-40"
                >
                  {envio.estado === "mandando" ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Mail className="w-4 h-4 shrink-0" />}
                  <span className="truncate">Mandar a {oficina ? oficina.correo : "la oficina"}</span>
                </button>
                {envio.texto && (
                  <p className={`text-xs ${envio.estado === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {envio.texto}
                  </p>
                )}
                {envios.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {envios.map((e, i) => (
                      <li key={i}>
                        {e.tipo === "dla" ? "Demora: " : e.tipo === "cnl" ? "Cancelación: " : ""}
                        {e.modo === "prueba" ? "prueba a" : "enviado a"} <span className="font-semibold">{e.a}</span> · {cuandoEnvio(e.at)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{envioAroActivo ? "O desde tu correo:" : "Desde tu correo:"}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!listo || pdf === "armando"}
                onClick={async () => {
                  const a = await generar();
                  if (a) bajarArchivo(a);
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
              >
                {pdf === "armando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Bajar PDF
              </button>
            </div>
            {pdf === "error" && <p className="text-xs text-red-600">No se pudo armar el PDF. Probá de nuevo.</p>}
            {oficina && (
              <ol className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-300">
                <li>
                  1. Mandalo adjunto a{" "}
                  <a
                    href={`mailto:${oficina.correo}?subject=${encodeURIComponent(asuntoDelMail(r.plan))}&body=${encodeURIComponent(
                      cuerpoDelMail(r.plan, { salida: f.salida?.nombre ?? "", destino: f.destino?.nombre ?? "" })
                    )}`} className="font-semibold text-aviation-blue dark:text-aviation-cyan underline underline-offset-2 break-all">
                    <Mail className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                    {oficina.correo}
                  </a>
                  , con la matrícula en el asunto.
                </li>
                <li>
                  2. Llamá para confirmar que lo recibieron
                  {telOficina && (
                    <>
                      :{" "}
                      <a href={`tel:${telOficina.marcar}`} className="font-semibold text-aviation-blue dark:text-aviation-cyan underline underline-offset-2">
                        <Phone className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                        {telOficina.mostrar}
                      </a>
                    </>
                  )}
                  .
                </li>
                <li>3. Guardá el PDF un año: te lo pueden pedir.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => duplicarPlan(id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicar para otro día
            </button>
          </Seccion>

          <Seccion titulo="Demora (DLA)">
            {cancelado ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">El plan está cancelado. Si vas a volar, duplicalo y presentá uno nuevo.</p>
            ) : vigente ? (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Si salís más tarde, avisá la nueva hora con el formulario de demora (AIP ENR 1.10, Apéndice 4). Hasta {MAXIMO_DEMORAS} por vuelo, y con
                  al menos 30 minutos de anticipación.
                </p>
                {demoras.length > 0 && (
                  <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {demoras.map((d, i) => {
                      const l = localDesdeUtc(d.dof, d.eobt);
                      return (
                        <li key={i} className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-zinc-400" /> Demora {i + 1}: <span className="data font-bold">{d.eobt}Z</span>
                          {l && <span className="text-zinc-400">({l.hora} hora argentina)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {chequeoDemora.error ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{chequeoDemora.error}</p>
                ) : (
                  <>
                    <Campo
                      etiqueta="Nueva EOBT (UTC)"
                      estado={demoraNueva ? "ok" : "opcional"}
                      debajo={
                        demoraNueva ? (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            DOF/{dofDeDemora(demoraNueva)} · {localDesdeUtc(demoraNueva.dof, demoraNueva.eobt)?.hora} hora argentina
                          </p>
                        ) : undefined
                      }
                    >
                      <input value={horaDemora} onChange={(ev) => setHoraDemora(ev.target.value)} placeholder="1930" inputMode="numeric" maxLength={5} className={INPUT} />
                    </Campo>
                    {chequeoDemora.aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{chequeoDemora.aviso}</p>}
                    <div className="flex flex-wrap gap-2">
                      {envioAroActivo && (
                        <button
                          type="button"
                          disabled={!demoraNueva || !listo || !oficina || ocupadoDemora}
                          onClick={mandarDemora}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-40"
                        >
                          {demoraEstado.estado === "mandando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Mandar a{" "}
                          {oficina ? oficina.correo : "la oficina"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!demoraNueva || ocupadoDemora}
                        onClick={bajarDemora}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                      >
                        {demoraEstado.estado === "armando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Bajar demora
                      </button>
                    </div>
                    {envioAroActivo && demoraNueva && !listo && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Para mandarla por mail, el plan tiene que estar completo y firmado.</p>
                    )}
                    {demoraEstado.texto && (
                      <p className={`text-xs ${demoraEstado.estado === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {demoraEstado.texto}
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Con la fecha y la hora de salida cargadas, acá avisás una demora.</p>
            )}
          </Seccion>

          <Seccion titulo="Cancelación (CNL)">
            {cancelado ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                <Check className="w-4 h-4 text-emerald-600" /> Plan cancelado · {cuandoEnvio(cancelado)}
              </p>
            ) : (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Si no vas a volar, avisá la cancelación con el formulario del Apéndice 5 de la AIP ENR 1.10, con la salida
                  vigente{demoras.length > 0 ? " (la de tu última demora)" : ""}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {envioAroActivo && (
                    <button
                      type="button"
                      disabled={!listo || !oficina || ocupadoCancelacion}
                      onClick={mandarCancelacion}
                      className="inline-flex max-w-full items-center gap-2 px-4 py-2.5 rounded-full border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-xs font-semibold disabled:opacity-40"
                    >
                      {cancelacion.estado === "mandando" ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <Mail className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">Cancelar y mandar a {oficina ? oficina.correo : "la oficina"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!listo || ocupadoCancelacion}
                    onClick={bajarCancelacion}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-300 disabled:opacity-40"
                  >
                    {cancelacion.estado === "armando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Bajar cancelación
                  </button>
                </div>
                {!listo && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Para cancelarlo, el plan tiene que estar completo y firmado, como lo presentaste.</p>
                )}
              </>
            )}
            {cancelacion.texto && (
              <p className={`text-xs ${cancelacion.estado === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {cancelacion.texto}
              </p>
            )}
          </Seccion>
        </div>
      </div>
    </div>
  );
}

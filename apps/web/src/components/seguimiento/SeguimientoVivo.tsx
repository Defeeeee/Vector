"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SeguimientoMapa from "./SeguimientoMapa";
import ClimaDestino from "./ClimaDestino";
import PerfilAltura from "./PerfilAltura";
import AvisarVuelo from "./AvisarVuelo";
import { LogoVector } from "@/components/Marca";
import { CADA_MIRANDO_MS, CLAVE_VISITANTE, conMiles, haceCuanto, idDeVisitanteValido, idDesdeBytes, rotuloDeAltura, textoDeFuente, type SeguimientoPublico } from "@/lib/seguimiento";
import {
  avanceSobreRuta,
  duracion,
  estadoMostrado,
  ftAM,
  horaArgentina,
  horaArgentinaConDia,
  horaUtc,
  ktAKmh,
  llegadaEstimada,
  nmAKm,
  nombreDePunto,
  normalizar,
  puntosDePerfil,
  recorridoNm,
  textoDelAvion,
  textoSalida,
  textoVertical,
  velocidadVertical,
} from "@/lib/seguimiento-calculos";

/**
 * Lo que ve quien abre `/seguir/[token]`: el mapa y, al lado (compu, 380 px) o en una hoja abajo
 * (teléfono, el mapa ocupa ~55 % del alto), todo lo que se sabe del vuelo: dónde está, a qué altura,
 * cuándo llega, qué le falta, el avión, la ruta con nombres, el perfil de altura y el clima del destino.
 * Lo más importante va primero. Los cálculos son puros y están en `lib/seguimiento-calculos.ts`.
 *
 * - **Vuelve a preguntar cada ~15 s** a `/api/seguimiento/ver/[token]` mientras el vuelo está en
 *   curso, y al volver a mirar la pestaña. Al terminar o vencer deja de preguntar y dice "El vuelo
 *   terminó" con la última posición. Si el link ya no se puede ver (404), lo dice.
 * - **"Hace 40 s" sin `toLocaleString`** (invariante 1): la hora del servidor al contestar más lo
 *   que pasó en esta pestaña desde entonces (`performance.now`), contra la hora de la posición. Ni
 *   el reloj de quien mira ni el del piloto entran en la cuenta. El primer dibujo (server) y la
 *   hidratación coinciden: el contador arranca en 0.
 * - **"Avisarme cuando despegue y cuando aterrice"** (`AvisarVuelo`): un push web sin cuenta, que manda el
 *   grabador del VPS aunque la página esté cerrada. Sólo mientras el link sigue en vuelo.
 * - Un corte de red no borra lo que se estaba viendo: queda la última posición y el aviso.
 */

type Fin = "no-disponible" | null;

const rotulo = "font-mono text-[11px] font-bold uppercase tracking-wider";

/**
 * El id al azar de este navegador, en `localStorage` (con try/catch: puede no haber; entonces vale
 * uno por pestaña). 16 caracteres que sólo sirven para contar visitantes distintos.
 */
function idDeEsteNavegador(): string | null {
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem(CLAVE_VISITANTE);
  } catch {
    /* sin almacenamiento */
  }
  if (idDeVisitanteValido(guardado)) return guardado;
  if (typeof crypto === "undefined" || !crypto.getRandomValues) return null;
  const id = idDesdeBytes(crypto.getRandomValues(new Uint8Array(16)));
  try {
    localStorage.setItem(CLAVE_VISITANTE, id);
  } catch {
    /* uno por pestaña */
  }
  return id;
}

export default function SeguimientoVivo({ token, inicial }: { token: string; inicial: SeguimientoPublico }) {
  const [datos, setDatos] = useState(() => normalizar(inicial));
  const [fin, setFin] = useState<Fin>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [transcurridoMs, setTranscurridoMs] = useState(0);
  const [suelto, setSuelto] = useState(false);
  const [centrar, setCentrar] = useState(0);
  const [encuadrar, setEncuadrar] = useState(0);
  const recibidoEn = useRef<number | null>(null);
  const preguntando = useRef(false);
  const visitante = useRef<string | null>(null);

  const enVuelo = datos.estado === "en_vuelo" && fin === null;

  const preguntar = useCallback(async () => {
    if (preguntando.current) return;
    preguntando.current = true;
    try {
      // Un id al azar de este navegador (no dice quién es): así el piloto sabe cuántos miran.
      visitante.current ??= idDeEsteNavegador();
      const res = await fetch(`/api/seguimiento/ver/${encodeURIComponent(token)}`, {
        cache: "no-store",
        headers: visitante.current ? { "X-Visitante": visitante.current } : {},
      });
      if (res.status === 404) {
        setFin("no-disponible");
        return;
      }
      if (!res.ok) {
        setSinConexion(true);
        return;
      }
      setDatos(normalizar((await res.json()) as SeguimientoPublico));
      setSinConexion(false);
    } catch {
      setSinConexion(true);
    } finally {
      preguntando.current = false;
    }
  }, [token]);

  // Cada vez que llegan datos nuevos, el contador de "hace cuánto" vuelve a 0.
  useEffect(() => {
    recibidoEn.current = performance.now();
    setTranscurridoMs(0);
  }, [datos]);

  useEffect(() => {
    if (!enVuelo) return;
    // La página del servidor se dibujó sin id: el primer pedido con id es éste, así el piloto
    // se entera enseguida y no a los 15 s.
    void preguntar();
    const intervalo = window.setInterval(() => void preguntar(), CADA_MIRANDO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [enVuelo, preguntar]);

  // El reloj de la pantalla: cada segundo, sólo mientras hay algo que envejece.
  useEffect(() => {
    if (!enVuelo) return;
    const intervalo = window.setInterval(() => {
      if (recibidoEn.current !== null) setTranscurridoMs(performance.now() - recibidoEn.current);
    }, 1000);
    return () => window.clearInterval(intervalo);
  }, [enVuelo]);

  const ahora = new Date(Date.parse(datos.ahora) + transcurridoMs).toISOString();
  const u = datos.ultima;
  const hace = haceCuanto(u?.hora ?? null, ahora);
  const estado = estadoMostrado(datos, ahora);
  const terminado = datos.estado !== "en_vuelo";

  // Todo lo que se calcula, de lo que llegó (nunca de la bitácora ni del reloj de quien mira).
  const avance = useMemo(() => (u ? avanceSobreRuta(datos.puntos, u) : null), [datos.puntos, u]);
  const voladoNm = useMemo(() => recorridoNm(datos.recorrido, u), [datos.recorrido, u]);
  const vertical = useMemo(() => velocidadVertical(datos.recorrido, u), [datos.recorrido, u]);
  const perfil = useMemo(() => puntosDePerfil(datos.recorrido, u), [datos.recorrido, u]);
  const llegada = llegadaEstimada({ faltaNm: avance?.faltaNm ?? null, gsKt: u?.gs_kt ?? null, horaUltima: u?.hora ?? null, ahora });
  const llegadaTexto = horaArgentinaConDia(llegada, ahora);
  const quedaS = llegada ? Math.max(0, (Date.parse(llegada) - Date.parse(ahora)) / 1000) : null;
  // Un seguimiento desde un plan existe desde antes de la salida: "duró" desde que se creó no dice nada.
  const dePlan = Boolean(datos.salida_prevista);
  const salidaTexto = textoSalida(datos.salida_prevista, ahora);
  const duracionS = !dePlan && datos.inicio && u?.hora ? (Date.parse(u.hora) - Date.parse(datos.inicio)) / 1000 : null;
  const fuente = textoDeFuente(u?.fuente);
  const hayAdsb = datos.recorrido.some((p) => p[4] === "adsb");
  const hayGps = datos.recorrido.some((p) => p[4] === "gps");
  const proximo = avance?.proximo != null ? datos.puntos[avance.proximo] : null;
  const salida = datos.puntos[0];
  const destino = datos.puntos.length > 1 ? datos.puntos[datos.puntos.length - 1] : null;
  const avion = textoDelAvion(datos.avion);

  if (fin === "no-disponible") {
    return (
      <Pantalla>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className={`${rotulo} text-white/60`}>Seguimiento</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Este link ya no está disponible</h1>
          <p className="mt-3 max-w-sm text-base text-white/75">El vuelo terminó hace un rato, o el link venció. Los links duran lo que dura el vuelo.</p>
        </div>
      </Pantalla>
    );
  }

  const colorEstado =
    estado.clave === "sin_datos" || estado.clave === "terminado" || estado.clave === "esperando" || estado.clave === "antes_de_salir"
        ? "text-white/70"
        : "text-aviation-cyan";

  return (
    <Pantalla>
      {/* El mapa: arriba en el teléfono (~55 % del alto), a la derecha en la compu. */}
      <div className="relative order-1 h-[55dvh] shrink-0 lg:order-2 lg:h-auto">
        <SeguimientoMapa datos={datos} centrar={centrar} encuadrar={encuadrar} onSuelto={() => setSuelto(true)} />
        <div className="absolute bottom-7 right-3 z-[500] flex flex-col gap-2 lg:bottom-4">
          <button
            type="button"
            disabled={!u}
            onClick={() => {
              setSuelto(false);
              setCentrar((n) => n + 1);
            }}
            className={`rounded-full px-3 py-2 text-xs font-bold shadow-lg lg:px-4 lg:py-2.5 lg:text-sm disabled:opacity-40 ${suelto ? "bg-aviation-cyan text-noche" : "bg-noche/90 text-white ring-1 ring-white/30"}`}
          >
            Centrar en el avión
          </button>
          <button
            type="button"
            onClick={() => {
              setSuelto(true);
              setEncuadrar((n) => n + 1);
            }}
            className="rounded-full bg-noche/90 px-3 py-2 text-xs font-bold text-white shadow-lg ring-1 lg:px-4 lg:py-2.5 lg:text-sm ring-white/30"
          >
            Ver toda la ruta
          </button>
        </div>
      </div>

      {/* Los datos: una hoja que se desplaza en el teléfono, un panel de 380 px en la compu. */}
      <section
        aria-label="Datos del vuelo"
        className="relative z-10 order-2 -mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-t-3xl border-t border-white/20 bg-noche px-5 pb-8 pt-3 lg:order-1 lg:mt-0 lg:rounded-none lg:border-r lg:border-t-0 lg:border-white/10 lg:px-6 lg:pt-6"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/30 lg:hidden" aria-hidden />

        <p className={`${rotulo} flex items-center gap-2 ${colorEstado}`}>
          <span className={`h-2 w-2 rounded-full ${estado.clave === "volando" || estado.clave === "en_tierra" || estado.clave === "en_seguimiento" ? "bg-aviation-cyan" : "bg-white/50"}`} />
          {terminado ? "Seguimiento" : "Seguimiento en vivo"}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">
          {terminado ? estado.titulo : `${datos.nombre} · ${estado.titulo.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`}
        </h1>
        {datos.ruta && <p className="mt-1 font-mono text-sm text-white/75">{datos.ruta}</p>}
        {estado.clave === "antes_de_salir" && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {salidaTexto && <p className="text-lg font-bold text-white">{salidaTexto}</p>}
            <p className="mt-1 text-sm text-white/80">
              {u ? "El avión está en tierra. " : "Todavía no se lo ve. "}Cuando despegue, aparece en el mapa con las posiciones ADS-B.
            </p>
          </div>
        )}

        {/* Un push cuando despegue y cuando aterrice, sin cuenta (migración 046). Sólo mientras el link sigue en vuelo. */}
        {enVuelo && <AvisarVuelo token={token} />}

        <div aria-live="polite">
          {"aviso" in estado && <p className="mt-3 border-l-2 border-white/20 pl-3 text-sm text-white/75">{estado.aviso}</p>}
          {sinConexion && !terminado && <p className="mt-3 text-sm text-white/60">Tu conexión se cortó: se muestra lo último que llegó y se vuelve a intentar solo.</p>}
          {terminado && (
            <p className="mt-3 text-base text-white/85">
              {estado.clave === "aterrizo" && "El avión tocó tierra y el seguimiento terminó. "}
              {u ? `Última posición ${hace ?? "registrada"}.` : "No llegó ninguna posición."}
              {duracionS !== null && duracionS >= 60 ? ` El seguimiento duró ${duracion(duracionS)}.` : ""}
            </p>
          )}
        </div>

        {/* Lo más importante: dónde está, a qué altura y cuándo llega. */}
        {u ? (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <Cifra
              rotulo={rotuloDeAltura(u.fuente)}
              valor={u.alt_ft !== null ? conMiles(u.alt_ft) : "—"}
              unidad="ft"
              sub={u.alt_ft !== null ? `${conMiles(ftAM(u.alt_ft))} m${u.fuente === "adsb" ? " · barométrica" : ""}` : "sin dato"}
            />
            <Cifra rotulo="Velocidad" valor={u.gs_kt !== null ? String(Math.round(u.gs_kt)) : "—"} unidad="kt" sub={u.gs_kt !== null ? `${Math.round(ktAKmh(u.gs_kt))} km/h` : "sin dato"} />
            <Cifra
              rotulo={terminado ? "Última pos." : "Llegada"}
              valor={terminado ? (hace ?? "—") : (llegadaTexto?.replace(" hs", "").replace(" de mañana", "") ?? "—")}
              sub={terminado ? "" : llegadaTexto ? `${llegadaTexto.includes("mañana") ? "mañana · " : ""}en ${duracion(quedaS ?? 0)}` : avance ? "sin estimar" : "sin ruta"}
              chico={terminado}
            />
          </div>
        ) : estado.clave === "antes_de_salir" || estado.clave === "sin_datos" ? null : (
          <p className="mt-4 border-t border-white/10 pt-4 text-lg font-bold text-white">Esperando la primera posición</p>
        )}
        {u && !terminado && (
          <p className="mt-3 text-sm text-white/80">
            Actualizado <strong className="font-mono text-white">{hace ?? "—"}</strong>
            {textoVertical(vertical) && <> · {textoVertical(vertical)}</>}
            {u.track !== null && <> · Rumbo {String(Math.round(u.track) % 360).padStart(3, "0")}°</>}
            {fuente && <> · Fuente: <strong className="text-white">{fuente}</strong></>}
          </p>
        )}
        {u && hayAdsb && hayGps && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-aviation-cyan" aria-hidden />GPS del teléfono</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#a78bfa]" aria-hidden />ADS-B</span>
          </p>
        )}
        {u && hayAdsb && !hayGps && !terminado && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/60"><span className="h-0.5 w-4 rounded bg-[#a78bfa]" aria-hidden />El recorrido viene de receptores ADS-B.</p>
        )}

        {/* Avance sobre la ruta */}
        {avance && u && (
          <Bloque titulo="Avance de la ruta">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-3xl font-bold text-white">{avance.porcentaje}%</p>
              <p className="text-sm text-white/80">
                {terminado ? "Quedaron " : "Faltan "}
                <strong className="font-mono text-white">{Math.round(avance.faltaNm)} NM</strong> ({Math.round(nmAKm(avance.faltaNm))} km){terminado ? " de la ruta" : ""}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={avance.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la ruta">
              <div className="h-full rounded-full bg-aviation-cyan" style={{ width: `${avance.porcentaje}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/80">
              {proximo && !terminado ? (
                <>
                  Próximo punto: <strong className="text-white">{nombreDePunto(proximo)}</strong>.{" "}
                </>
              ) : null}
              Ruta de {Math.round(avance.totalNm)} NM ({Math.round(nmAKm(avance.totalNm))} km); volados {Math.round(voladoNm)} NM.
              {avance.desvioNm > 10 && " Está bastante apartado de la ruta prevista."}
            </p>
          </Bloque>
        )}

        {/* La ruta con nombres */}
        {datos.puntos.length > 0 && (
          <Bloque titulo="La ruta">
            <ol className="space-y-1.5">
              {datos.puntos.map((p, i) => {
                const pasado = avance?.proximo != null ? i < avance.proximo : avance !== null && avance.proximo === null;
                const esProximo = avance?.proximo === i && !terminado;
                return (
                  <li key={`${i}-${p[2]}`} className={`flex items-center gap-2.5 text-sm ${pasado ? "text-white/55" : "text-white"} ${esProximo ? "font-bold" : ""}`}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${esProximo ? "bg-aviation-cyan" : pasado ? "bg-white/40" : "border-2 border-white/70"}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{nombreDePunto(p)}</span>
                    <span className="shrink-0 font-mono text-[11px] text-white/60">{i === 0 ? "salida" : i === datos.puntos.length - 1 ? "destino" : esProximo ? "próximo" : pasado ? "pasado" : ""}</span>
                  </li>
                );
              })}
            </ol>
          </Bloque>
        )}

        <Bloque titulo="Perfil de altura">
          <PerfilAltura puntos={perfil} />
        </Bloque>

        {(avion || datos.inicio) && (
          <Bloque titulo="El avión y el vuelo">
            <dl className="space-y-1.5 text-sm">
              {avion && <Fila k="Avión" v={avion} />}
              {dePlan && datos.salida_prevista && <Fila k="Salida prevista" v={`${horaArgentina(datos.salida_prevista)} (${horaUtc(datos.salida_prevista)})`} />}
              {!dePlan && datos.inicio && <Fila k="Seguimiento desde" v={horaArgentinaConDia(datos.inicio, ahora) ?? "—"} />}
              {duracionS !== null && duracionS >= 60 && <Fila k={terminado ? "Duró" : "Lleva"} v={duracion(duracionS)} />}
              {salida && datos.puntos.length > 1 && <Fila k="Salida" v={nombreDePunto(salida)} />}
              {destino && <Fila k="Destino" v={nombreDePunto(destino)} />}
            </dl>
          </Bloque>
        )}

        {destino && (
          <Bloque titulo={`Clima en ${destino[2] || "el destino"}`}>
            <ClimaDestino token={token} ahora={ahora} activo={enVuelo} />
          </Bloque>
        )}

        <footer className="mt-8 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
          <p className="text-xs leading-snug text-white/60">
            {datos.con_adsb || dePlan
              ? "Posición del GPS del teléfono del piloto o, si el teléfono no manda, de receptores ADS-B públicos (adsb.fi): puede tardar, cortarse, o no haber datos si el avión no transmite. "
              : "Posición del GPS del teléfono del piloto: puede tardar o cortarse. "}
            No reemplaza la comunicación con el vuelo. El clima es informativo.
          </p>
          <Link href="/" className="shrink-0" aria-label="Vector">
            <LogoVector className="h-5 w-auto" sobreOscuro />
          </Link>
        </footer>
      </section>
    </Pantalla>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <main className="dark flex h-[100dvh] w-full flex-col overflow-hidden bg-noche text-white lg:grid lg:grid-cols-[380px_1fr]">{children}</main>;
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-white/10 pt-4">
      <h2 className={`${rotulo} mb-2.5 text-white/60`}>{titulo}</h2>
      {children}
    </section>
  );
}

function Cifra({ rotulo: r, valor, unidad, sub, chico }: { rotulo: string; valor: string; unidad?: string; sub: string; chico?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`${rotulo} text-white/60`}>{r}</p>
      <p className={`mt-1 font-mono font-bold leading-none text-white ${chico ? "text-base" : "text-2xl sm:text-3xl lg:text-2xl"}`}>
        {valor}
        {unidad && <span className="ml-1 text-xs font-semibold text-white/70">{unidad}</span>}
      </p>
      <p className="mt-1 text-xs text-white/70">{sub}</p>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-white/60">{k}</dt>
      <dd className="min-w-0 text-right font-semibold text-white">{v}</dd>
    </div>
  );
}

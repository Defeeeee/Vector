"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cambiarMatriculaVisible, cambiarRutaSeguimiento, crearSeguimiento, terminarSeguimiento } from "@/actions/seguimiento";
import {
  CLAVE_SEGUIMIENTO,
  leerSeguimientoGuardado,
  posicionDeLectura,
  tocaMandar,
  urlDeSeguimiento,
  vistasDeRespuesta,
  type LecturaParaCompartir,
  type VistasDelLink,
  type SeguimientoGuardado,
} from "@/lib/seguimiento";

/**
 * "Compartir mi vuelo" (migración 041 del backend): manda la posición del GPS a un link que la
 * familia abre sin cuenta (`/seguir/[token]`).
 *
 * Lo usa el Mapa en modo vuelo, **una sola vez, arriba** (donde vive la lectura del GPS), y le pasa
 * el resultado a `CompartirSeguimiento`:
 *
 *   const seguimiento = useSeguimientoEnVivo({ lectura, volando, ruta, puntos, aeronave });
 *
 * - **Manda sólo la última lectura**, cada ~15 s y sólo con `volando`. Sin señal el pedido falla y
 *   se reintenta en el próximo ciclo con la lectura más nueva: nada se acumula (el link muestra
 *   dónde está el avión ahora, no se rehace lo que se perdió). Al volver la red (`online`) manda
 *   enseguida. El backend ralea de nuevo (una cada 10 s).
 * - **Deja de mandar al terminar**: cuando `volando` pasa de true a false, termina el seguimiento
 *   (el link pasa a "El vuelo terminó"). También si el backend contesta 410/404.
 * - **Se retoma** si se recarga la app con un seguimiento vigente (`localStorage`, con try/catch:
 *   puede no estar). Con `volando` en false no manda, pero el piloto puede dejar de compartir.
 * - **Si la ruta cambia en vuelo** (3.23.0, "Directo a…"), la nueva ruta y sus puntos se mandan al
 *   backend (`POST /seguimientos/{id}/ruta`) y el link muestra la ruta y el destino nuevos. Se
 *   espera a que todos los puntos de la ruta estén resueltos (`rutaLista`: si no, la familia vería
 *   una ruta a medias) y un instante a que termine de cambiar; si falla por falta de señal se
 *   reintenta. El recorrido ya volado no se toca.
 * - Una lectura con más de 150 m de error no se manda (`posicionDeLectura`).
 * - **Se adopta el link del plan** (`adoptar`): si el Mapa se abrió desde un plan de vuelo que ya se
 *   compartía ("Compartir este vuelo"), ese seguimiento es el activo: al tocar Volar el teléfono
 *   le manda el GPS **al mismo token**, sin crear otro. El backend admite uno solo por piloto, y el
 *   GPS se suma al ADS-B. Terminar el vuelo lo termina, como siempre.
 */

export type EstadoCompartir = "apagado" | "creando" | "compartiendo";

export interface SeguimientoEnVivo {
  estado: EstadoCompartir;
  /** El link, mientras se comparte. */
  url: string | null;
  /** El último error de crear o terminar, para mostrar. */
  error: string | null;
  /** "Mostrar la matrícula": apagado por defecto. Antes de compartir es una elección; después se puede cambiar. */
  mostrarMatricula: boolean;
  /** No hay avión elegido (o sin matrícula): el interruptor no tiene qué mostrar. */
  sinMatricula: boolean;
  cambiarMostrarMatricula: (mostrar: boolean) => Promise<void>;
  /** El último intento de mandar falló (sin señal): el link muestra una posición vieja. */
  sinSenal: boolean;
  /** Quién mira el link (migración 044), según la última respuesta del backend; `null` si todavía no llegó una. */
  vistas: VistasDelLink | null;
  /** El link que se comparte es el de un plan de vuelo (el piloto lo mandó desde el plan). */
  delPlan: boolean;
  /** Empieza (o retoma el activo) y devuelve el link, o `null` si falló (el motivo queda en `error`). */
  compartir: () => Promise<string | null>;
  /** Deja de compartir: el link pasa a "El vuelo terminó". */
  dejarDeCompartir: () => Promise<void>;
}

interface Opciones {
  /** La lectura del GPS de `lecturaGps` (`lib/mapa-ruta.ts`); `null` sin fix. */
  lectura: LecturaParaCompartir | null;
  /** Está en modo vuelo (el Mapa con "Volar"). */
  volando: boolean;
  /** La ruta como se escribe en el Mapa ("SADF SADM"). */
  ruta: string;
  /** Los puntos de la ruta (`PuntoMapa[]` sirve tal cual). */
  puntos: { lat: number; lon: number; codigo: string; label?: string }[];
  /** Los puntos de la ruta ya están todos resueltos (el Mapa no está buscando ninguno). */
  rutaLista?: boolean;
  /** El avión elegido en el Mapa (`Aircraft` sirve tal cual). Su tipo y designador salen en el link; la matrícula sólo si el piloto lo prende. */
  aeronave?: { registration: string; type: string; icao: string } | null;
  /** El seguimiento de un plan de vuelo que ya está activo, para seguir con ese mismo link. */
  adoptar?: SeguimientoGuardado | null;
}

function guardar(s: SeguimientoGuardado | null) {
  try {
    if (s) localStorage.setItem(CLAVE_SEGUIMIENTO, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_SEGUIMIENTO);
  } catch {
    /* sin almacenamiento: se comparte igual, sólo que no se retoma */
  }
}

/** Lo que identifica una ruta para saber si cambió: el texto y los puntos (a ~10 m). */
const firmaDeRuta = (ruta: string, puntos: Opciones["puntos"]) =>
  `${ruta}|${puntos.map((p) => `${p.codigo}@${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(";")}`;

export function useSeguimientoEnVivo({ lectura, volando, ruta, puntos, rutaLista = true, aeronave = null, adoptar = null }: Opciones): SeguimientoEnVivo {
  const [activo, setActivo] = useState<SeguimientoGuardado | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinSenal, setSinSenal] = useState(false);
  const [vistas, setVistas] = useState<VistasDelLink | null>(null);
  // Apagado por defecto (invariante 14, en espíritu): lo público lleva sólo lo que el piloto eligió.
  const [mostrarMatricula, setMostrarMatricula] = useState(false);

  // Lo último que se sabe, sin volver a armar el intervalo en cada lectura del GPS.
  const lecturaRef = useRef(lectura);
  const rutaRef = useRef({ ruta, puntos, aeronave });
  const activoRef = useRef(activo);
  const mostrarRef = useRef(mostrarMatricula);
  const volandoAntes = useRef(volando);
  const enviando = useRef(false);
  const ultimaEnviada = useRef<LecturaParaCompartir | null>(null);
  const ultimoIntento = useRef<number | null>(null);
  // La firma de la ruta que el backend ya tiene (`null`: no se sabe, se manda la primera vez que esté lista).
  const rutaEnviada = useRef<string | null>(null);
  const [reintentoRuta, setReintentoRuta] = useState(0);

  useEffect(() => {
    lecturaRef.current = lectura;
    rutaRef.current = { ruta, puntos, aeronave };
    activoRef.current = activo;
    mostrarRef.current = mostrarMatricula;
  });

  // Retomar un seguimiento vigente al montar.
  useEffect(() => {
    try {
      const g = leerSeguimientoGuardado(localStorage.getItem(CLAVE_SEGUIMIENTO), Date.now());
      setActivo(g);
      setMostrarMatricula(g?.mostrarMatricula ?? false);
    } catch {
      /* nada */
    }
  }, []);

  // El link del plan: queda como el activo (y en el teléfono, para retomarlo si se recarga en vuelo).
  // Va después de retomar, así que le gana: el backend sólo admite un seguimiento por piloto.
  const adoptarId = adoptar?.id ?? null;
  const [delPlan, setDelPlan] = useState(false);
  useEffect(() => {
    if (!adoptar) return;
    setActivo(adoptar);
    setMostrarMatricula(adoptar.mostrarMatricula);
    setDelPlan(true);
    guardar(adoptar);
    activoRef.current = adoptar;
    // El backend tiene la ruta del plan: la del Mapa se manda al empezar a volar.
    rutaEnviada.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptarId]);

  const cerrar = useCallback(() => {
    setDelPlan(false);
    guardar(null);
    setActivo(null);
    setMostrarMatricula(false); // el próximo vuelo vuelve a empezar apagado
    setSinSenal(false);
    setVistas(null);
    ultimaEnviada.current = null;
    ultimoIntento.current = null;
    rutaEnviada.current = null;
  }, []);

  const mandar = useCallback(async () => {
    const seg = activoRef.current;
    const l = lecturaRef.current;
    if (!seg || enviando.current) return;
    const pos = posicionDeLectura(l);
    // Sin lectura nueva no hay nada que mandar (el GPS no se movió de objeto): la hora del
    // servidor es la de recibirla, y repetirla haría ver fresca una posición vieja.
    if (!pos || l === ultimaEnviada.current) return;
    enviando.current = true;
    ultimoIntento.current = Date.now();
    try {
      const res = await fetch("/api/seguimiento/posicion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seg.id, ...pos }),
        cache: "no-store",
      });
      if (res.status === 410 || res.status === 404) {
        cerrar();
        return;
      }
      if (!res.ok) {
        setSinSenal(true);
        return;
      }
      ultimaEnviada.current = l;
      setSinSenal(false);
      // Los conteos de quien mira vienen en la misma respuesta (y la hora del servidor).
      const v = vistasDeRespuesta(await res.json().catch(() => null));
      if (v) setVistas(v);
    } catch {
      setSinSenal(true);
    } finally {
      enviando.current = false;
    }
  }, [cerrar]);

  // El latido: mientras se vuela y se comparte, cada CADA_MS; y enseguida al empezar o al volver la red.
  const id = activo?.id ?? null;
  useEffect(() => {
    if (!volando || !id) return;
    const tic = () => {
      if (tocaMandar(ultimoIntento.current, Date.now())) void mandar();
    };
    tic();
    const intervalo = window.setInterval(tic, 3000);
    const alVolverLaRed = () => void mandar();
    window.addEventListener("online", alVolverLaRed);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("online", alVolverLaRed);
    };
  }, [volando, id, mandar]);

  // La ruta cambió en vuelo: se le avisa al backend, así la familia ve la ruta y el destino nuevos.
  const firmaRuta = firmaDeRuta(ruta, puntos);
  useEffect(() => {
    if (!volando || !id || !rutaLista || puntos.length === 0 || rutaEnviada.current === firmaRuta) return;
    const t = window.setTimeout(async () => {
      const { ruta: texto, puntos: pts } = rutaRef.current;
      const firma = firmaDeRuta(texto, pts);
      if (!pts.length || rutaEnviada.current === firma) return;
      const r = await cambiarRutaSeguimiento(id, {
        ruta: texto,
        puntos: pts.map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo, nombre: p.label ?? "" })),
      });
      if ("ok" in r) {
        rutaEnviada.current = firma;
        setSinSenal(false);
      } else if (r.terminado) {
        cerrar();
      } else {
        // Sin señal: se vuelve a intentar enseguida (y al volver la red).
        window.setTimeout(() => setReintentoRuta((n) => n + 1), 8000);
      }
    }, 1200);
    return () => window.clearTimeout(t);
    // `puntos` entra por la firma: el arreglo se arma de nuevo en cada render del Mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volando, id, rutaLista, firmaRuta, reintentoRuta, cerrar]);
  useEffect(() => {
    const alVolverLaRed = () => setReintentoRuta((n) => n + 1);
    window.addEventListener("online", alVolverLaRed);
    return () => window.removeEventListener("online", alVolverLaRed);
  }, []);

  // Terminar el vuelo (el Mapa deja de volar) termina el seguimiento.
  useEffect(() => {
    const estabaVolando = volandoAntes.current;
    volandoAntes.current = volando;
    const seg = activoRef.current;
    if (estabaVolando && !volando && seg) {
      cerrar();
      void terminarSeguimiento(seg.id);
    }
  }, [volando, cerrar]);

  const compartir = useCallback(async () => {
    setError(null);
    if (activoRef.current) return urlDeSeguimiento(window.location.origin, activoRef.current.token);
    setCreando(true);
    try {
      const { ruta: texto, puntos: pts, aeronave: av } = rutaRef.current;
      const r = await crearSeguimiento({
        ruta: texto,
        puntos: pts.map((p) => ({ lat: p.lat, lon: p.lon, codigo: p.codigo, nombre: p.label ?? "" })),
        avion: av ? { tipo: av.type ?? "", icao: av.icao ?? "", matricula: av.registration ?? "" } : null,
        mostrarMatricula: mostrarRef.current,
      });
      if ("error" in r) {
        setError(r.error);
        return null;
      }
      // Si ya existía, manda lo que el backend tiene; si es nuevo, lo que el piloto eligió.
      const mostrar = r.seguimiento.yaExistia ? r.seguimiento.mostrarMatricula : mostrarRef.current;
      const s = { id: r.seguimiento.id, token: r.seguimiento.token, venceAt: r.seguimiento.venceAt, mostrarMatricula: mostrar };
      setMostrarMatricula(mostrar);
      guardar(s);
      ultimaEnviada.current = null;
      ultimoIntento.current = null;
      activoRef.current = s;
      // Recién creado (o retomado): el backend tiene la ruta con la que se pidió.
      rutaEnviada.current = r.seguimiento.yaExistia ? null : firmaDeRuta(texto, pts);
      setActivo(s);
      return urlDeSeguimiento(window.location.origin, s.token);
    } finally {
      setCreando(false);
    }
  }, []);

  const cambiarMostrarMatricula = useCallback(async (mostrar: boolean) => {
    const seg = activoRef.current;
    const matricula = rutaRef.current.aeronave?.registration ?? "";
    if (!seg) {
      setMostrarMatricula(mostrar);
      return;
    }
    if (mostrar && !matricula) return;
    setError(null);
    const r = await cambiarMatriculaVisible(seg.id, mostrar, matricula);
    if ("error" in r) {
      setError(r.error);
      return; // el interruptor queda como estaba: el link sigue mostrando lo de antes
    }
    setMostrarMatricula(mostrar);
    const nuevo = { ...seg, mostrarMatricula: mostrar };
    activoRef.current = nuevo;
    setActivo(nuevo);
    guardar(nuevo);
  }, []);

  const dejarDeCompartir = useCallback(async () => {
    const seg = activoRef.current;
    if (!seg) return;
    cerrar();
    const r = await terminarSeguimiento(seg.id);
    if ("error" in r) setError(r.error);
  }, [cerrar]);

  return {
    estado: creando ? "creando" : activo ? "compartiendo" : "apagado",
    url: activo ? urlDeSeguimiento(typeof window === "undefined" ? "" : window.location.origin, activo.token) : null,
    error,
    mostrarMatricula,
    sinMatricula: !aeronave?.registration,
    cambiarMostrarMatricula,
    sinSenal,
    vistas,
    delPlan: delPlan && activo !== null,
    compartir,
    dejarDeCompartir,
  };
}

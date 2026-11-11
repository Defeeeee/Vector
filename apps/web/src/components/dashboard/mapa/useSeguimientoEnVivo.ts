"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cambiarMatriculaVisible, crearSeguimiento, terminarSeguimiento } from "@/actions/seguimiento";
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
 * - Una lectura con más de 150 m de error no se manda (`posicionDeLectura`).
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
  /** El avión elegido en el Mapa (`Aircraft` sirve tal cual). Su tipo y designador salen en el link; la matrícula sólo si el piloto lo prende. */
  aeronave?: { registration: string; type: string; icao: string } | null;
}

function guardar(s: SeguimientoGuardado | null) {
  try {
    if (s) localStorage.setItem(CLAVE_SEGUIMIENTO, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_SEGUIMIENTO);
  } catch {
    /* sin almacenamiento: se comparte igual, sólo que no se retoma */
  }
}

export function useSeguimientoEnVivo({ lectura, volando, ruta, puntos, aeronave = null }: Opciones): SeguimientoEnVivo {
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

  const cerrar = useCallback(() => {
    guardar(null);
    setActivo(null);
    setMostrarMatricula(false); // el próximo vuelo vuelve a empezar apagado
    setSinSenal(false);
    setVistas(null);
    ultimaEnviada.current = null;
    ultimoIntento.current = null;
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
    compartir,
    dejarDeCompartir,
  };
}

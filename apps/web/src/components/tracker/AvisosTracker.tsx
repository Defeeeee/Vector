"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { leerSuscripcionVuelo } from "@/lib/avisos-vuelo";
import { claveDeAplicacion, esDispositivoIOS, type EstadoAvisos } from "@/lib/push";
import { CLAVE_AVISOS_TRACKER, estadoDeAvisosTracker, TEXTOS_AVISOS_TRACKER } from "@/lib/tracker";

/**
 * "Avisarme cuando despegue y aterrice", **una vez por cuenta y dispositivo**: un push web contra
 * `/api/tracker/avisos` (la suscripción es de la cuenta; el backend manda los avisos de los vuelos que
 * el piloto te asignó). Lo mismo que hace `/seguir` (`AvisarVuelo`) pero sin atarse a un link.
 *
 * - Pide permiso al tocar, nunca solo. El service worker ya está registrado en toda la app (`sw.ts`).
 * - En el iPhone sólo anda con la página en el inicio: se explica cómo (`instalar-app`).
 * - Apagar no desuscribe el navegador (puede servir a otra cosa de Vector): sólo le pide al backend que
 *   deje de mandar a esta cuenta.
 */
export default function AvisosTracker() {
  const [clave, setClave] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/seguimiento/avisos/clave", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clave?: string | null } | null) => {
        if (!cancelado) setClave(d?.clave || null);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  const leerEstado = useCallback(async () => {
    const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const esIOS = esDispositivoIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
    const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let pidio = false;
    try {
      pidio = localStorage.getItem(CLAVE_AVISOS_TRACKER) !== null;
    } catch {
      /* sin almacenamiento: se muestra como apagado */
    }
    const registro = soporta ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
    const suscripcion = registro ? await registro.pushManager.getSubscription().catch(() => null) : null;
    setEstado(estadoDeAvisosTracker({ soportaPush: soporta, esIOS, instalada, permiso: soporta ? Notification.permission : "default", suscripto: !!suscripcion, pidioAvisos: pidio }));
  }, []);

  useEffect(() => {
    if (!clave) return;
    void leerEstado();
    const alVolver = () => {
      if (document.visibilityState === "visible") void leerEstado();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [clave, leerEstado]);

  if (!clave || estado === null || estado === "sin-soporte") return null;

  const activar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueados" : "apagados");
        return;
      }
      const registro = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
      if (!registro) throw new Error("sin service worker");
      const suscripcion = (await registro.pushManager.getSubscription()) ?? (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveDeAplicacion(clave) as BufferSource }));
      const datos = leerSuscripcionVuelo(suscripcion.toJSON());
      if (!datos) throw new Error("suscripción inválida");
      const res = await fetch("/api/tracker/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
      if (!res.ok) {
        setError(res.status === 409 ? "Esta cuenta ya tiene todos los dispositivos con avisos que admite." : "No se pudieron activar los avisos. Probá de nuevo en un rato.");
        return;
      }
      try {
        localStorage.setItem(CLAVE_AVISOS_TRACKER, datos.endpoint);
      } catch {
        /* anda igual, sólo no recuerda el botón al recargar */
      }
      setEstado("prendidos");
    } catch {
      setError("No se pudieron activar los avisos. Probá de nuevo en un rato.");
    } finally {
      setTrabajando(false);
    }
  };

  const desactivar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();
      let endpoint: string | null = suscripcion?.endpoint ?? null;
      try {
        endpoint ??= localStorage.getItem(CLAVE_AVISOS_TRACKER);
      } catch {
        /* nada */
      }
      if (endpoint) {
        await fetch("/api/tracker/avisos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
      }
      try {
        localStorage.removeItem(CLAVE_AVISOS_TRACKER);
      } catch {
        /* nada */
      }
      setEstado("apagados");
    } catch {
      setError("No se pudieron apagar los avisos. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  };

  const { titulo, detalle } = TEXTOS_AVISOS_TRACKER[estado];
  const Icono = estado === "instalar-app" ? Smartphone : estado === "bloqueados" ? BellOff : Bell;

  return (
    <div className="flex items-start gap-4 border-t border-white/10 pt-5" data-testid="avisos-tracker">
      <Icono className={`mt-1 h-6 w-6 shrink-0 ${estado === "prendidos" ? "text-aviation-cyan" : "text-white/70"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-white">{titulo}</p>
        <p className="mt-1 text-base leading-snug text-white/70">{detalle}</p>
        {error && (
          <p className="mt-2 text-sm font-semibold text-red-300" role="alert">
            {error}
          </p>
        )}
        {estado === "apagados" && (
          <button type="button" onClick={() => void activar()} disabled={trabajando} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-aviation-cyan px-6 text-base font-bold text-noche disabled:opacity-60">
            {trabajando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
            Avisarme
          </button>
        )}
        {estado === "prendidos" && (
          <button type="button" onClick={() => void desactivar()} disabled={trabajando} className="mt-3 inline-flex min-h-11 items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-white/70 underline underline-offset-4 disabled:opacity-60">
            {trabajando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            No avisarme más
          </button>
        )}
      </div>
    </div>
  );
}

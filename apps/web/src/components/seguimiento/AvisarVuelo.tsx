"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { claveDeAvisoVuelo, estadoDeAvisosVuelo, leerSuscripcionVuelo, TEXTOS_AVISOS_VUELO } from "@/lib/avisos-vuelo";
import { claveDeAplicacion, esDispositivoIOS, type EstadoAvisos } from "@/lib/push";

/**
 * "Avisarme cuando despegue y cuando aterrice" en el link público del vuelo (migración 046).
 *
 * - **Sin cuenta.** La suscripción push del navegador se guarda en el backend sólo para este link
 *   (`/api/seguimiento/avisos/[token]`) y se borra con él. Quien manda el aviso es el grabador del
 *   VPS, no esta página: la familia no tiene por qué tenerla abierta.
 * - **Pide permiso al tocar, nunca solo.** Un "no" al abrir el link ya no se puede volver a preguntar.
 * - **El service worker ya está**: se registra en el layout raíz, en toda la app (también acá), y su
 *   handler de `push`/`notificationclick` sirve tal cual (`leerAviso`, `destinoDelAviso`).
 *   Al primer ingreso puede no estar registrado todavía cuando esto se dibuja, así que no se lo
 *   exige para ofrecer el botón: se espera (`ready`) recién al tocarlo.
 * - **"No avisarme más" no desuscribe el navegador**: esa suscripción puede ser también la de los
 *   avisos de la red de quien tenga Vector. Sólo le pide al backend que olvide este vuelo.
 * - Sin la clave VAPID del backend, o sin soporte de push, no se dibuja nada. En iPhone fuera de
 *   la pantalla de inicio el push web no existe: se explica cómo agregarla (`instalar-app`).
 * - Qué mostrar lo decide `estadoDeAvisosVuelo` (`lib/avisos-vuelo.ts`, con tests).
 */
export default function AvisarVuelo({ token }: { token: string }) {
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
      pidio = localStorage.getItem(claveDeAvisoVuelo(token)) !== null;
    } catch {
      /* sin almacenamiento: se muestra como apagado */
    }
    const registro = soporta ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
    const suscripcion = registro ? await registro.pushManager.getSubscription().catch(() => null) : null;
    setEstado(
      estadoDeAvisosVuelo({
        soportaPush: soporta,
        esIOS,
        instalada,
        permiso: soporta ? Notification.permission : "default",
        suscripto: !!suscripcion,
        pidioEsteVuelo: pidio,
      })
    );
  }, [token]);

  useEffect(() => {
    if (!clave) return;
    void leerEstado();
    // Si destrabó los permisos en la configuración y volvió a la página, se entera solo.
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
      // Recién registrado, el service worker tarda un instante; si no llega, no se cuelga.
      const registro = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      if (!registro) throw new Error("sin service worker");
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveDeAplicacion(clave) as BufferSource }));
      const datos = leerSuscripcionVuelo(suscripcion.toJSON());
      if (!datos) throw new Error("suscripción inválida");
      const res = await fetch(`/api/seguimiento/avisos/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      if (!res.ok) {
        setError(res.status === 404 ? "El vuelo ya terminó." : res.status === 409 ? "Este vuelo ya tiene todos los avisos que admite." : "No se pudieron activar los avisos. Probá de nuevo en un rato.");
        return;
      }
      try {
        localStorage.setItem(claveDeAvisoVuelo(token), datos.endpoint);
      } catch {
        /* sin almacenamiento: anda igual, sólo no recuerda el botón al recargar */
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
        endpoint ??= localStorage.getItem(claveDeAvisoVuelo(token));
      } catch {
        /* nada */
      }
      if (endpoint) {
        await fetch(`/api/seguimiento/avisos/${encodeURIComponent(token)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      try {
        localStorage.removeItem(claveDeAvisoVuelo(token));
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

  const { titulo, detalle } = TEXTOS_AVISOS_VUELO[estado];
  const Icono = estado === "instalar-app" ? Smartphone : estado === "bloqueados" ? BellOff : Bell;

  return (
    <div className="mt-3 flex items-start gap-3 border-t border-white/10 pt-3" data-testid="avisar-vuelo">
      <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${estado === "prendidos" ? "text-aviation-cyan" : "text-white/70"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">{titulo}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/70">{detalle}</p>
        {error && (
          <p className="mt-1.5 text-xs font-semibold text-white" role="alert">
            {error}
          </p>
        )}
        {estado === "apagados" && (
          <button
            type="button"
            onClick={() => void activar()}
            disabled={trabajando}
            className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-4 py-2 text-xs font-bold text-noche disabled:opacity-60"
          >
            {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
            Avisarme
          </button>
        )}
        {estado === "prendidos" && (
          <button
            type="button"
            onClick={() => void desactivar()}
            disabled={trabajando}
            className="mt-2 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-white/70 underline underline-offset-4 disabled:opacity-60"
          >
            {trabajando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            No avisarme más
          </button>
        )}
      </div>
    </div>
  );
}

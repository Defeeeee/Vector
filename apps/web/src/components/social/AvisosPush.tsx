"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { useAvisos } from "@/components/dashboard/Avisos";
import { borrarSuscripcionPush, guardarSuscripcionPush } from "@/actions/push";
import { claveDeAplicacion, esDispositivoIOS, estadoDeAvisos, type EstadoAvisos } from "@/lib/push";

/**
 * Los avisos push de la red en **este** dispositivo: "te siguió", "aplaudió", "comentó".
 *
 * - Se activan con un toque del piloto, nunca solos: el navegador pide permiso una sola
 *   vez, y un "no" al entrar a la app ya no se puede volver a preguntar.
 * - Cada teléfono o computadora se activa por separado, porque la suscripción es del
 *   navegador. Al cerrar sesión se da de baja (`olvidarDatosPersonales`), para que en un
 *   teléfono compartido no le lleguen al siguiente.
 * - Qué mostrar lo decide `estadoDeAvisos` (`lib/push.ts`), con tests. En un iPhone con
 *   Vector abierto en Safari se explica cómo instalarla, que es la única forma de recibir
 *   avisos ahí.
 * - Sin `clave` —el backend no tiene los avisos configurados— o sin service worker
 *   (`next dev`), no se dibuja.
 *
 * `compacto` es la versión de la Actividad: sólo aparece si hay algo para hacer. La del
 * Hangar muestra siempre el estado y deja apagarlos.
 */
export default function AvisosPush({ clave, compacto = false }: { clave: string | null; compacto?: boolean }) {
  const [estado, setEstado] = useState<EstadoAvisos | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const { notificar } = useAvisos();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const esIOS = esDispositivoIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const registro = soporta ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
      const suscripcion = registro ? await registro.pushManager.getSubscription().catch(() => null) : null;
      if (cancelado) return;
      setEstado(
        estadoDeAvisos({
          soportaPush: soporta && !!registro,
          esIOS,
          instalada,
          permiso: soporta ? Notification.permission : "default",
          suscripto: !!suscripcion,
        })
      );
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!clave || estado === null || estado === "sin-soporte") return null;
  if (compacto && (estado === "prendidos" || estado === "bloqueados")) return null;

  const activar = async () => {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueados" : "apagados");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: claveDeAplicacion(clave) as BufferSource,
        }));
      const { keys } = suscripcion.toJSON();
      const ok = await guardarSuscripcionPush({
        endpoint: suscripcion.endpoint,
        keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
      });
      if (!ok) {
        // Sin la fila en el backend, la suscripción no sirve: se deshace para que el
        // estado de la pantalla no mienta.
        await suscripcion.unsubscribe().catch(() => undefined);
        notificar({ tipo: "error", titulo: "No se pudieron activar los avisos", detalle: "Probá de nuevo en un rato." });
        return;
      }
      setEstado("prendidos");
      notificar({
        tipo: "exito",
        titulo: "Avisos activados",
        detalle: "Te avisamos cuando te sigan, te aplaudan o te comenten.",
      });
    } catch {
      notificar({ tipo: "error", titulo: "No se pudieron activar los avisos" });
    } finally {
      setTrabajando(false);
    }
  };

  const desactivar = async () => {
    setTrabajando(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await borrarSuscripcionPush(suscripcion.endpoint);
        await suscripcion.unsubscribe();
      }
      setEstado("apagados");
    } catch {
      notificar({ tipo: "error", titulo: "No se pudieron desactivar los avisos" });
    } finally {
      setTrabajando(false);
    }
  };

  const textos: Record<Exclude<EstadoAvisos, "sin-soporte">, { titulo: string; detalle: string }> = {
    apagados: {
      titulo: "Avisos de tu red",
      detalle: "Te avisamos en este dispositivo cuando te sigan, te aplaudan o te comenten.",
    },
    prendidos: {
      titulo: "Avisos activados en este dispositivo",
      detalle: "Te llegan cuando te siguen, te aplauden o te comentan. Nunca datos de tu bitácora.",
    },
    bloqueados: {
      titulo: "Los avisos están bloqueados en este navegador",
      detalle: "Para recibirlos, permitilos en la configuración del sitio y volvé a esta pantalla.",
    },
    "instalar-app": {
      titulo: "Avisos en el iPhone",
      detalle: "Llegan con Vector instalado: en Safari, tocá Compartir y después “Agregar a inicio”.",
    },
  };
  const { titulo, detalle } = textos[estado];
  const Icono = estado === "prendidos" ? Bell : estado === "instalar-app" ? Smartphone : estado === "bloqueados" ? BellOff : Bell;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-[2rem] border p-5 ${
        compacto
          ? "border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.05] dark:bg-aviation-cyan/[0.05]"
          : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
          <Icono className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">{titulo}</p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{detalle}</p>
        </div>
      </div>
      {estado === "apagados" && (
        <button
          type="button"
          onClick={() => void activar()}
          disabled={trabajando}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-aviation-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-aviation-blue-dark transition-colors disabled:opacity-60 shrink-0"
        >
          {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Activar avisos
        </button>
      )}
      {estado === "prendidos" && (
        <button
          type="button"
          onClick={() => void desactivar()}
          disabled={trabajando}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors disabled:opacity-60 shrink-0"
        >
          {trabajando && <Loader2 className="w-4 h-4 animate-spin" />}
          Desactivar
        </button>
      )}
    </div>
  );
}

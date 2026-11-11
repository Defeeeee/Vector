"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SeguimientoMapa from "./SeguimientoMapa";
import { LogoVector } from "@/components/Marca";
import { CADA_MIRANDO_MS, conMiles, haceCuanto, tituloDelEstado, type SeguimientoPublico } from "@/lib/seguimiento";

/**
 * Lo que ve quien abre `/seguir/[token]`: dónde va el avión, hace cuánto se actualizó, y el mapa.
 *
 * - **Vuelve a preguntar cada ~15 s** a `/api/seguimiento/ver/[token]` mientras el vuelo está en
 *   curso, y al volver a mirar la pestaña. Al terminar o vencer deja de preguntar y dice "El vuelo
 *   terminó" con la última posición. Si el link ya no se puede ver (404), lo dice.
 * - **"Hace 40 s" sin `toLocaleString`** (invariante 1): la hora del servidor al contestar más lo
 *   que pasó en esta pestaña desde entonces (`performance.now`), contra la hora de la posición. Ni
 *   el reloj de quien mira ni el del piloto entran en la cuenta. El primer dibujo (server) y la
 *   hidratación coinciden: el contador arranca en 0.
 * - Un corte de red no borra lo que se estaba viendo: queda la última posición y el aviso.
 */

type Fin = "no-disponible" | null;

const rotulo = "font-mono text-[10px] font-bold uppercase tracking-wider";

export default function SeguimientoVivo({ token, inicial }: { token: string; inicial: SeguimientoPublico }) {
  const [datos, setDatos] = useState(inicial);
  const [fin, setFin] = useState<Fin>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [transcurridoMs, setTranscurridoMs] = useState(0);
  const [suelto, setSuelto] = useState(false);
  const [centrar, setCentrar] = useState(0);
  const recibidoEn = useRef<number | null>(null);
  const preguntando = useRef(false);

  const enVuelo = datos.estado === "en_vuelo" && fin === null;

  const preguntar = useCallback(async () => {
    if (preguntando.current) return;
    preguntando.current = true;
    try {
      const res = await fetch(`/api/seguimiento/ver/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) {
        setFin("no-disponible");
        return;
      }
      if (!res.ok) {
        setSinConexion(true);
        return;
      }
      setDatos((await res.json()) as SeguimientoPublico);
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
  const hace = haceCuanto(datos.ultima?.hora ?? null, ahora);
  const u = datos.ultima;

  if (fin === "no-disponible") {
    return (
      <Pantalla>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className={`${rotulo} text-white/40`}>Seguimiento</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Este link ya no está disponible</h1>
          <p className="mt-3 max-w-sm text-sm text-white/60">El vuelo terminó hace un rato, o el link venció. Los links duran lo que dura el vuelo.</p>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <header className="px-5 pb-4 pt-5 sm:px-8">
        <p className={`${rotulo} flex items-center gap-2 ${enVuelo ? "text-aviation-cyan" : "text-white/50"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${enVuelo ? "bg-aviation-cyan" : "bg-white/40"}`} />
          {enVuelo ? "Seguimiento en vivo" : "Seguimiento"}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {enVuelo ? `${datos.nombre} está volando` : tituloDelEstado(datos.estado)}
        </h1>
        {datos.ruta && <p className="mt-1 font-mono text-sm text-white/60">{datos.ruta}</p>}

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-white/10 pt-4">
          <Dato rotulo={enVuelo ? "Actualizado" : "Última posición"} valor={u ? (hace ?? "—") : "Esperando la primera posición"} grande={!u} />
          {u && u.alt_ft !== null && <Dato rotulo="Altura GPS" valor={`${conMiles(u.alt_ft)} ft`} />}
          {u && u.gs_kt !== null && <Dato rotulo="Velocidad" valor={`${Math.round(u.gs_kt)} kt`} />}
          {u && u.track !== null && <Dato rotulo="Rumbo" valor={`${String(Math.round(u.track) % 360).padStart(3, "0")}°`} />}
        </div>
        {sinConexion && enVuelo && <p className="mt-3 text-xs text-amber-300">Sin conexión: se muestra la última posición que llegó. Reintentando.</p>}
      </header>

      <div className="relative min-h-[320px] flex-1">
        <SeguimientoMapa datos={datos} centrar={centrar} onSuelto={() => setSuelto(true)} />
        {suelto && u && (
          <button
            type="button"
            onClick={() => {
              setSuelto(false);
              setCentrar((n) => n + 1);
            }}
            className="absolute bottom-8 left-4 z-[500] rounded-full bg-aviation-cyan px-4 py-2 text-sm font-bold text-noche shadow-lg"
          >
            Centrar en el avión
          </button>
        )}
      </div>

      <footer className="flex items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <p className="text-[11px] leading-snug text-white/40">Posición del GPS del teléfono del piloto: puede tardar o cortarse. No reemplaza la comunicación con el vuelo.</p>
        <Link href="/" className="shrink-0" aria-label="Vector">
          <LogoVector className="h-5 w-auto" sobreOscuro />
        </Link>
      </footer>
    </Pantalla>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <main className="dark flex min-h-[100dvh] flex-col bg-noche text-white">{children}</main>;
}

function Dato({ rotulo: r, valor, grande }: { rotulo: string; valor: string; grande?: boolean }) {
  return (
    <div>
      <p className={`${rotulo} text-white/40`}>{r}</p>
      <p className={`mt-0.5 font-mono font-bold text-white ${grande ? "text-sm" : "text-lg"}`}>{valor}</p>
    </div>
  );
}

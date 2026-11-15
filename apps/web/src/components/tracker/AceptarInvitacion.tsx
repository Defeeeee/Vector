"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { aceptarInvitacion } from "@/actions/tracker";

/** "Aceptar": con sesión, sumarse como seguidor del piloto que mandó el link. Después, al inicio del tracker. */
export default function AceptarInvitacion({ token, piloto }: { token: string; piloto: string }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function aceptar() {
    setPendiente(true);
    setError(null);
    const r = await aceptarInvitacion(token);
    if ("error" in r) {
      setError(r.error);
      setPendiente(false);
      return;
    }
    setListo(true);
    router.replace("/");
    router.refresh();
  }

  if (listo) {
    return (
      <p role="status" className="text-lg font-semibold text-aviation-cyan">
        Listo. Ya seguís a {piloto}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void aceptar()}
        disabled={pendiente}
        className="flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-aviation-cyan px-6 text-lg font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-60"
      >
        {pendiente && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
        Aceptar y seguir sus vuelos
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Flag, Loader2, MoreHorizontal, UserCheck } from "lucide-react";
import MenuAcciones from "@/components/MenuAcciones";
import DialogoReportar from "./DialogoReportar";
import { useAvisos } from "@/components/dashboard/Avisos";
import { bloquearPiloto, desbloquearPiloto } from "@/actions/social";
import { conArroba } from "@/lib/handle";
import type { RelacionSocial } from "@/types";

/**
 * El "···" del perfil de otro piloto: bloquear o desbloquear, y reportar.
 *
 * Bloquear pide confirmación y dice qué pasa, porque corta los seguimientos en las dos
 * direcciones y desbloquear no los devuelve. Después se vuelve a dibujar la pantalla:
 * el perfil pasa a mostrarse sin horas ni publicaciones.
 */
export default function MenuPiloto({ handle, relacion }: { handle: string; relacion: RelacionSocial }) {
  const router = useRouter();
  const { notificar } = useAvisos();
  const [reportando, setReportando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const arroba = conArroba(handle);

  const bloquear = () => {
    const seguro = window.confirm(
      `¿Bloquear a ${arroba}?\n\nNo va a ver tu perfil ni lo que publicás, vos no vas a ver lo suyo, y dejan de seguirse. No se le avisa.`
    );
    if (!seguro) return;
    startTransition(async () => {
      const r = await bloquearPiloto(handle);
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      notificar({ tipo: "exito", titulo: `Bloqueaste a ${arroba}`, detalle: "Lo podés desbloquear desde acá o desde el Hangar." });
      router.refresh();
    });
  };

  const desbloquear = () => {
    startTransition(async () => {
      const r = await desbloquearPiloto(handle);
      if (!r.ok) {
        notificar({ tipo: "error", titulo: r.error });
        return;
      }
      notificar({ tipo: "exito", titulo: `Desbloqueaste a ${arroba}`, detalle: "Si querés seguirlo, pedíselo de nuevo." });
      router.refresh();
    });
  };

  return (
    <>
      <MenuAcciones
        etiqueta="Más opciones"
        claseBoton="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-white/10 p-3 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors"
        acciones={[
          relacion === "bloqueado"
            ? { etiqueta: `Desbloquear a ${arroba}`, icono: UserCheck, alElegir: desbloquear }
            : {
                etiqueta: `Bloquear a ${arroba}`,
                detalle: "Deja de ver lo tuyo, y vos lo suyo",
                icono: Ban,
                peligro: true,
                alElegir: bloquear,
              },
          { etiqueta: "Reportar perfil", icono: Flag, alElegir: () => setReportando(true) },
        ]}
      >
        {pendiente ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
      </MenuAcciones>
      {reportando && <DialogoReportar tipo="perfil" objetivo={handle} alCerrar={() => setReportando(false)} />}
    </>
  );
}

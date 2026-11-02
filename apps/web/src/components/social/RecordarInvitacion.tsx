"use client";

import { useEffect } from "react";
import { CLAVE_INVITACION, guardarInvitacion } from "@/lib/invitacion";

/**
 * En `/u/<handle>`, para quien lo abre sin cuenta: recuerda quién lo invitó, así cuando
 * se suma a Vector y crea su @, la Red le ofrece seguirlo (`InvitacionPendiente`). No
 * dibuja nada.
 */
export default function RecordarInvitacion({ handle }: { handle: string }) {
  useEffect(() => {
    try {
      const valor = guardarInvitacion(handle, Date.now());
      if (valor) localStorage.setItem(CLAVE_INVITACION, valor);
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): se pierde el recordatorio, nada más.
    }
  }, [handle]);
  return null;
}

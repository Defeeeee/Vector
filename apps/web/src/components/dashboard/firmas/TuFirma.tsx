"use client";

import FirmaPiloto from "@/components/dashboard/plan-de-vuelo/FirmaPiloto";

/**
 * Tu firma de titular: la misma que firma los planes de vuelo (`firmas_plan_vuelo`, migración
 * 024), que el libro en PDF pone en cada hoja con «Con mi firma de titular». Hasta la 3.36.0 sólo
 * se podía cambiar desde el editor de un plan.
 */
export default function TuFirma({ inicial }: { inicial: string | null }) {
  return (
    <div className="max-w-md">
      <FirmaPiloto inicial={inicial} onCambio={() => {}} />
    </div>
  );
}

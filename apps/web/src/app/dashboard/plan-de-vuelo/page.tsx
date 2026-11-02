import PageHeader from "@/components/dashboard/PageHeader";
import ListaPlanes, { type FilaPlan } from "@/components/dashboard/plan-de-vuelo/ListaPlanes";
import { localDesdeUtc } from "@/lib/formulario-plan";
import { avionesParaPlan, listarPlanes, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";

/**
 * Los planes de vuelo guardados (migración 024 del backend).
 *
 * Arriba, empezar uno: con un avión (el perfil del avión llena casi todo), sin avión, o
 * desde el planificador. Abajo, los últimos, con duplicar: el mismo vuelo otro día es lo
 * que más se repite (28 planes de Federico en FPL.AR en dos meses, casi todos repetidos).
 *
 * Las fechas se escriben acá, en el server (invariante 1).
 */

function cuando(dof: string | null, eobt: string | null): string {
  if (!dof || !eobt) return "Sin fecha";
  const local = localDesdeUtc(dof, eobt);
  if (!local) return "Sin fecha";
  const [, m, d] = local.fecha.split("-");
  return `${d}/${m} ${local.hora} · ${eobt}Z`;
}

export default async function PlanDeVueloPage() {
  const [planes, aviones, piloto] = await Promise.all([listarPlanes(), avionesParaPlan(), pilotoParaPlan()]);

  const filas: FilaPlan[] | null = planes
    ? planes.map((p) => ({
        id: p.id,
        salida: p.salida,
        destino: p.destino,
        matricula: p.matricula,
        cuando: cuando(p.dof, p.eobt),
        estado: p.vuelo_id
          ? "volado"
          : p.cancelado_at
            ? "cancelado"
            : p.enviado_at
              ? "enviado"
              : p.descargado_at
                ? "descargado"
                : p.completo
                  ? "completo"
                  : "borrador",
      }))
    : null;

  return (
    <div className="space-y-8 md:space-y-10">
      <PageHeader eyebrow="Preparar vuelo" title="Plan de vuelo">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
          El formulario de EANA, listo para mandar a la oficina ARO/AIS. Se guarda solo mientras lo completás, y un
          vuelo que se repite se duplica con un toque.
        </p>
      </PageHeader>
      <ListaPlanes
        filas={filas}
        aviones={aviones.map((a) => ({
          id: a.id,
          registration: a.registration,
          icao: a.icao,
          cruise_tas_kt: a.cruise_tas_kt ?? null,
          plan_vuelo: a.plan_vuelo ?? null,
        }))}
        piloto={piloto}
      />
    </div>
  );
}

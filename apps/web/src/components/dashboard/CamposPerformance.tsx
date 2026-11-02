/**
 * Los tres números de performance de una aeronave: velocidad, consumo y tanque.
 *
 * Vive en un componente propio porque el alta y la edición son **dos formularios
 * distintos** —`AircraftForm` y `AircraftCard`— y tres campos duplicados en dos lados
 * divergen. Es la misma lección que dejó `splitRoute`, que en este repo llegó a estar
 * escrita cinco veces con cuatro criterios distintos.
 *
 * **Todos opcionales, y la pantalla lo dice.** Sin estos datos el planificador estima
 * con constantes y avisa que está estimando; con ellos calcula de verdad. Poner un
 * default de 110 kt sería peor que no tenerlos: el piloto vería una velocidad que nadie
 * cargó, sin forma de distinguirla de una real.
 */

interface Props {
  /** Valores actuales al editar. Vacío al dar de alta. */
  aeronave?: {
    cruise_tas_kt?: number;
    fuel_burn_lph?: number;
    fuel_capacity_l?: number;
  };
  /** Clases del input, que difieren entre el alta y la edición. */
  claseInput: string;
  claseLabel: string;
}

const CAMPOS = [
  {
    name: "cruise_tas_kt",
    label: "TAS de crucero (kt)",
    placeholder: "ej. 110",
    clave: "cruise_tas_kt" as const,
  },
  {
    name: "fuel_burn_lph",
    label: "Consumo (L/h)",
    placeholder: "ej. 32",
    clave: "fuel_burn_lph" as const,
  },
  {
    name: "fuel_capacity_l",
    label: "Tanque utilizable (L)",
    placeholder: "ej. 120",
    clave: "fuel_capacity_l" as const,
  },
];

export default function CamposPerformance({ aeronave, claseInput, claseLabel }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Performance
        </p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
          opcional — es lo que usa el planificador de vuelo
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {CAMPOS.map((campo) => (
          <div key={campo.name} className="space-y-2 group">
            <label className={claseLabel}>{campo.label}</label>
            <input
              name={campo.name}
              type="text"
              inputMode="decimal"
              defaultValue={aeronave?.[campo.clave] ?? ""}
              placeholder={campo.placeholder}
              className={claseInput}
            />
          </div>
        ))}
      </div>

      {/* La capacidad es la **utilizable**, no la del folleto: el combustible no
          utilizable está adentro del tanque y no vuela. Decirlo acá evita que alguien
          cargue el número grande y planifique con litros que no tiene. */}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        El tanque es el <strong>utilizable</strong>, no el total: lo que el POH declara como no
        utilizable no vuela con vos.
      </p>
    </div>
  );
}

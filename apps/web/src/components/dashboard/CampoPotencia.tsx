"use client";

import { useId } from "react";

/**
 * La potencia del avión, en HP: una columna de la hoja del libro de vuelo de ANAC
 * ("Aeronaves utilizadas": marca y modelo, matrícula, potencia y clase). En un
 * multimotor va la total (Res. ANAC 470/2025, Anexo I, punto 5).
 *
 * Vive en un componente propio por lo mismo que `CamposPerformance`: el alta y la
 * edición son dos formularios distintos. **Opcional**: sin ella, el PDF deja el
 * casillero en blanco para completar a mano, que es mejor que un número que nadie cargó.
 */
export default function CampoPotencia({
  valor,
  claseInput,
  claseLabel,
}: {
  valor?: number | null;
  claseInput: string;
  claseLabel: string;
}) {
  // En el Hangar conviven el alta y la edición: un `id` fijo se repetiría.
  const id = useId();
  return (
    <div className="space-y-2 group">
      <label htmlFor={id} className={claseLabel}>
        Potencia (HP)
      </label>
      <input
        id={id}
        name="potencia_hp"
        type="text"
        inputMode="numeric"
        defaultValue={valor ?? ""}
        placeholder="ej. 110"
        className={claseInput}
      />
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-1">
        Opcional: va en el libro de vuelo en PDF. En un multimotor, la total.
      </p>
    </div>
  );
}

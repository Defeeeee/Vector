/**
 * La casilla que marca a un equipo como simulador.
 *
 * Vive en un componente propio por el mismo motivo que `CamposPerformance`: el alta y
 * la edición son dos formularios distintos, y un campo duplicado en dos lados diverge.
 *
 * ## Por qué la marca va en la aeronave y no en el vuelo
 *
 * Se carga una vez al dar de alta el equipo y a partir de ahí cada fila que lo use
 * queda marcada sola. Un selector por vuelo se olvida — y olvidarlo significa contar
 * una hora de simulador como hora de vuelo, que infla el requisito más grande del
 * tracker de la licencia sin que nada en pantalla lo delate.
 *
 * ## El input oculto que va antes
 *
 * Un checkbox desmarcado **no se envía**. Sin el hidden, un `PATCH` no podría
 * distinguir "desmarcado" de "el formulario no trae el campo", y un equipo marcado
 * como simulador por error no se podría volver a marcar como avión.
 *
 * El hidden con el mismo `name` viaja siempre, así que el campo llega una vez cuando
 * está desmarcado y dos cuando está tildado. La server action lee con
 * `getAll(...).includes("true")` — `get` devolvería el primero, que es siempre
 * `"false"`.
 */

interface Props {
  aeronave?: { is_simulator?: boolean };
  claseLabel: string;
}

export default function CampoSimulador({ aeronave, claseLabel }: Props) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input type="hidden" name="is_simulator" value="false" />
      <input
        type="checkbox"
        name="is_simulator"
        value="true"
        defaultChecked={aeronave?.is_simulator ?? false}
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-zinc-300 dark:border-white/20 bg-transparent text-zinc-900 dark:text-white accent-zinc-900 dark:accent-white cursor-pointer"
      />
      <span className="min-w-0">
        <span className={`${claseLabel} block ml-0`}>Es un simulador</span>
        <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">
          Las sesiones que carguen este equipo no suman tiempo total de vuelo: sólo la
          columna de instrucción terrestre.
        </span>
      </span>
    </label>
  );
}

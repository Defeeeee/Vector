import GuiaShell from "@/components/publico/GuiaShell";
import PracticaExamen from "@/components/publico/PracticaExamen";
import { PREGUNTAS } from "@/lib/examen-ppa";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("examen-ppa");

/**
 * La práctica del examen teórico de PPA, con el banco de preguntas de ANAC
 * (`docs/normativa/examen-ppa-anac.md`). Pública, como las demás guías: se practica sin
 * cuenta.
 */
export default function GuiaExamenPpa() {
  return (
    <GuiaShell guia={guia("examen-ppa")} fuentes={[FUENTES.bancoPpa, FUENTES.raac61]}>
      <p>
        ANAC publica el banco de preguntas del curso teórico de Piloto Privado de Avión con sus respuestas, para
        alumnos e instructores. Acá están las <strong>{PREGUNTAS.length} preguntas</strong> de ese banco que tienen
        una respuesta marcada, con sus figuras, ordenadas por materia, para que practiques.
      </p>

      <h2 id="practicar">Practicar</h2>
      <p>Elegí una materia o todas, contestá de a una y fijate al toque si estaba bien. Las que falles quedan para repasar.</p>
      <PracticaExamen />

      <h2 id="de-donde">De dónde salen las preguntas</h2>
      <p>
        Del documento <strong>&quot;Preguntas de acuerdo RAAC 61.105, Conocimientos aeronáuticos&quot;</strong>, publicado por
        ANAC con la Resolución 306/2014 en la página del examen de PPA. Según el propio documento, las preguntas con sus
        respuestas corresponden al programa de instrucción reconocida del curso teórico, y el cuestionario forma parte de
        la evaluación de los exámenes de idoneidad.
      </p>
      <ul>
        <li>
          Las <strong>figuras</strong> son las que el mismo banco pone en cada pregunta (la tabla de altitud de densidad, el
          VOR, el ADF, el gráfico de viento cruzado…). Tocalas para verlas enteras.
        </li>
        <li>
          Quedan afuera <strong>6 preguntas</strong> en las que el documento no marca una única respuesta correcta: no
          adivinamos respuestas.
        </li>
        <li>
          El banco es de 2014 y la <strong>RAAC 61 se reeditó en enero de 2026</strong>. En las preguntas de reglamentación
          mostramos la respuesta del banco, con un aviso: ante una duda, manda la norma vigente.
        </li>
        <li>
          Las materias son las de los capítulos de ANAC. Lo que el banco no clasifica (CRM, prevención de accidentes,
          mercancías peligrosas) está en Generalidades.
        </li>
      </ul>
    </GuiaShell>
  );
}

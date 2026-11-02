import Link from "next/link";
import GuiaShell, { Nota } from "@/components/publico/GuiaShell";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("experiencia-reciente");

export default function GuiaExperienciaReciente() {
  return (
    <GuiaShell guia={guia("experiencia-reciente")} fuentes={[FUENTES.raac61]}>
      <p>
        Tener la licencia no alcanza. Para ejercer sus atribuciones, la <strong>RAAC 61.060</strong>{" "}
        pide que se cumplan cuatro condiciones a la vez, todas al día. Esto es lo que conviene revisar
        antes de volar.
      </p>

      <h2 id="condiciones">Las cuatro condiciones</h2>
      <ol>
        <li>
          <strong>Certificado médico aeronáutico (CMA) vigente</strong>, otorgado bajo la RAAC 67. Su
          validez la fija la RAAC 67 (sección 67.015).
        </li>
        <li><strong>Habilitaciones válidas.</strong></li>
        <li>
          <strong>Experiencia reciente</strong>: la de la sección 61.140 para el piloto al mando, y la
          de la 61.130 para el copiloto.
        </li>
        <li>
          <strong>Repaso de vuelo</strong> (61.135), o el programa de entrenamiento aprobado del
          explotador si volás bajo las RAAC 121 o 135.
        </li>
      </ol>

      <h2 id="90-180">Experiencia reciente: 90 o 180 días</h2>
      <p>
        Para actuar como piloto al mando o copiloto, en los <strong>90 días</strong> anteriores tenés
        que haber hecho <strong>3 despegues y 3 aterrizajes</strong>, con sus circuitos de tránsito,
        siendo el único que manipula los controles, en cada categoría y clase de aeronave (y tipo, si
        corresponde). Para los <strong>pilotos privados</strong> —y los de planeador y globo libre— el
        plazo se extiende a <strong>180 días</strong> (61.140(a)).
      </p>

      <h2 id="noche">De noche</h2>
      <p>
        Para ser piloto al mando de noche en una aeronave certificada para un solo piloto, en los{" "}
        <strong>180 días</strong> anteriores tenés que haber hecho <strong>3 despegues y 3 aterrizajes
        nocturnos hasta la detención completa</strong>, en la categoría, clase o tipo que vas a usar; o
        tener una habilitación de vuelo por instrumentos vigente (61.140(b)).
      </p>

      <h2 id="si-no-llegas">Si no llegás</h2>
      <p>
        Si volás bajo la RAAC 91 y tenés el repaso de vuelo vigente, podés recuperar la experiencia
        reciente de dos maneras: <strong>reentrenarte solo</strong>, sin personas a bordo ni carga,
        haciendo los circuitos de tránsito completos que te falten, o <strong>con un instructor</strong>.
        Lo que hagas se deja registrado en el libro de vuelo (61.140(c)(2)).
      </p>

      <h2 id="repaso">Repaso de vuelo, cada 24 meses</h2>
      <ul>
        <li>
          No podés actuar como piloto al mando salvo que, en los <strong>24 meses anteriores al mes</strong>{" "}
          del vuelo, hayas hecho un repaso con un instructor habilitado y lo tengas{" "}
          <strong>firmado en tu libro de vuelo</strong>.
        </li>
        <li>
          Son como mínimo <strong>1 hora de instrucción en tierra y 1 hora en vuelo</strong>: un repaso
          de las reglas generales de vuelo, de tránsito aéreo y de operación de las aeronaves, y de las
          maniobras y procedimientos que el instructor considere necesarios.
        </li>
        <li>
          No lo necesitás si en ese período aprobaste una prueba de pericia en vuelo para una licencia o
          una habilitación (61.135).
        </li>
      </ul>

      <h2 id="24-meses">Más de 24 meses sin volar</h2>
      <p>
        Quien deja de volar por <strong>más de 24 meses</strong> pierde las atribuciones de su licencia.
        Para recuperarlas necesita el CMA vigente, un reentrenamiento con un instructor con licencia y
        habilitación similar o superior, y aprobar un examen de pericia ante ANAC o un examinador
        designado (61.060(a)(2)).
      </p>

      <h2 id="alumno">Si sos alumno piloto</h2>
      <p>
        La autorización de alumno piloto vale <strong>24 meses</strong>, con el certificado médico
        correspondiente (61.060(b)). En los vuelos de travesía solo tenés que llevar tu libro de vuelo,
        como evidencia de la autorización de tu instructor (61.120(d)(2)).
      </p>

      <Nota titulo="Cómo lo contesta Vector">
        El Inicio de Vector te dice si podés volar hoy cruzando estas condiciones con tus vuelos y tus
        documentos, y si algo falta, qué tenés que hacer. Si le falta un dato —por ejemplo, no cargaste
        tu CMA—, no te da por habilitado: te dice qué falta. Y si estás juntando horas, mirá{" "}
        <Link href="/guias/requisitos-pca">los requisitos de la PCA</Link>.
      </Nota>
    </GuiaShell>
  );
}

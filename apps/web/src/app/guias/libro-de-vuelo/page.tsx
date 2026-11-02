import Link from "next/link";
import GuiaShell, { Nota } from "@/components/publico/GuiaShell";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("libro-de-vuelo");

/** Las siglas de finalidad del punto 5 del procedimiento vigente (Res. ANAC 470/2025). */
const FINALIDADES: [string, string][] = [
  ["INST", "Instrucción (recepción de instrucción)"],
  ["VP", "Vuelo privado"],
  ["ADAP", "Adaptación"],
  ["READ", "Readaptación"],
  ["ENT", "Entrenamiento"],
  ["EXA", "Examen"],
  ["I", "Instructor (impartición de instrucción)"],
  ["IP", "Inspector (inspección de pilotos o alumnos pilotos)"],
  ["ACR", "Acrobacia"],
  ["AER", "Aeroaplicador"],
  ["CI", "Combate contra incendios de bosques y campos"],
  ["FOR", "Formación (aerofotogrametría, prospección, filmación y afines)"],
  ["LP", "Lanzamiento de paracaidistas"],
  ["RP", "Remolque de planeador"],
  ["PA", "Prueba de aeronaves"],
  ["SAN", "Sanitario"],
  ["TA", "Trabajo aéreo"],
  ["VO", "Vuelo oficial"],
  ["LA", "Línea aérea (RAAC 121)"],
  ["N", "Vuelo no regular (RAAC 135)"],
];

export default function GuiaLibroDeVuelo() {
  return (
    <GuiaShell
      guia={guia("libro-de-vuelo")}
      fuentes={[FUENTES.raac61, FUENTES.res470, FUENTES.procedimiento, FUENTES.guiaCad, FUENTES.paginaCad, FUENTES.res147]}
    >
      <p>
        El libro de vuelo es el registro de tu actividad: con sus anotaciones se demuestran la
        instrucción y la experiencia que pide cada licencia y la experiencia reciente (RAAC 61.120). Lo
        que declarás en él tiene carácter de declaración jurada.
      </p>

      <h2 id="que-rige">Papel, digital impreso y CAD: qué rige</h2>
      <ul>
        <li>
          Desde el <strong>1 de noviembre de 2025</strong>, los pilotos que vuelan bajo la RAAC 91
          —escuelas de vuelo incluidas— registran su actividad en el <strong>Casillero Aeronáutico
          Digital (CAD)</strong> de ANAC (Res. 470/2025). Te lo explicamos en{" "}
          <Link href="/guias/cad-anac-registro-de-horas">la guía del CAD</Link>.
        </li>
        <li>
          El libro en papel <strong>sigue</strong>: los dos registros conviven, con las anotaciones y
          las certificaciones de siempre (Anexo I, punto 9.b.i).
        </li>
        <li>
          Para anotar y certificar podés usar el libro tradicional o el libro de vuelo{" "}
          <strong>&ldquo;en formato digital impreso&rdquo;</strong> (punto 9.b.ii).
        </li>
        <li>
          Lo que anotás en papel tiene que <strong>coincidir</strong> con lo que declarás en el CAD
          (punto 9.b.iii).
        </li>
        <li>
          Por ahora, al declarar en el CAD también se sube el libro en papel{" "}
          <strong>escaneado de los dos lados</strong>, &ldquo;como medida complementaria y
          transitoria&rdquo; (punto 4). Si usás el libro en formato digital impreso, es esa hoja
          firmada la que escaneás.
        </li>
        <li>
          El <strong>foliado en papel</strong> —la verificación presencial en ANAC— rigió hasta el 31
          de diciembre de 2025. Desde el 2 de enero de 2026, sólo existe el registro electrónico en el
          CAD.
        </li>
      </ul>

      <h2 id="encabezado">El encabezado</h2>
      <p>
        Cada hoja lleva tu <strong>apellido y nombre</strong>, la <strong>licencia</strong> de la que
        sos titular y su número, y el <strong>legajo</strong>: el número que asigna el Departamento
        Registro de Licencias de la Dirección de Licencias al Personal de ANAC y que figura en tu
        licencia.
      </p>

      <h2 id="columnas">Columna por columna</h2>

      <h3>Fecha</h3>
      <p>
        En cada renglón van el día y el mes; el año va una sola vez, en el encabezado de la hoja. Por
        eso, cuando cambia el año, conviene empezar una hoja nueva.
      </p>

      <h3>Horas de salida y de llegada</h3>
      <p>
        Las del despegue y el aterrizaje. La hoja tradicional aclara, en su pie, que van en{" "}
        <strong>UTC</strong>. Para calcular el tiempo de vuelo se cuenta desde que el avión se mueve
        por sus propios medios para despegar hasta que se detiene al final: el tiempo &ldquo;entre
        calzas&rdquo;.
      </p>

      <h3>Desde y hasta</h3>
      <p>
        El aeródromo de salida y el de llegada, con la sigla de tres letras o el código OACI de cuatro
        (SADF, SAAR). En un <strong>vuelo local</strong>, el mismo aeródromo en los dos casilleros
        —SADF SADF—, como lo escribe el Libro de Vuelo Electrónico del CAD; el tiempo va en las
        columnas &ldquo;sobre aeródromo&rdquo;.
      </p>

      <h3>Finalidad del vuelo</h3>
      <p>Con las siglas del procedimiento vigente. Las que más usa un alumno están primero:</p>
      <table>
        <thead>
          <tr>
            <th>Sigla</th>
            <th>Finalidad</th>
          </tr>
        </thead>
        <tbody>
          {FINALIDADES.map(([sigla, texto]) => (
            <tr key={sigla}>
              <td className="data font-semibold">{sigla}</td>
              <td>{texto}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Aeronave</h3>
      <ul>
        <li>
          <strong>Marca y modelo.</strong> El procedimiento pide &ldquo;texto claro&rdquo;; en la
          práctica se anota el tipo (C152, C172).
        </li>
        <li><strong>Matrícula</strong> de la aeronave.</li>
        <li><strong>Potencia</strong>: la total, si es multimotor.</li>
        <li>
          <strong>Clase</strong>: MONT-T (monomotor terrestre), MULT-T (multimotor terrestre), MONT-A
          (monomotor acuático) o MULT-A (multimotor acuático).
        </li>
      </ul>

      <h3>Tiempos de vuelo</h3>
      <p>
        Se reparten en <strong>sobre aeródromo</strong> o <strong>travesía</strong>, <strong>de día</strong>{" "}
        o <strong>de noche</strong>, y como <strong>piloto</strong> o <strong>copiloto</strong>. Van en
        horas y décimas: para pasar los minutos está{" "}
        <Link href="/guias/horas-centesimales">el cuadro de horas centesimales</Link>.
      </p>

      <h3>Aterrizajes</h3>
      <p>En números: los que hiciste en ese vuelo.</p>

      <h3>Discriminación de tiempos de vuelo</h3>
      <p>
        Instructor de vuelo, multimotor, reactor, turbohélice, aeroaplicador y vuelo por instrumentos
        (real, como piloto o copiloto, y bajo capota). <strong>No se suman a los totales del
        libro</strong>: son una discriminación de lo que ya está en &ldquo;Tiempos de vuelo&rdquo;.
      </p>

      <h3>Adiestrador terrestre o simulador</h3>
      <p>
        Se asienta por separado, en su columna: la actividad del instructor y la del piloto en
        instrucción.
      </p>

      <h3>Totales</h3>
      <p>
        Arriba de cada hoja, los totales de la página anterior; abajo, los que pasan a la siguiente. El
        total de horas de vuelo es la suma de las columnas de &ldquo;Tiempos de vuelo&rdquo;.
      </p>

      <h3>Certificaciones</h3>
      <p>
        Cada vuelo lleva la firma de quien lo certifica. Las horas de instrucción las certifica el
        instructor que dio esa instrucción (RAAC 61.120(c)(5)). En el CAD, además, en cada vuelo se
        declara el nombre de quien lo certificó (Anexo I, punto 8).
      </p>

      <h2 id="errores">Si te equivocaste</h2>
      <p>
        La Res. 147/2013 —hoy derogada— fijaba cómo corregir el libro en papel: tachar el renglón con
        un solo trazo que deje leer lo escrito, poner &ldquo;errose&rdquo; con tu firma al final de la
        línea y asentar los valores correctos en el primer renglón libre. El procedimiento vigente pide
        que un error se corrija <strong>antes</strong> de declarar la actividad en el CAD.
      </p>

      <h2 id="cerrar-hoja">Cerrar una hoja antes de llenarla</h2>
      <p>
        Pasa, por ejemplo, cuando hay que certificar o presentar el libro con la hoja a medio usar. Lo
        habitual es tachar todo lo que quedó en blanco con <strong>una sola línea diagonal</strong> y
        pasar los totales a la hoja siguiente, como en cualquier otra.
      </p>

      <Nota titulo="Cómo lo hace Vector">
        Vector arma tu libro en PDF con esta misma hoja: el encabezado con tu licencia y tu legajo, los
        totales que pasan de hoja en hoja, los renglones que tenga tu libro de papel y las hojas que
        cerrás antes de tiempo tachadas con la diagonal. La columna de certificaciones queda libre para
        la firma.
      </Nota>
    </GuiaShell>
  );
}

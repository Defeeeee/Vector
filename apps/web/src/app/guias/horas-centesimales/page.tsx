import CalculadoraCentesimal from "@/components/publico/CalculadoraCentesimal";
import GuiaShell, { Nota } from "@/components/publico/GuiaShell";
import { CUADRO_CENTESIMAL } from "@/lib/centesimales";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("horas-centesimales");

export default function GuiaHorasCentesimales() {
  return (
    <GuiaShell
      guia={guia("horas-centesimales")}
      fuentes={[FUENTES.res147, FUENTES.procedimiento, FUENTES.guiaCad]}
    >
      <p>
        En el libro de vuelo los tiempos no se anotan en horas y minutos sino en <strong>horas y
        décimas</strong>: un vuelo de 1 hora y 10 minutos se escribe <strong>1,2</strong>. Para pasar
        los minutos a décimas se usa un cuadro fijo, el que viene impreso al pie de la hoja del libro de
        vuelo de pilotos.
      </p>

      <h2 id="cuadro">El cuadro de horas centesimales</h2>
      <p>Se aplica a los minutos que sobran después de las horas enteras:</p>
      <table>
        <thead>
          <tr>
            <th>Minutos</th>
            <th>Se anota</th>
          </tr>
        </thead>
        <tbody>
          {CUADRO_CENTESIMAL.map((f) => (
            <tr key={f.desde}>
              <td className="data">
                {f.desde} a {f.hasta}
              </td>
              <td className="data">{f.decimas === 10 ? "Una hora" : `0,${f.decimas}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Ojo con dos tramos: el de 27 a 33 minutos es de siete minutos, y de 58 a 60 ya se cuenta una
        hora entera.
      </p>

      <h2 id="calculadora">Calculadora</h2>
      <p>Poné la hora de salida y la de llegada, y te da el tiempo como va en el libro:</p>
      <CalculadoraCentesimal />

      <h2 id="ejemplos">Ejemplos</h2>
      <ul>
        <li><strong>45 minutos</strong> se anotan <strong>0,7</strong> (45 cae entre 40 y 45).</li>
        <li><strong>1 h 10 min</strong> se anota <strong>1,2</strong> (10 cae entre 9 y 14).</li>
        <li><strong>1 h 22 min</strong> se anota <strong>1,4</strong> (22 cae entre 21 y 26).</li>
        <li><strong>1 h 58 min</strong> se anota <strong>2,0</strong>: de 58 a 60 minutos es una hora.</li>
        <li><strong>2 minutos</strong> no suman nada: se anotan 0,0.</li>
      </ul>

      <h2 id="que-tiempo">Qué tiempo se mide</h2>
      <p>
        El tiempo de vuelo es el período total desde que el avión comienza a moverse por sus propios
        medios con el propósito de despegar, hasta que se detiene completamente al terminar el vuelo:
        el tiempo <strong>&ldquo;entre calzas&rdquo;</strong>. Así lo define el procedimiento vigente de
        ANAC para el registro de la actividad de vuelo (Res. 470/2025, Anexo I, punto 5).
      </p>

      <h2 id="cad">¿Y en el CAD?</h2>
      <p>
        El procedimiento del registro electrónico dice que los tiempos van &ldquo;en horas
        sexagesimal&rdquo;, pero el Libro de Vuelo Electrónico que emite el Casillero Aeronáutico
        Digital, en la guía paso a paso de ANAC, muestra los tiempos con décimas (1.2, 2.7). Cargá los
        vuelos como te lo pida el formulario del CAD y, ante la duda, consultalo en tu escuela.
      </p>

      <Nota titulo="Vector lo hace solo">
        Al cargar la hora de salida y la de llegada, Vector calcula el tiempo con este mismo cuadro y lo
        reparte entre local o travesía y día o noche, como va en la hoja.
      </Nota>
    </GuiaShell>
  );
}

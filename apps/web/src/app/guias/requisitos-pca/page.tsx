import Link from "next/link";
import GuiaShell, { Nota } from "@/components/publico/GuiaShell";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("requisitos-pca");

export default function GuiaRequisitosPca() {
  return (
    <GuiaShell guia={guia("requisitos-pca")} fuentes={[FUENTES.raac61]}>
      <p>
        Para la licencia de piloto comercial de avión, la <strong>RAAC 61.620</strong> fija una
        experiencia mínima en horas de vuelo. Estos son los números de la VI edición de la RAAC 61
        (enero de 2026), la vigente.
      </p>

      <h2 id="minimos">Los mínimos de experiencia</h2>
      <table>
        <thead>
          <tr>
            <th>Requisito</th>
            <th>Mínimo</th>
            <th>Con curso aprobado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Horas de vuelo como piloto en avión</td>
            <td className="data">200 h</td>
            <td className="data">150 h</td>
          </tr>
          <tr>
            <td>Como piloto al mando</td>
            <td className="data">100 h</td>
            <td className="data">70 h</td>
          </tr>
          <tr>
            <td>Travesía como piloto al mando</td>
            <td className="data">20 h</td>
            <td className="data">20 h</td>
          </tr>
          <tr>
            <td>Instrucción de vuelo por instrumentos</td>
            <td className="data">10 h</td>
            <td className="data">10 h</td>
          </tr>
          <tr>
            <td>Vuelo nocturno como piloto al mando, para ejercer de noche</td>
            <td className="data">5 h</td>
            <td className="data">5 h</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          El <strong>curso aprobado</strong> es un curso de instrucción aprobado o reconocido por ANAC:
          si las horas se hicieron ahí, el total baja a 150 y las de piloto al mando, a 70.
        </li>
        <li>
          Las 20 horas de travesía tienen que incluir <strong>una travesía de al menos 540 km (300
          millas náuticas)</strong> con aterrizajes completos en dos aeródromos diferentes.
        </li>
        <li>
          De las 10 horas de instrucción por instrumentos, <strong>hasta 5</strong> pueden ser en un
          dispositivo de instrucción para simulación de vuelo.
        </li>
        <li>
          Las 5 horas nocturnas tienen que incluir <strong>5 despegues y 5 aterrizajes</strong> como
          piloto al mando.
        </li>
      </ul>

      <h2 id="creditos">Créditos</h2>
      <ul>
        <li>
          <strong>Simulador.</strong> ANAC determina si la instrucción en un dispositivo de simulación
          de vuelo es aceptable como parte del tiempo total; ese crédito tiene un tope de 20 horas.
        </li>
        <li>
          <strong>Otras categorías de aeronave</strong>, sólo para completar el total general: 20
          horas si tenés al menos 300 horas como piloto al mando de helicóptero, o 10 si tenés al menos
          200 como piloto al mando de planeadores. Sumados, nunca más de 25 horas.
        </li>
      </ul>

      <h2 id="al-mando">Qué cuenta como piloto al mando</h2>
      <p>
        Un piloto privado o comercial puede anotar como tiempo de piloto al mando sólo el tiempo en que
        es el <strong>único que manipula los controles</strong> de una aeronave para la que está
        habilitado, o en que es el único ocupante (RAAC 61.120(c)(2)). El tiempo de <strong>vuelo
        solo</strong> es exclusivamente el que volás siendo el único a bordo.
      </p>

      <h2 id="alumno">Las horas de alumno piloto, ¿cuentan?</h2>
      <p>
        Sí. La RAAC 61.120(e) vigente dice que al alumno piloto o al titular de una licencia se le
        acredita <strong>por completo</strong>, para una licencia de grado superior, todo el tiempo que
        haya volado solo, en instrucción con doble comando y como piloto al mando. Ojo si leés material
        viejo: la edición de 2021 (entonces sección 61.51) decía lo contrario para la experiencia como
        alumno piloto privado.
      </p>

      <Nota titulo="Cómo lo lleva Vector">
        Cada vuelo suma en su casillero —total, al mando, travesía, instrumentos y nocturno—, con las
        horas que trajiste de tu libro de papel. El simulador no se suma al total, porque ese crédito lo
        decide ANAC; sí cuenta, hasta 5 horas, en la instrucción por instrumentos. Mirá también{" "}
        <Link href="/guias/experiencia-reciente">qué necesitás para volar hoy</Link>.
      </Nota>
    </GuiaShell>
  );
}

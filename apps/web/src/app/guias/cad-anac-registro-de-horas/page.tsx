import Link from "next/link";
import GuiaShell, { Nota } from "@/components/publico/GuiaShell";
import { FUENTES, guia, metadataDeGuia } from "@/lib/sitio";

export const metadata = metadataDeGuia("cad-anac-registro-de-horas");

export default function GuiaCad() {
  return (
    <GuiaShell
      guia={guia("cad-anac-registro-de-horas")}
      fuentes={[FUENTES.res470, FUENTES.procedimiento, FUENTES.guiaCad, FUENTES.paginaCad]}
    >
      <p>
        La actividad de vuelo ya no se folia en papel: se declara en el <strong>Casillero Aeronáutico
        Digital (CAD)</strong> de ANAC, que emite un Libro de Vuelo Electrónico y un Resumen de Actividad
        de Vuelo con código QR. Esto es lo que cambió y cómo se hace.
      </p>

      <h2 id="que-cambio">Qué cambió y desde cuándo</h2>
      <ul>
        <li>
          La <strong>Resolución ANAC 470/2025</strong> (Boletín Oficial del 15 de julio de 2025) aprobó
          el procedimiento de registro de la actividad de vuelo de pilotos y tripulantes de cabina, y
          derogó la Res. 147/2013, que siguió rigiendo hasta el 1 de enero de 2026 sólo para su Anexo II
          y para el anotado, la certificación y el foliado del libro en papel.
        </li>
        <li>
          Es obligatorio desde el <strong>1 de septiembre de 2025</strong> para quienes operan bajo las
          RAAC 121 y 135, y desde el <strong>1 de noviembre de 2025</strong> para la RAAC 91:
          explotadores privados, empresas de trabajo aéreo y centros de instrucción.
        </li>
        <li>
          El foliado en papel rigió hasta el <strong>31 de diciembre de 2025</strong>. Desde el 2 de
          enero de 2026, sólo existe el registro electrónico a través del CAD.
        </li>
        <li>
          El Libro de Vuelo Electrónico y el Resumen de Actividad de Vuelo que emite el CAD tienen
          validez para presentarlos ante la autoridad que los pida (procedimiento, punto 4).
        </li>
      </ul>

      <h2 id="antes">Antes de empezar</h2>
      <ul>
        <li>
          <strong>Tu usuario del CAD.</strong> Si no tenés, el mismo sitio tiene el autorregistro
          (&ldquo;¿No tenés usuario? Registrate&rdquo;).
        </li>
        <li>
          <strong>Los datos de tu último foliado en papel:</strong> la última hoja foliada, las horas
          discriminadas y el objeto de ese foliado. Si nunca foliaste, el procedimiento indica pedir un
          turno para hacer el primero en forma presencial; confirmá con ANAC cómo se hace hoy.
        </li>
        <li>
          <strong>La documentación que respalda los vuelos</strong>, escaneada:
          <ul>
            <li>si volás en un centro de instrucción (CIAC o CEAC) o en una empresa de trabajo aéreo, los <strong>Registros de Actividad de Vuelo (RAV)</strong> firmados por el centro o la empresa;</li>
            <li>si volás un avión particular, el historial de la aeronave;</li>
            <li>en líneas aéreas (RAAC 121 y 135), la certificación de los vuelos que emite la empresa.</li>
          </ul>
        </li>
        <li>
          <strong>Tu libro en papel escaneado</strong> de los dos lados, con los vuelos que vas a
          declarar: por ahora se pide &ldquo;como medida complementaria y transitoria&rdquo;.
        </li>
      </ul>

      <h2 id="paso-a-paso">Paso a paso</h2>
      <ol>
        <li>Entrá al CAD desde el sitio de ANAC, con tu usuario y contraseña.</li>
        <li>Elegí el módulo <strong>Registro de Horas de Vuelo</strong> y la función de piloto.</li>
        <li>
          <strong>Paso 1 — Último foliado manual.</strong> Cargá los datos de tu última hoja foliada y
          el objeto de ese foliado (rutina, o examen o habilitación). Una vez guardados, se bloquean y
          no se pueden cambiar.
        </li>
        <li>
          <strong>Paso 2 — Libro de vuelo.</strong> Con &ldquo;Registrar vuelo&rdquo; completás cada
          vuelo: el tipo (local, travesía o simulador), si volaste como piloto o copiloto, el itinerario
          (día, mes, hora de salida, desde, hasta, hora de llegada y finalidad), los tiempos de día y de
          noche, la aeronave —con la matrícula, el sistema reconoce la marca y el modelo—, los
          aterrizajes, quién certificó el vuelo con su nombre y apellido y, si corresponde, la
          discriminación de tiempos. Podés cargar varios vuelos, editarlos o borrarlos antes de declarar.
        </li>
        <li>
          <strong>Paso 3 — DDJJ de Horas de Vuelo.</strong> Revisás el resumen de lo que vas a declarar,
          tocás &ldquo;Generar DDJJ&rdquo;, indicás el objeto y subís la documentación obligatoria.
        </li>
        <li>
          Descargás el <strong>Resumen de Actividad de Vuelo</strong> —con un código QR que certifica su
          autenticidad— y el <strong>Libro de Vuelo Electrónico</strong>, en PDF.
        </li>
      </ol>

      <h2 id="saber">Lo que conviene saber</h2>
      <ul>
        <li>Lo que declarás en el CAD tiene carácter de declaración jurada.</li>
        <li>
          Una vez declarados, no se pueden cargar vuelos con fecha anterior al último registro
          validado. Para que te reconozcan horas omitidas hay que iniciar un expediente por Trámites a
          Distancia (TAD), con la documentación que las respalde.
        </li>
        <li>
          Para rendir un examen práctico se presentan el Resumen de Actividad de Vuelo y el Libro de
          Vuelo Electrónico actualizados, descargados en PDF. Para ese examen, el registro vale noventa
          días.
        </li>
        <li>
          El libro en papel no desaparece: convive con el registro electrónico y tiene que decir lo
          mismo. Te lo contamos en <Link href="/guias/libro-de-vuelo">cómo completar el libro de vuelo</Link>.
        </li>
      </ul>

      <Nota titulo="Vector y el CAD">
        Vector no se conecta con el CAD ni declara nada por vos. Lo que hace es tener cada vuelo con los
        mismos datos que te pide el formulario —tipo, cargo, itinerario, tiempos, aeronave, aterrizajes y
        discriminación—, para que cargarlos sea copiar, y armarte el libro en PDF que imprimís, te firman
        y escaneás.
      </Nota>
    </GuiaShell>
  );
}

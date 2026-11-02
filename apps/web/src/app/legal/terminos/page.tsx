import type { Metadata } from "next";
import LegalShell from "../LegalShell";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Vector",
  description: "Condiciones de uso de Vector, con los límites que corresponden a una herramienta aeronáutica.",
};

/**
 * BORRADOR TÉCNICO — REQUIERE REVISIÓN HUMANA ANTES DE PUBLICAR.
 *
 * Las secciones aeronáuticas ("Vector no reemplaza tu libro oficial", "la
 * meteorología es informativa") son las que más importan y salen de entender qué
 * hace el producto. Lo que un agente NO debe decidir: razón social, jurisdicción,
 * plazos y límites de responsabilidad.
 *
 * Ver T3.10 en docs/brief/06-plan-post-flightdeck.md.
 */
export default function TerminosPage() {
  return (
    <LegalShell title="Términos y Condiciones" updated="4 de agosto de 2026">
      <section>
        <h2>Qué es Vector</h2>
        <p>
          Vector es una herramienta para llevar tu bitácora de vuelo en formato digital,
          seguir tus horas por categoría, controlar vencimientos de documentación y
          consultar información meteorológica. Al crear una cuenta aceptás estos términos.
        </p>
      </section>

      <section>
        <h2>Vector no reemplaza tu libro de vuelo oficial</h2>
        <p>
          Esto es lo más importante de esta página. Vector es una herramienta de apoyo:{" "}
          <strong>
            la responsabilidad de mantener tu libro de vuelo conforme a la reglamentación
            vigente es tuya
          </strong>
          . Ante cualquier trámite, inspección o presentación ante la autoridad
          aeronáutica, lo que vale es tu documentación oficial, no lo que muestre esta
          aplicación.
        </p>
        <p>
          El desglose de horas, los cálculos de tiempo ANAC y el seguimiento de requisitos
          de licencia son <strong>orientativos</strong>. Verificá los números antes de
          usarlos para cualquier gestión.
        </p>
      </section>

      <section>
        <h2>La información meteorológica es informativa</h2>
        <p>
          Los METAR, TAF y NOTAM que muestra Vector provienen de fuentes de terceros y se
          presentan tal como se reciben, sin garantía de disponibilidad, vigencia ni
          exactitud.{" "}
          <strong>
            No los uses como única fuente para tomar una decisión operativa de vuelo.
          </strong>{" "}
          Consultá siempre los canales oficiales de información aeronáutica.
        </p>
        <p>
          Lo mismo aplica a las calculadoras: usan las aproximaciones estándar del E6B y
          están pensadas para estimar y para estudiar, no para reemplazar el manual de
          vuelo de tu aeronave.
        </p>
      </section>

      <section>
        <h2>El copiloto con IA</h2>
        <p>
          El copiloto genera respuestas automáticamente y{" "}
          <strong>puede equivocarse</strong>. No tomes decisiones operativas ni
          regulatorias basándote sólo en lo que responde. Cuando cargue o modifique vuelos
          por tu pedido, revisá el resultado.
        </p>
      </section>

      <section>
        <h2>Tu cuenta</h2>
        <ul>
          <li>Sos responsable de la veracidad de los datos que cargues.</li>
          <li>Sos responsable de mantener tus credenciales seguras.</li>
          <li>
            No podés usar Vector para cargar datos de terceros sin su consentimiento, ni
            para actividades ilícitas.
          </li>
        </ul>
      </section>

      <section>
        <h2>Disponibilidad</h2>
        <p>
          Hacemos lo posible por que el servicio esté disponible, pero no garantizamos
          continuidad ininterrumpida. Puede haber interrupciones por mantenimiento o por
          fallas de proveedores. <strong>Mantené tu propio respaldo</strong> de la
          información que te resulte crítica.
        </p>
      </section>

      <section>
        <h2>Cambios</h2>
        <p>
          Podemos actualizar estos términos. Si el cambio es sustancial, te avisaremos. La
          fecha de la última actualización figura al principio de esta página.
        </p>
      </section>

      <section>
        <h2>Contacto</h2>
        <p>
          Por consultas sobre estos términos, escribinos a{" "}
          <a href="mailto:fdiaznemeth@gmail.com">fdiaznemeth@gmail.com</a>.
        </p>
      </section>
    </LegalShell>
  );
}

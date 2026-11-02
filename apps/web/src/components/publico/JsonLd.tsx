/**
 * Datos estructurados (schema.org) para los buscadores. `<` se escapa para que un texto
 * nunca pueda cerrar el `<script>`.
 */
export default function JsonLd({ datos }: { datos: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(datos).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

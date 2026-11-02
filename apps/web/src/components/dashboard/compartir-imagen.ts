/**
 * Compartir una imagen generada por Vector (la tarjeta de horas, el recorrido de un vuelo): la
 * hoja de compartir del teléfono si acepta archivos, o la descarga.
 *
 * `canShare({files})` y no `share` a secas: Chrome de escritorio expone `share` pero rechaza
 * archivos, así que preguntar por `share` solo haría fallar la operación **después** de que el
 * piloto tocó el botón. Y cancelar la hoja no termina en una descarga sorpresa.
 */
export async function compartirImagen(blob: Blob, nombre: string): Promise<void> {
  const file = new File([blob], nombre, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") descargar(blob, nombre);
    }
  } else {
    descargar(blob, nombre);
  }
}

function descargar(blob: Blob, nombre: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sin esto el blob queda vivo hasta que se recarga la pestaña.
  URL.revokeObjectURL(href);
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plane, X } from "lucide-react";
import AvatarPiloto from "./AvatarPiloto";
import ChipVuelo from "./ChipVuelo";
import { useAvisos } from "@/components/dashboard/Avisos";
import { ImagenIlegible, comprimirImagen } from "@/lib/imagen-cliente";
import { recorridoDelVuelo } from "@/actions/recorrido";
import { formaDelRecorrido } from "@/lib/recorrido";
import type { RecorridoPublicado, VueloChip, VueloParaCompartir } from "@/types";

/** Los mismos topes que el backend (`TEXTO_MAX`, `FOTOS_MAX`). */
const TEXTO_MAX = 1000;
const FOTOS_MAX = 4;

type Dato = "ruta" | "duracion" | "aeronave" | "fecha" | "recorrido";

/**
 * Por decisión de Federico: ruta y duración prendidas; avión y fecha, apagadas. El recorrido
 * (2.37.0) también arranca apagado: dice por dónde voló el piloto, punto por punto.
 */
const MOSTRAR_POR_DEFECTO: Record<Dato, boolean> = { ruta: true, duracion: true, aeronave: false, fecha: false, recorrido: false };

const DATOS: { clave: Dato; etiqueta: string }[] = [
  { clave: "ruta", etiqueta: "Ruta" },
  { clave: "duracion", etiqueta: "Duración" },
  { clave: "aeronave", etiqueta: "Avión" },
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "recorrido", etiqueta: "Recorrido" },
];

interface FotoElegida {
  archivo: File;
  /** `blob:` para la miniatura; se revoca al sacarla o al publicar. */
  vista: string;
}

/**
 * Escribir una publicación: texto, hasta cuatro fotos y, si el piloto quiere, un vuelo
 * de su bitácora con los datos que elija.
 *
 * - **Las fotos se achican acá** antes de subir (`comprimirImagen`): de 3–8 MB a unos
 *   cientos de KB, y sin la ubicación GPS del EXIF.
 * - **El vuelo se ve como va a salir**: la vista previa es el mismo `ChipVuelo` que
 *   dibuja la publicación, armado con lo que está prendido. Los datos del vuelo ya
 *   vienen escritos del server con las mismas reglas que usa el backend (`rutaLegible`).
 * - Se manda a `/api/social/publicaciones`, con las fotos en `foto_0`…`foto_3`.
 */
export default function ComposerPublicacion({
  autor,
  vuelos,
  vueloInicialId = null,
  textoInicial = "",
  compacto = false,
  alPublicar = "ir-a-la-red",
}: {
  autor: { handle: string; nombre: string; avatarUrl?: string | null };
  /** Los vuelos propios que se pueden adjuntar, del más nuevo al más viejo. */
  vuelos: VueloParaCompartir[];
  vueloInicialId?: string | null;
  /** El texto con el que arranca: el de un hito, desde la Bitácora. */
  textoInicial?: string;
  /** Arranca cerrado, como una línea para tocar: en la Red, arriba del feed. */
  compacto?: boolean;
  /** Después de publicar: ir a la Red, o volver a dibujar la pantalla en la que está. */
  alPublicar?: "ir-a-la-red" | "refrescar";
}) {
  const router = useRouter();
  const { notificar } = useAvisos();
  const vueloInicial = vuelos.find((v) => v.id === vueloInicialId) ?? null;

  const [abierto, setAbierto] = useState(!compacto || !!vueloInicial);
  const [texto, setTexto] = useState(textoInicial);
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const [procesando, setProcesando] = useState(0);
  const [vueloId, setVueloId] = useState<string | null>(vueloInicial?.id ?? null);
  const [eligiendoVuelo, setEligiendoVuelo] = useState(false);
  const [mostrar, setMostrar] = useState(MOSTRAR_POR_DEFECTO);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textoRef = useRef<HTMLTextAreaElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  /** Todas las URLs `blob:` creadas, para revocarlas si el composer se desmonta. */
  const vistas = useRef(new Set<string>());

  useEffect(() => {
    const creadas = vistas.current;
    return () => {
      for (const url of creadas) URL.revokeObjectURL(url);
      creadas.clear();
    };
  }, []);

  const vuelo = vuelos.find((v) => v.id === vueloId) ?? null;

  // El recorrido ADS-B del vuelo elegido, si tiene: se pregunta al elegirlo, desde el
  // navegador. `undefined` mientras no se sabe.
  const [recorridos, setRecorridos] = useState<Record<string, RecorridoPublicado | null>>({});
  const recorrido = vuelo ? recorridos[vuelo.id] : undefined;
  useEffect(() => {
    if (!vuelo?.puede_tener_recorrido || vuelo.id in recorridos) return;
    let vigente = true;
    const id = vuelo.id;
    recorridoDelVuelo(id)
      .then((d) => vigente && setRecorridos((r) => ({ ...r, [id]: formaDelRecorrido(d?.recorrido) })))
      .catch(() => vigente && setRecorridos((r) => ({ ...r, [id]: null })));
    return () => {
      vigente = false;
    };
  }, [vuelo, recorridos]);

  const tiene: Record<Dato, boolean> = {
    ruta: !!vuelo?.ruta,
    duracion: vuelo?.duracion != null && vuelo.duracion > 0,
    aeronave: !!vuelo?.aeronave,
    fecha: !!vuelo?.fecha,
    recorrido: !!recorrido,
  };
  const datosPrendidos = DATOS.filter((d) => mostrar[d.clave] && tiene[d.clave]).length;

  const vistaPrevia: VueloChip | null = vuelo
    ? {
        ruta: mostrar.ruta ? vuelo.ruta : null,
        duracion: mostrar.duracion ? vuelo.duracion : null,
        aeronave: mostrar.aeronave ? vuelo.aeronave : null,
        fecha_texto: mostrar.fecha ? vuelo.fecha : null,
        puntos_mapa: mostrar.ruta ? vuelo.puntos_mapa : undefined,
        recorrido: mostrar.recorrido && recorrido ? recorrido : null,
      }
    : null;

  const hayAlgo = texto.trim().length > 0 || fotos.length > 0 || (vuelo !== null && datosPrendidos > 0);
  const vueloSinDatos = vuelo !== null && datosPrendidos === 0;
  const puedePublicar = hayAlgo && !vueloSinDatos && procesando === 0 && !publicando;

  const abrir = () => {
    setAbierto(true);
    requestAnimationFrame(() => textoRef.current?.focus());
  };

  const agregarFotos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setError(null);
    const lugar = FOTOS_MAX - fotos.length - procesando;
    const elegidas = Array.from(lista);
    if (elegidas.length > lugar) setError(`Podés subir hasta ${FOTOS_MAX} fotos por publicación.`);
    // De a una: decodificar cuatro fotos de 12 megapíxeles a la vez puede dejar sin
    // memoria a un teléfono modesto.
    for (const archivo of elegidas.slice(0, Math.max(lugar, 0))) {
      setProcesando((n) => n + 1);
      try {
        const comprimida = await comprimirImagen(archivo);
        const vista = URL.createObjectURL(comprimida);
        vistas.current.add(vista);
        setFotos((actuales) => [...actuales, { archivo: comprimida, vista }]);
      } catch (e) {
        setError(e instanceof ImagenIlegible ? e.message : "No se pudo procesar una de las fotos.");
      } finally {
        setProcesando((n) => n - 1);
      }
    }
  };

  const sacarFoto = (i: number) => {
    const foto = fotos[i];
    if (foto) {
      URL.revokeObjectURL(foto.vista);
      vistas.current.delete(foto.vista);
    }
    setFotos((actuales) => actuales.filter((_, j) => j !== i));
  };

  const limpiar = () => {
    for (const f of fotos) {
      URL.revokeObjectURL(f.vista);
      vistas.current.delete(f.vista);
    }
    setTexto("");
    setFotos([]);
    setVueloId(null);
    setMostrar(MOSTRAR_POR_DEFECTO);
    setEligiendoVuelo(false);
    if (compacto) setAbierto(false);
  };

  const publicar = async () => {
    if (!puedePublicar) return;
    setPublicando(true);
    setError(null);

    const formulario = new FormData();
    if (texto.trim()) formulario.append("texto", texto.trim());
    if (vuelo) {
      formulario.append("vuelo_id", vuelo.id);
      for (const d of DATOS) if (mostrar[d.clave] && tiene[d.clave]) formulario.append(`mostrar_${d.clave}`, "1");
    }
    // Un campo por foto, no uno repetido: es lo que lee el backend.
    fotos.forEach((f, i) => formulario.append(`foto_${i}`, f.archivo, f.archivo.name));

    let res: Response;
    try {
      res = await fetch("/api/social/publicaciones", { method: "POST", body: formulario });
    } catch {
      setError("No hay conexión. Probá de nuevo cuando tengas señal.");
      setPublicando(false);
      return;
    }
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        cuerpo?.error ??
          (res.status === 413
            ? "Las fotos pesan demasiado. Probá con menos fotos."
            : "No se pudo publicar. Probá de nuevo en un momento."),
      );
      setPublicando(false);
      return;
    }

    limpiar();
    notificar({ tipo: "exito", titulo: "Publicado", detalle: "Lo ven los pilotos que pueden ver tu perfil." });
    if (alPublicar === "ir-a-la-red") router.push("/dashboard/pilotos");
    else router.refresh();
    setPublicando(false);
  };

  /*
    Un solo input de archivos, en el mismo lugar del árbol en los dos modos. Si viviera
    adentro del modo cerrado, tocar "foto" abriría el composer, React desmontaría ese
    input con el diálogo de archivos todavía abierto, y la foto elegida se perdería.
  */
  const inputArchivos = (
    <input
      ref={archivoRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => {
        void agregarFotos(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (!abierto) {
    return (
      <>
        {inputArchivos}
        <div className="flex items-center gap-3 rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon shadow-cal dark:shadow-none p-3 pr-4">
          <AvatarPiloto nombre={autor.nombre} avatarUrl={autor.avatarUrl} />
          <button
            type="button"
            onClick={abrir}
            className="flex-1 text-left rounded-2xl bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            Contá algo de tu último vuelo…
          </button>
          <button
            type="button"
            onClick={() => {
              abrir();
              archivoRef.current?.click();
            }}
            aria-label="Publicar una foto"
            title="Publicar una foto"
            className="p-2.5 rounded-full text-aviation-blue dark:text-aviation-cyan hover:bg-aviation-blue/10 transition-colors"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
        </div>
      </>
    );
  }

  const herramienta =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40";

  return (
    <>
      {inputArchivos}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void publicar();
        }}
        className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon shadow-cal dark:shadow-none p-4 md:p-6"
      >
        <div className="flex items-start gap-3">
          <AvatarPiloto nombre={autor.nombre} avatarUrl={autor.avatarUrl} />
          <label className="flex-1 min-w-0">
            <span className="sr-only">Qué querés contar</span>
            <textarea
              ref={textoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
              maxLength={TEXTO_MAX}
              rows={3}
              placeholder="¿Qué volaste? Un solo, un aterrizaje con viento cruzado, la vista desde arriba…"
              className="block w-full resize-none bg-transparent border-0 outline-none p-0 pt-2.5 text-[15px] leading-relaxed text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 [field-sizing:content] min-h-[4.5rem] max-h-80"
            />
          </label>
        </div>

        {(fotos.length > 0 || procesando > 0) && (
          <ul className="mt-3 grid grid-cols-4 gap-2" aria-label="Fotos elegidas">
            {fotos.map((f, i) => (
              <li
                key={f.vista}
                className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-white/5"
              >
                <img src={f.vista} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => sacarFoto(i)}
                  aria-label={`Sacar la foto ${i + 1}`}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {Array.from({ length: procesando }).map((_, i) => (
              <li
                key={`procesando-${i}`}
                className="aspect-square rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center"
              >
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-label="Preparando la foto" />
              </li>
            ))}
          </ul>
        )}

        {vuelo && vistaPrevia && (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Vuelo del {vuelo.fecha ?? "—"}</p>
              <button
                type="button"
                onClick={() => setVueloId(null)}
                className="text-[12px] font-semibold text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Quitar vuelo
              </button>
            </div>
            <fieldset>
              <legend className="sr-only">Qué datos del vuelo mostrar</legend>
              <div className="flex flex-wrap gap-1.5">
                {DATOS.filter((d) => d.clave !== "recorrido" || tiene.recorrido).map((d) => {
                  const prendido = mostrar[d.clave] && tiene[d.clave];
                  return (
                    <label
                      key={d.clave}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        !tiene[d.clave]
                          ? "border-zinc-100 dark:border-white/5 text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                          : prendido
                            ? "border-aviation-blue bg-aviation-blue/10 text-aviation-blue dark:border-aviation-cyan dark:bg-aviation-cyan/10 dark:text-aviation-cyan cursor-pointer"
                            : "border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={prendido}
                        disabled={!tiene[d.clave]}
                        onChange={(e) => setMostrar((m) => ({ ...m, [d.clave]: e.target.checked }))}
                      />
                      {d.etiqueta}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {datosPrendidos > 0 ? (
              <ChipVuelo vuelo={vistaPrevia} />
            ) : (
              <p className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 px-4 py-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                Prendé al menos un dato para mostrar el vuelo.
              </p>
            )}
            <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
              Se publica sólo lo que está prendido. La matrícula, nunca.
              {mostrar.recorrido && tiene.recorrido && " El recorrido muestra por dónde volaste, de ADS-B, sin los horarios."}
            </p>
          </div>
        )}

        {!vuelo && eligiendoVuelo && (
          <div className="mt-4">
            {vuelos.length > 0 ? (
              <label className="block space-y-1.5">
                <span className="text-[13px] font-semibold text-zinc-900 dark:text-white">¿Qué vuelo?</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setVueloId(e.target.value);
                      setEligiendoVuelo(false);
                    }
                  }}
                  className="block w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3.5 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:border-zinc-400 dark:focus:border-white/30"
                >
                  <option value="" disabled>
                    Elegí uno de tus últimos vuelos
                  </option>
                  {vuelos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Todavía no tenés vuelos registrados para compartir.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={fotos.length + procesando >= FOTOS_MAX || publicando}
            className={`${herramienta} -ml-2 text-aviation-blue dark:text-aviation-cyan hover:bg-aviation-blue/10`}
          >
            <ImagePlus className="w-[18px] h-[18px]" aria-hidden="true" />
            Fotos
          </button>
          {!vuelo && (
            <button
              type="button"
              onClick={() => setEligiendoVuelo((v) => !v)}
              aria-expanded={eligiendoVuelo}
              disabled={publicando}
              className={`${herramienta} text-aviation-blue dark:text-aviation-cyan hover:bg-aviation-blue/10`}
            >
              <Plane className="w-[18px] h-[18px]" aria-hidden="true" />
              Vuelo
            </button>
          )}
          <span className="flex-1" />
          {texto.length > TEXTO_MAX - 100 && (
            <span
              className={`mr-2 font-mono text-[11px] ${texto.length >= TEXTO_MAX ? "text-red-500" : "text-orange-500"}`}
            >
              {texto.length}/{TEXTO_MAX}
            </span>
          )}
          {compacto && (
            <button
              type="button"
              onClick={limpiar}
              disabled={publicando}
              className={`${herramienta} text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5`}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!puedePublicar}
            className="inline-flex items-center gap-2 rounded-full bg-aviation-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-aviation-blue-dark transition-colors disabled:opacity-40"
          >
            {publicando && <Loader2 className="w-4 h-4 animate-spin" />}
            Publicar
          </button>
        </div>
      </form>
    </>
  );
}

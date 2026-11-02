import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECCIONES, esPestanaActiva, hrefDeSeccion, pestanaActiva, seccionDe } from "./secciones";

/**
 * El riesgo de agrupar pantallas en secciones no es que una pestaña quede mal
 * nombrada: es que **una pantalla quede sin forma de llegar a ella.** Antes cada
 * pantalla tenía su ícono; ahora las que no lo tienen dependen de estar anotadas acá.
 * El test que recorre `src/app/dashboard` es el que impide que una pantalla nueva
 * quede huérfana en silencio.
 */

const RAIZ = process.cwd();
const DASHBOARD = path.join(RAIZ, "src", "app", "dashboard");

/**
 * Las pantallas que a propósito no están en la barra, y cómo se llega a cada una.
 * Si agregás una pantalla y no va en ninguna sección, va acá con su motivo.
 */
const FUERA_DE_LA_BARRA: Record<string, string> = {
  "/dashboard/settings": "el Hangar se abre desde el avatar",
  "/dashboard/novedades": "se abre desde la tarjeta de novedades del inicio",
  "/dashboard/log-flight": "es una acción: el botón + del rail y de la píldora del teléfono",
  "/dashboard/log-flight/import": "se abre desde Registrar vuelo",
  "/dashboard/admin": "el panel de administración: sin link a propósito, se llega por URL y es 404 para quien no es admin",
  "/dashboard/admin/pegatinas": "las pegatinas con QR: desde el panel de administración, y 404 para quien no es admin",
  "/dashboard/admin/pegatinas/[codigo]": "una pegatina: a donde lleva su QR cuando lo escanea el admin, o tocarla en la lista",
};

/**
 * Las pantallas que no son una pestaña pero **cuelgan de una**: la sección se ilumina y
 * las pestañas se ven, aunque ninguna quede marcada como propia. Van acá con cómo se
 * llega a cada una, y el test comprueba que de verdad caigan en una sección.
 */
const CUELGAN_DE_UNA_PESTANA: Record<string, string> = {
  "/dashboard/pilotos/publicar": "Compartir en cada vuelo, el aviso después de registrar uno, y el perfil propio",
  "/dashboard/pilotos/[handle]": "tocar un piloto en cualquier lista, publicación o actividad",
  "/dashboard/plan-de-vuelo/[id]": "tocar un plan en la lista de Plan de vuelo, o armarlo desde el planificador",
  "/dashboard/history/cad": "el botón \"Pasar al CAD\" de la Bitácora",
};

/** Las rutas con `page.tsx` bajo `src/app/dashboard`, sin grupos ni slots. */
function pantallasDelDashboard(): string[] {
  const rutas: string[] = [];
  const recorrer = (dir: string, ruta: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isFile() && entrada.name === "page.tsx") rutas.push(ruta || "/dashboard");
      if (!entrada.isDirectory()) continue;
      // `@slot`, `(grupo)` y `_privada` no son segmentos de URL.
      if (/^[@(_]/.test(entrada.name)) continue;
      recorrer(path.join(dir, entrada.name), `${ruta || "/dashboard"}/${entrada.name}`);
    }
  };
  recorrer(DASHBOARD, "");
  return rutas.sort();
}

describe("las secciones", () => {
  it("van en el orden de los íconos que ya estaban, y lo nuevo al final", () => {
    // Inicio, Bitácora, Balance y el Planificador ocupaban los primeros cuatro
    // lugares. Cambiar este orden mueve íconos que la gente ya tiene en la mano.
    expect(SECCIONES.map((s) => s.clave)).toEqual(["inicio", "bitacora", "balance", "preparar", "pilotos"]);
  });

  it("no pasan de cinco, lo que entra en la píldora del teléfono", () => {
    // Una sexta vuelve a necesitar la hoja "Más", que se sacó en la 2.18.0.
    expect(SECCIONES.length).toBeLessThanOrEqual(5);
  });

  it("no repiten una pantalla en dos lugares", () => {
    const hrefs = SECCIONES.flatMap((s) => s.pestanas.map((p) => p.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("apuntan a pantallas que existen", () => {
    for (const s of SECCIONES) {
      for (const p of s.pestanas) {
        const segmentos = p.href.replace(/^\//, "").split("/");
        const pagina = path.join(RAIZ, "src", "app", ...segmentos, "page.tsx");
        expect(fs.existsSync(pagina), `${p.href} no tiene page.tsx`).toBe(true);
      }
    }
  });

  it("no dejan ninguna pantalla del dashboard sin forma de llegar", () => {
    const enSecciones = new Set(SECCIONES.flatMap((s) => s.pestanas.map((p) => p.href)));
    const huerfanas = pantallasDelDashboard().filter(
      (r) => !enSecciones.has(r) && !(r in FUERA_DE_LA_BARRA) && !(r in CUELGAN_DE_UNA_PESTANA)
    );
    expect(huerfanas).toEqual([]);
  });

  it("las listas de excepciones no nombran pantallas que ya no existen", () => {
    const existentes = new Set(pantallasDelDashboard());
    for (const ruta of [...Object.keys(FUERA_DE_LA_BARRA), ...Object.keys(CUELGAN_DE_UNA_PESTANA)]) {
      expect(existentes.has(ruta), `${ruta} ya no existe`).toBe(true);
    }
  });

  it("lo que dice colgar de una pestaña, cuelga de verdad", () => {
    for (const ruta of Object.keys(CUELGAN_DE_UNA_PESTANA)) {
      // `[handle]` es un segmento dinámico: se prueba con un valor cualquiera.
      const concreta = ruta.replace(/\[[^\]]+\]/g, "cualquiera");
      expect(seccionDe(concreta), `${ruta} no cae en ninguna sección`).not.toBeNull();
    }
  });

  it("el ícono de cada sección lleva a su primera pestaña", () => {
    expect(SECCIONES.map(hrefDeSeccion)).toEqual([
      "/dashboard",
      "/dashboard/history",
      "/dashboard/balance",
      "/dashboard/planificador",
      "/dashboard/pilotos",
    ]);
  });
});

describe("seccionDe", () => {
  it("encuentra la sección de cada pestaña", () => {
    for (const s of SECCIONES) {
      for (const p of s.pestanas) expect(seccionDe(p.href)?.clave).toBe(s.clave);
    }
  });

  it("agrupa el resumen, el calendario y la auditoría con la bitácora", () => {
    expect(seccionDe("/dashboard/summary")?.clave).toBe("bitacora");
    expect(seccionDe("/dashboard/calendario")?.clave).toBe("bitacora");
    expect(seccionDe("/dashboard/audit")?.clave).toBe("bitacora");
  });

  it("agrupa aeropuertos, clima y herramientas con el planificador", () => {
    expect(seccionDe("/dashboard/airports")?.clave).toBe("preparar");
    expect(seccionDe("/dashboard/clima")?.clave).toBe("preparar");
    expect(seccionDe("/dashboard/tools")?.clave).toBe("preparar");
  });

  it("no le asigna sección a las pantallas que están fuera de la barra", () => {
    for (const ruta of Object.keys(FUERA_DE_LA_BARRA)) expect(seccionDe(ruta)).toBeNull();
  });

  it("toma como propia una pantalla que cuelga de una pestaña", () => {
    expect(seccionDe("/dashboard/airports/SADF")?.clave).toBe("preparar");
  });

  it("distingue Red de Buscar y de Actividad aunque cuelguen de ella", () => {
    // `/dashboard/pilotos/actividad` empieza con `/dashboard/pilotos/`: por prefijo
    // se iluminarían dos pestañas de Pilotos a la vez.
    const pilotos = SECCIONES.find((s) => s.clave === "pilotos")!;
    expect(seccionDe("/dashboard/pilotos/actividad")?.clave).toBe("pilotos");
    expect(pestanaActiva(pilotos, "/dashboard/pilotos/actividad")?.label).toBe("Actividad");
    expect(pestanaActiva(pilotos, "/dashboard/pilotos/buscar")?.label).toBe("Buscar");
    expect(pestanaActiva(pilotos, "/dashboard/pilotos")?.label).toBe("Red");
  });

  it("el perfil de un piloto y Publicar quedan bajo la Red", () => {
    const pilotos = SECCIONES.find((s) => s.clave === "pilotos")!;
    expect(pestanaActiva(pilotos, "/dashboard/pilotos/fede.dn")?.label).toBe("Red");
    expect(pestanaActiva(pilotos, "/dashboard/pilotos/publicar")?.label).toBe("Red");
  });

  it("en cada sección se ilumina a lo sumo una pestaña por pantalla", () => {
    for (const s of SECCIONES) {
      for (const p of s.pestanas) expect(pestanaActiva(s, p.href)?.href).toBe(p.href);
    }
  });

  it("no confunde un prefijo de texto con un segmento", () => {
    expect(seccionDe("/dashboard/historyx")).toBeNull();
  });
});

describe("esPestanaActiva", () => {
  const inicio = { href: "/dashboard", label: "Inicio" };

  it("sólo toma el inicio exacto, porque es el prefijo de toda la app", () => {
    expect(esPestanaActiva(inicio, "/dashboard")).toBe(true);
    expect(esPestanaActiva(inicio, "/dashboard/history")).toBe(false);
  });
});

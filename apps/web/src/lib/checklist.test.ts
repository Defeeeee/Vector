import { describe, expect, it } from "vitest";
import {
  escribirChecklist,
  itemsTildables,
  MAX_ELEMENTOS,
  MAX_SUB,
  parsearChecklist,
  partirPaso,
  validarChecklist,
} from "./checklist";

// Un ejemplo inventado, corto: no es la checklist de ningún avión.
const EJEMPLO = `Leé todo antes de arrancar.

# Antes del despegue
- Frenos: PUESTOS
- Mezcla: RICA
  - Tocar la palanca
  - Verificar el tope
- Flaps
> NOTA: con viento cruzado:
  - Alerones hacia el viento
> Avisá a la torre.

# Cierre
algo suelto
`;

describe("parsearChecklist", () => {
  const { secciones } = parsearChecklist(EJEMPLO);

  it("las líneas antes del primer # son una introducción sin título", () => {
    expect(secciones[0].titulo).toBeNull();
    expect(secciones[0].elementos).toEqual([{ tipo: "nota", texto: "Leé todo antes de arrancar.", sub: [] }]);
  });

  it("cada # es una sección", () => {
    expect(secciones.map((s) => s.titulo)).toEqual([null, "Antes del despegue", "Cierre"]);
  });

  it("los pasos y las notas", () => {
    const e = secciones[1].elementos;
    expect(e.map((x) => x.tipo)).toEqual(["paso", "paso", "paso", "nota", "nota"]);
    expect(e[0].texto).toBe("Frenos: PUESTOS");
  });

  it("los sub-pasos cuelgan de un paso", () => {
    expect(secciones[1].elementos[1].sub).toEqual(["Tocar la palanca", "Verificar el tope"]);
  });

  it("los sub-pasos cuelgan también de una nota", () => {
    expect(secciones[1].elementos[3].sub).toEqual(["Alerones hacia el viento"]);
  });

  it("una línea suelta es un paso", () => {
    expect(secciones[2].elementos[0]).toEqual({ tipo: "paso", texto: "algo suelto", sub: [] });
  });

  it("un '- ' con sangría sin nada antes es un paso", () => {
    expect(parsearChecklist("# A\n  - huérfano").secciones[0].elementos[0].tipo).toBe("paso");
  });

  it("tolera los fines de línea de Windows y las líneas vacías", () => {
    expect(parsearChecklist("# A\r\n\r\n- uno\r\n").secciones[0].elementos).toHaveLength(1);
  });

  it("un texto vacío no tiene secciones", () => {
    expect(parsearChecklist("  \n\n").secciones).toEqual([]);
  });
});

describe("escribirChecklist", () => {
  it("ida y vuelta estable", () => {
    const una = parsearChecklist(EJEMPLO);
    const texto = escribirChecklist(una);
    expect(parsearChecklist(texto)).toEqual(una);
    expect(escribirChecklist(parsearChecklist(texto))).toBe(texto);
  });
});

describe("partirPaso", () => {
  it("corta en el primer ':'", () => {
    expect(partirPaso("Master Aviónica: OFF")).toEqual({ etiqueta: "Master Aviónica", valor: "OFF" });
    expect(partirPaso("Hora: 10:30")).toEqual({ etiqueta: "Hora", valor: "10:30" });
  });
  it("sin ':' es sólo la etiqueta", () => {
    expect(partirPaso("Flaps")).toEqual({ etiqueta: "Flaps", valor: null });
    expect(partirPaso("Régimen 2000/2200")).toEqual({ etiqueta: "Régimen 2000/2200", valor: null });
  });
  it("con ':' al final no hay valor", () => {
    expect(partirPaso("Controles:")).toEqual({ etiqueta: "Controles", valor: null });
  });
});

describe("itemsTildables", () => {
  it("cuenta pasos y sub-pasos de pasos, no las notas", () => {
    const s = parsearChecklist(EJEMPLO).secciones[1];
    expect(itemsTildables(s, 1)).toEqual(["1.0", "1.1", "1.1.0", "1.1.1", "1.2"]);
  });
});

describe("validarChecklist", () => {
  it("el ejemplo pasa", () => {
    expect(validarChecklist("Mi avión", EJEMPLO)).toBeNull();
  });
  it("el nombre", () => {
    expect(validarChecklist("  ", "")).toMatch(/nombre/);
    expect(validarChecklist("a".repeat(81), "")).toMatch(/80/);
  });
  it("los topes", () => {
    expect(validarChecklist("a", "x".repeat(40_001))).toMatch(/larga/);
    expect(validarChecklist("a", Array.from({ length: 41 }, (_, i) => `# S${i}`).join("\n"))).toMatch(/secciones/);
    expect(validarChecklist("a", "# S\n" + Array.from({ length: MAX_ELEMENTOS + 1 }, (_, i) => `- p${i}`).join("\n"))).toMatch(/elementos/);
    expect(validarChecklist("a", "- " + "x".repeat(301))).toMatch(/300/);
    expect(validarChecklist("a", "- p\n" + Array.from({ length: MAX_SUB + 1 }, (_, i) => `  - s${i}`).join("\n"))).toMatch(/sub-pasos/);
  });
});

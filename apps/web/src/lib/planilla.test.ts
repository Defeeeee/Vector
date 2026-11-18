import { describe, expect, it } from "vitest";
import { armarZip } from "./zip";
import { leerCsv, leerXlsx, lotesDePlanilla, serieAFecha, textoDelLote, FILAS_POR_LOTE } from "./planilla";

const t = (s: string) => new TextEncoder().encode(s);
// Un xlsx mínimo (sin comprimir), con una fecha y una hora con formato y un texto compartido.
function xlsx(): Buffer {
  return Buffer.from(armarZip([
    { nombre: "xl/workbook.xml", datos: t('<workbook><sheets><sheet r:id="rId1" name="Bitácora" sheetId="1"/></sheets></workbook>') },
    { nombre: "xl/_rels/workbook.xml.rels", datos: t('<Relationships><Relationship Target="worksheets/sheet1.xml" Id="rId1" Type="x"/></Relationships>') },
    { nombre: "xl/sharedStrings.xml", datos: t("<sst><si><t>Fecha</t></si><si><t>Matr.</t></si><si><r><t>Sa</t></r><r><t>lida</t></r></si><si><t>LV-ABC</t></si></sst>") },
    { nombre: "xl/styles.xml", datos: t('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="20"/></cellXfs></styleSheet>') },
    { nombre: "xl/worksheets/sheet1.xml", datos: t('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" s="1"><v>45717</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" s="2"><v>0.5833333333</v></c><c r="E2"><v>1.2</v></c></row></sheetData></worksheet>') },
  ]));
}

describe("planilla", () => {
  it("lee un xlsx: textos compartidos, fechas y horas por su formato, columnas salteadas", () => {
    expect(leerXlsx(xlsx())).toEqual([{ nombre: "Bitácora", filas: [["Fecha", "Matr.", "Salida"], ["2025-03-01", "LV-ABC", "14:00", "", "1.2"]] }]);
  });
  it("convierte números de serie de Excel", () => {
    expect(serieAFecha(45717, "fecha")).toBe("2025-03-01");
    expect(serieAFecha(0.75, "hora")).toBe("18:00");
    expect(serieAFecha(45717.5, "fechahora")).toBe("2025-03-01 12:00");
  });
  it("lee un csv con punto y coma, comillas y BOM", () => {
    expect(leerCsv('﻿Fecha;Ruta;Obs\n01/03/2025;SADF SAAR;"Nav; con viento"\n\n02/03/2025;SADF SADF;\n')[0].filas).toEqual([
      ["Fecha", "Ruta", "Obs"], ["01/03/2025", "SADF SAAR", "Nav; con viento"], ["02/03/2025", "SADF SADF", ""],
    ]);
  });
  it("parte en lotes con el encabezado de la hoja adelante", () => {
    const filas = Array.from({ length: 6 + FILAS_POR_LOTE + 5 }, (_, i) => [`fila ${i + 1}`]);
    const lotes = lotesDePlanilla([{ nombre: "H", filas }]);
    expect(lotes.map((l) => [l.desde, l.filas.length, l.encabezado.length])).toEqual([[7, FILAS_POR_LOTE, 6], [7 + FILAS_POR_LOTE, 5, 6]]);
    expect(textoDelLote(lotes[1])).toContain("1: fila 1");
    expect(textoDelLote(lotes[1])).toContain(`${7 + FILAS_POR_LOTE}: fila ${7 + FILAS_POR_LOTE}`);
  });
});

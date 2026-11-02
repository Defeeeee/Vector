#!/usr/bin/env node
/**
 * Genera CHANGELOG.md desde src/lib/changelog.ts.
 *
 *   npm run build:changelog
 *
 * **Una fuente, dos salidas.** El changelog vive en un `.ts` porque de ahí lo lee la
 * app; el `.md` existe porque es donde lo busca quien mira el repositorio desde GitHub.
 * Escribirlo dos veces sería garantizar que diverjan — es la misma lección que dejó
 * `splitRoute`, que en este repo llegó a estar escrita cinco veces.
 *
 * No usa TypeScript en runtime: parsea el archivo con un import dinámico previa
 * transpilación mínima. Es un script de build, corre una vez por release.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = path.join(RAIZ, "src", "lib", "changelog.ts");
const SALIDA = path.join(RAIZ, "CHANGELOG.md");

/**
 * Saca el array `CHANGELOG` del módulo TypeScript sin compilarlo.
 *
 * El archivo es datos puros —sin imports, sin lógica— así que alcanza con aislar el
 * literal y evaluarlo. Si algún día deja de ser datos puros, esto falla ruidosamente en
 * vez de generar un `.md` incompleto.
 */
function leerChangelog(codigo, nombre = "CHANGELOG") {
  const inicio = codigo.indexOf(`export const ${nombre}`);
  if (inicio === -1) throw new Error(`No encontré \`export const ${nombre}\` en changelog.ts`);

  // Ojo: hay que buscar después del `=`, no después del nombre. El primer `[` que
  // aparece es el de la anotación de tipo `VersionPublicada[]`, no el del array.
  const igual = codigo.indexOf("=", inicio);
  const abre = codigo.indexOf("[", igual);
  let nivel = 0;
  let cierra = -1;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "[") nivel++;
    else if (codigo[i] === "]") {
      nivel--;
      if (nivel === 0) { cierra = i; break; }
    }
  }
  if (cierra === -1) throw new Error(`El array ${nombre} no cierra`);

  return JSON.parse(
    JSON.stringify(eval(`(${codigo.slice(abre, cierra + 1)})`))
  );
}

const codigo = fs.readFileSync(FUENTE, "utf8");
const versiones = leerChangelog(codigo);
// Las que suben sólo el último dígito sin anunciarse (ver `VERSIONES_SIN_NOVEDADES`).
const sinNovedades = leerChangelog(codigo, "VERSIONES_SIN_NOVEDADES").map((v) => v.version);
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));

if (versiones[0].version !== paquete.version && !sinNovedades.includes(paquete.version)) {
  console.error(
    `La versión del changelog (${versiones[0].version}) no coincide con package.json (${paquete.version}).`
  );
  process.exit(1);
}

const lineas = [
  "# Novedades de Vector",
  "",
  "Generado por `npm run build:changelog` desde `src/lib/changelog.ts`. **No editar a mano:**",
  "lo que se escriba acá se pierde en la próxima corrida.",
  "",
  "Sólo va lo que el piloto ve. Lo de adentro —tests, refactors, migraciones— está en",
  "la bitácora de `docs/bitacora/`.",
  "",
];

for (const v of versiones) {
  const fecha = new Date(`${v.fecha}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
  lineas.push(`## v${v.version} — ${v.titulo}`, "", `_${fecha}_`, "");
  for (const n of v.novedades) {
    lineas.push(`- **${n.titulo}** — ${n.texto}`);
  }
  lineas.push("");
}

fs.writeFileSync(SALIDA, lineas.join("\n"));
console.log(`CHANGELOG.md: ${versiones.length} versiones, ${versiones.flatMap((v) => v.novedades).length} novedades.`);

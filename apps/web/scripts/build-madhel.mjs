#!/usr/bin/env node
/**
 * Regenerates src/data/madhel.tsv from ANAC's MADHEL (Manual de Aeródromos y
 * Helipuertos), the Argentine authority on aerodrome identifiers.
 *
 *   node scripts/build-madhel.mjs
 *
 * Why this exists next to build-airports.mjs: the OurAirports import only knows
 * the 164 Argentine aerodromes that have an ICAO code. MADHEL lists **711**, and
 * 559 of them have *no* ICAO at all — they are identified by a three-letter ANAC
 * designator (GEZ, ACB, MOR). Those are exactly the fields a local pilot flies to
 * and writes in their logbook, so without this file "GEZ" resolves to nothing.
 *
 * The API is the same one the official MADHEL web app calls; it is public and
 * needs no key. Run it every few months — MADHEL is amended continuously, but
 * the identifiers and locations move very slowly.
 *
 * Columns: local ICAO IATA name city province kind condition control status elev_m lat lon
 *
 * ⚠️ Este script **se lleva puesta la 14ª columna**, la variación magnética. Después
 * de correrlo hay que correr `npm run build:magvar`, que la recalcula. Hay un test
 * (`src/lib/magvar.test.ts`) que falla si alguien se olvida.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIST = "https://datos.anac.gob.ar/madhel/api/v2/airports/";
const detailUrl = (code) => `${LIST}${encodeURIComponent(code)}/?format=json`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "madhel.tsv");

/**
 * The API rate-limits, and it says so properly: past a few hundred requests it
 * answers `429` with `Retry-After: 3`. Honour that header rather than guessing —
 * a fixed backoff either gives up too early (a first attempt at eight concurrent
 * connections got 537 of 711 and then failed everything) or wastes minutes.
 *
 * Two workers is deliberate: the limit is on request *rate*, so more of them just
 * means more 429s to wait out. The whole run takes a few minutes, which is fine
 * for something that runs a few times a year.
 */
const CONCURRENCY = 2;
const GAP_MS = 200;
/** Network/5xx retries. A 429 is not one of these — see below. */
const ATTEMPTS = 4;
/** How long to keep honouring `Retry-After` for a single record before giving up. */
const MAX_RATE_LIMIT_WAIT_MS = 120_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  let attempt = 0;
  let waited = 0;

  for (;;) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
    } catch (err) {
      if (++attempt >= ATTEMPTS) throw err;
      await sleep(800 * attempt);
      continue;
    }

    if (res.status === 429) {
      const wait = (Number(res.headers.get("retry-after")) || 3) * 1000;
      waited += wait;
      if (waited > MAX_RATE_LIMIT_WAIT_MS) {
        throw new Error(`rate limited for ${waited / 1000}s on ${url} — try again later`);
      }
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      if (++attempt >= ATTEMPTS) throw new Error(`HTTP ${res.status} on ${url}`);
      await sleep(800 * attempt);
      continue;
    }

    return await res.json();
  }
}

/** TSV is line- and tab-delimited; MADHEL free text contains neither, but a
 *  stray one would silently shift every column after it. */
const clean = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();

/**
 * MADHEL renders identity as `NAME - (LOCAL / ICAO) - REGION - CONDITION`.
 *
 * The structured `identifiers.icao` field is **incomplete**: it is populated for
 * 141 aerodromes while the printed name carries 152 (SAEA / General Acha is one
 * of the missing). The two never disagree where both exist, so the name is the
 * better source and the field is the fallback.
 *
 * This function deliberately has no correction table. There was one for a while,
 * mapping PAL to SADP and PTA to SADL as if MADHEL had them swapped — it did not.
 * ANAC publishes `EL PALOMAR - (PAL / SADP)` and `LA PLATA - (PTA / SADL)`, so the
 * table returned exactly what parsing already returned. The whole file was checked
 * row by row against the API: 711 of 711 identical. If a code ever does look
 * wrong, the bug is in the parse or in the app, not in the source.
 */
function icaoOf(record) {
  const title = record.human_readable_identifier || record.the_geom?.properties?.name || "";
  const inside = /\(([^)]*)\)/.exec(title);
  const parts = inside ? inside[1].split("/").map((s) => s.trim()) : [];
  const fromName = parts.length > 1 ? parts[1] : "";
  if (/^[A-Z0-9]{4}$/.test(fromName)) return fromName;

  const metaIcao = record.metadata?.identifiers?.icao ?? "";
  if (/^[A-Z0-9]{4}$/.test(metaIcao)) return metaIcao;

  return "";
}

/** The published name without the trailing identifier/category boilerplate. */
function nameOf(record) {
  return clean((record.human_readable_identifier ?? "").split(" - (")[0]);
}

const list = await getJson(LIST);
const codes = list.results.map((r) => r.local_identifier);
console.log(`${LIST}: ${list.count} aerodromes`);

const details = new Map();
const queue = [...codes];
let done = 0;

async function worker() {
  for (;;) {
    const code = queue.shift();
    if (!code) return;
    details.set(code, await getJson(detailUrl(code)));
    if (++done % 100 === 0) console.log(`  ${done}/${codes.length}`);
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const rows = [];
for (const code of codes) {
  const record = details.get(code);
  const meta = record.metadata ?? {};
  const loc = meta.localization ?? {};
  const ids = meta.identifiers ?? {};

  rows.push(
    [
      code,
      icaoOf(record),
      ids.iata ?? "",
      nameOf(record),
      clean(loc.city_reference),
      clean(loc.state),
      record.type === "HEL" ? "HEL" : "AD",
      // PUBLICO / PRIVADO, blank where MADHEL does not state it.
      clean(meta.condition),
      meta.control === "CONTROLLED" ? "C" : meta.control ? "NC" : "",
      clean(meta.status),
      // MADHEL publishes elevation in **metres** (San Fernando reads 3, which is
      // the 10 ft OurAirports carries). Kept in metres here, converted on load.
      Number.isFinite(loc.elevation) ? String(Math.round(loc.elevation)) : "",
      Number.isFinite(loc.coordinates?.lat) ? String(Number(loc.coordinates.lat.toFixed(4))) : "",
      Number.isFinite(loc.coordinates?.lng) ? String(Number(loc.coordinates.lng.toFixed(4))) : "",
    ].map(clean).join("\t")
  );
}

rows.sort();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, rows.join("\n") + "\n");

const withIcao = rows.filter((r) => r.split("\t")[1]).length;
console.log(
  `${OUT}: ${rows.length} aerodromes (${withIcao} with an ICAO code, ` +
  `${rows.length - withIcao} identified only by their ANAC designator), ` +
  `${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`
);

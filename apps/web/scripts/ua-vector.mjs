/**
 * Cómo se presentan los scripts que le piden datos a ANAC (el AIP, MADHEL, el CAD) o a
 * Infoleg: **como Vector, nunca imitando un navegador**. Es el mismo texto que
 * `USER_AGENT_VECTOR` de `src/lib/notams-descargados.ts`, que no se puede importar desde acá.
 *
 * Hasta el 2026-11-03 siete de estos scripts mandaban el User-Agent de un Chrome y un Referer
 * del sitio de ANAC.
 */
export const UA_VECTOR = "Vector/1.0 (bitacora de vuelo; https://vector.fdiaznem.com.ar)";

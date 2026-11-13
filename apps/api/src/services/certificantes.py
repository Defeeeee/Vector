"""
Quién certificó cada vuelo (migración 048): comparar nombres y armar las sugerencias.

Puro, sin base. El nombre de un certificante en `flights.cad_autoridad_nombre` es texto libre
que el piloto escribió (o que trajo del CAD): el mismo instructor aparece con dos grafías, a
veces con la licencia pegada. Acá se decide, sin adivinar, cuándo dos nombres son la misma
persona.
"""
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Tuple

#: Lo que puede venir después del nombre sin ser parte de él: la sigla de la licencia o el
#: número. Todo lo demás (otro nombre, otro apellido) hace que no sea la misma persona.
SIGLAS_DE_LICENCIA = frozenset({
    "IV", "IVA", "INA", "IC", "ICA", "PPA", "PCA", "PLA", "TLA", "CPL", "ATPL", "DNI",
    "LIC", "LICENCIA", "NRO", "NUM", "N", "NO",
})

#: Cuánto vale cada forma de coincidir: gana la más fuerte.
EXACTA, PALABRAS, CON_LICENCIA = 3, 2, 1


def normalizar(nombre: Optional[str]) -> str:
    """Mayúsculas, sin acentos ni puntuación, un solo espacio. Igual que `normalizarNombre` de la web."""
    s = unicodedata.normalize("NFD", nombre or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9Ñ ]+", " ", s.upper())
    return " ".join(s.split())


def _tokens(nombre: Optional[str]) -> List[str]:
    return normalizar(nombre).split()


def _es_licencia(token: str) -> bool:
    return any(c.isdigit() for c in token) or token in SIGLAS_DE_LICENCIA


def forma_de_coincidir(nombre_vuelo: Optional[str], nombre: Optional[str]) -> int:
    """
    0 si no son la misma persona; si lo son, `EXACTA`, `PALABRAS` (mismas palabras en otro
    orden) o `CON_LICENCIA` (el nombre de la persona, más sólo licencia o números).
    """
    a, b = _tokens(nombre_vuelo), _tokens(nombre)
    if not a or not b:
        return 0
    if a == b:
        return EXACTA
    if sorted(a) == sorted(b):
        return PALABRAS
    if len(a) > len(b):
        resto = list(a)
        for t in b:
            if t in resto:
                resto.remove(t)
            else:
                return 0
        if resto and all(_es_licencia(t) for t in resto):
            return CON_LICENCIA
    return 0


def mejor_forma(nombre_vuelo: Optional[str], persona: Dict[str, Any]) -> int:
    """La mejor coincidencia del nombre del vuelo con el nombre de la persona o algún alias."""
    nombres = [persona.get("nombre")] + list(persona.get("alias") or [])
    return max((forma_de_coincidir(nombre_vuelo, n) for n in nombres), default=0)


def persona_de(nombre_vuelo: Optional[str], personas: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    La persona a la que pertenece ese nombre, o None si no está o si es ambiguo (dos con la
    misma fuerza de coincidencia: no se elige a ninguna).
    """
    puntajes = [(mejor_forma(nombre_vuelo, p), p) for p in personas]
    puntajes = [(s, p) for s, p in puntajes if s > 0]
    if not puntajes:
        return None
    mejor = max(s for s, _ in puntajes)
    ganadoras = [p for s, p in puntajes if s == mejor]
    return ganadoras[0] if len(ganadoras) == 1 else None


def sugerencias(personas: List[Dict[str, Any]], vuelos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Por cada nombre distinto que aparece en vuelos **sin** certificante asignado y que es de
    una persona guardada: `{certificante_id, nombre_en_vuelos, vuelo_ids, sumar_alias}`.
    `sumar_alias` es True si el nombre no es el de la persona ni uno de sus alias (el toque
    "Asociar y sumar el alias").
    """
    grupos: Dict[str, Dict[str, Any]] = {}
    for v in vuelos:
        if v.get("certificante_id"):
            continue
        crudo = " ".join((v.get("cad_autoridad_nombre") or "").split())
        clave = normalizar(crudo)
        if not clave:
            continue
        g = grupos.setdefault(clave, {"nombre": crudo, "vuelo_ids": []})
        g["vuelo_ids"].append(str(v["id"]))
    salida: List[Dict[str, Any]] = []
    for clave, g in grupos.items():
        persona = persona_de(g["nombre"], personas)
        if not persona:
            continue
        conocidos = {normalizar(persona.get("nombre"))} | {normalizar(a) for a in persona.get("alias") or []}
        salida.append({
            "certificante_id": str(persona["id"]),
            "nombre_en_vuelos": g["nombre"],
            "vuelo_ids": g["vuelo_ids"],
            "sumar_alias": clave not in conocidos,
        })
    salida.sort(key=lambda s: (-len(s["vuelo_ids"]), s["nombre_en_vuelos"]))
    return salida


def completar_autoridad(vuelo: Dict[str, Any], persona: Dict[str, Any]) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Qué escribirle a `cad_autoridad_*` de un vuelo al asignarle esta persona: `(cambios, aviso)`.

    Si el vuelo no tiene nombre de certificante, se le pone el de la persona (y su cargo, si lo
    tiene): es lo que va al CAD. **Si ya tiene otro nombre, no se pisa**: va un aviso. Si el
    nombre que tiene es de la misma persona (otra grafía, con la licencia) no hay nada que avisar.
    """
    actual = " ".join((vuelo.get("cad_autoridad_nombre") or "").split())
    if not actual:
        cambios: Dict[str, Any] = {"cad_autoridad_nombre": persona["nombre"]}
        if persona.get("autoridad_id") is not None and not vuelo.get("cad_autoridad_id"):
            cambios["cad_autoridad_id"] = persona["autoridad_id"]
        return cambios, None
    if mejor_forma(actual, persona) > 0:
        return {}, None
    return {}, f"Este vuelo dice {actual} para el CAD; no lo cambié."

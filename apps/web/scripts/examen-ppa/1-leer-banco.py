import re, json, sys, unicodedata
txt = open(sys.argv[1]).read()
# Saco encabezados y pies de página
lineas = []
for l in txt.split("\n"):
    t = l.strip()
    if t.startswith("=== PAGINA") or t in ("Dirección Nacional de Seguridad Operacional","Dirección de Licencias al Personal","Azopardo 1405","Capital Federal") or re.match(r"página \d+ / \d+$", t):
        continue
    lineas.append(t)
preguntas, cur, opc = [], None, None
inicio = re.compile(r"^(\d+) S 1$")
op = re.compile(r"^(\d) (\*?) ?(\d)$")
for t in lineas:
    m = inicio.match(t)
    if m:
        if cur: preguntas.append(cur)
        cur = {"n": int(m.group(1)), "texto": "", "opciones": [], "correcta": None}
        opc = None
        continue
    if cur is None: continue
    m = op.match(t)
    if m:
        opc = {"texto": "", "correcta": m.group(2) == "*"}
        cur["opciones"].append(opc)
        continue
    if opc is not None: opc["texto"] = (opc["texto"] + " " + t).strip()
    else: cur["texto"] = (cur["texto"] + " " + t).strip()
if cur: preguntas.append(cur)
ok = [p for p in preguntas if len(p["opciones"]) >= 2 and sum(o["correcta"] for o in p["opciones"]) == 1]
mal = [p for p in preguntas if p not in ok]
fig = [p for p in ok if re.search(r"figura|fig\.|ilustraci", p["texto"], re.I)]
print("total", len(preguntas), "bien formadas", len(ok), "mal", len(mal), "con figura", len(fig))
print("opciones por pregunta", sorted(set(len(p["opciones"]) for p in ok)))
for p in mal[:5]: print("MAL", p["n"], p["texto"][:80], [ (o["texto"][:20], o["correcta"]) for o in p["opciones"]])
json.dump(ok, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)

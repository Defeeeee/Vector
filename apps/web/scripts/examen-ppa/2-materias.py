import re, json, sys, unicodedata
def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return set(w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 2)
cap_txt = open(sys.argv[1]).read()
banco = json.load(open(sys.argv[2]))
caps, actual, preg = [], None, []
for l in cap_txt.split("\n"):
    t = l.strip()
    m = re.match(r"CAP[IÍ]TULO (\d+): (.+)", t)
    if m:
        actual = (int(m.group(1)), m.group(2).strip().title()); continue
    if actual is None or t.startswith("=== PAGINA") or t in ("ANAC","PILOTO PRIVADO AVIÓN") or "Página" in t: continue
    m = re.match(r"^(\d+)\s*[\.\-]+\s*(.*)", t)
    if m and not re.match(r"^[abc]\)", t):
        preg.append({"cap": actual, "texto": m.group(2)}); continue
    if preg and not re.match(r"^[abc]\)", t) and t: preg[-1]["texto"] += " " + t
for p in preg: p["toks"] = norm(p["texto"])
sin, conteo = 0, {}
for q in banco:
    tq = norm(q["texto"])
    mejor, cap = 0, None
    for p in preg:
        if not tq or not p["toks"]: continue
        j = len(tq & p["toks"]) / len(tq | p["toks"])
        if j > mejor: mejor, cap = j, p["cap"]
    q["materia"] = cap[1] if mejor >= 0.45 else None
    q["parecido"] = round(mejor, 2)
    if q["materia"] is None: sin += 1
    conteo[q["materia"]] = conteo.get(q["materia"], 0) + 1
print("preguntas en capítulos:", len(preg), "| sin materia:", sin)
for k, v in sorted(conteo.items(), key=lambda x: -x[1]): print(" ", k, v)
json.dump(banco, open(sys.argv[3], "w"), ensure_ascii=False, indent=1)
for q in [q for q in banco if q["materia"] is None][:12]: print("SIN", q["parecido"], q["texto"][:110])

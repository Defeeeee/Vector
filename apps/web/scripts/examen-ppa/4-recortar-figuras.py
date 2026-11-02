import pymupdf, json, re, sys
B = pymupdf.open(sys.argv[1]); banco = json.load(open(sys.argv[2])); out = sys.argv[3]
fig = [q for q in banco if re.search(r"figura|fig\.|ilustraci|gr[aá]fic|imagen", q["texto"], re.I)]
lineas = []
for i, p in enumerate(B):
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t: lineas.append((i, l["bbox"][1], l["bbox"][3], l["bbox"][0], t))
lineas.sort(key=lambda x: (x[0], x[1], x[3]))
imagenes = {i: [pymupdf.Rect(x["bbox"]) for x in p.get_image_info() if x["bbox"][1] > 72] for i, p in enumerate(B)}  # sin el logo
res = {}
for q in fig:
    n = str(q["n"])
    idx = next((k for k, l in enumerate(lineas) if l[4] == n and l[3] < 70 and any(m[4] == "S" and m[0] == l[0] and abs(m[1]-l[1]) < 3 for m in lineas[k:k+4])), None)
    if idx is None: res[q["n"]] = "sin fila"; continue
    pg, y = lineas[idx][0], lineas[idx][1]
    op = next((l for l in lineas[idx+1:] if l[4] == "1" and 78 < l[3] < 90), None)
    if op is None: res[q["n"]] = "sin opciones"; continue
    cajas = []
    for pagina in range(pg, op[0] + 1):
        for r in imagenes[pagina]:
            if (pagina > pg or r.y0 >= y) and (pagina < op[0] or r.y1 <= op[1] + 2):
                cajas.append((pagina, r))
    if not cajas: res[q["n"]] = "SIN IMAGEN"; continue
    pixs = [B[p].get_pixmap(dpi=170, clip=r) for p, r in cajas]
    w = max(x.width for x in pixs); h = sum(x.height for x in pixs) + 10 * (len(pixs) - 1)
    lienzo = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False); lienzo.set_rect(lienzo.irect, (255, 255, 255))
    yy = 0
    for x in pixs:
        x2 = x if (x.n == 3 and not x.alpha) else pymupdf.Pixmap(pymupdf.csRGB, x)
        if x2.alpha: x2 = pymupdf.Pixmap(x2, 0)
        x2.set_origin(0, yy); lienzo.copy(x2, x2.irect); yy += x.height + 10
    lienzo.save(f"{out}/q{q['n']}.png")
    res[q["n"]] = f"{len(cajas)} imagen(es) {w}x{h}"
json.dump(res, open(f"{out}/_res.json", "w"), indent=0)
for k, v in sorted(res.items()): print(k, v)

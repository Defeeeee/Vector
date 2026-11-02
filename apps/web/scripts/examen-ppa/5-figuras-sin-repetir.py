import pymupdf, json, sys, os
src, out = sys.argv[1], sys.argv[2]
res = json.load(open(f"{src}/_res.json"))
ids = sorted(int(k) for k, v in res.items() if "imagen" in v)
def huella(p):
    g = pymupdf.Pixmap(pymupdf.csGRAY, p) if p.n != 1 else p
    chica = pymupdf.Pixmap(g, 32, 32, None)
    return chica.samples, (p.width / p.height)
grupos, mapa = [], {}
for n in ids:
    p = pymupdf.Pixmap(f"{src}/q{n}.png")
    h, r = huella(p)
    for g in grupos:
        if abs(g["r"] - r) < 0.03 and sum(abs(a - b) for a, b in zip(g["h"], h)) / len(h) < 6:
            mapa[n] = g["nombre"]; break
    else:
        nombre = f"f{len(grupos)+1:02d}.jpg"
        ancho = min(900, p.width)
        chica = pymupdf.Pixmap(p, ancho, round(p.height * ancho / p.width), None) if p.width > ancho else p
        if chica.alpha: chica = pymupdf.Pixmap(chica, 0)
        chica.save(f"{out}/{nombre}", jpg_quality=80)
        grupos.append({"h": h, "r": r, "nombre": nombre, "w": chica.width, "hh": chica.height})
        mapa[n] = nombre
dims = {g["nombre"]: [g["w"], g["hh"]] for g in grupos}
json.dump({"pregunta_figura": {str(k): v for k, v in mapa.items()}, "dims": dims}, open(f"{out}/_mapa.json", "w"), indent=0)
tot = sum(os.path.getsize(f"{out}/{g['nombre']}") for g in grupos)
print(len(ids), "preguntas,", len(grupos), "figuras distintas,", round(tot / 1024), "KB en total")

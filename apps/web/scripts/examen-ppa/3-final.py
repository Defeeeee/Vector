import json, re, sys
b = json.load(open(sys.argv[1]))
A,M,I,R,G,T,P,N = "Aerodinámica","Grupo motopropulsor","Instrumentos de vuelo","Reglamentación","Generalidades","Meteorología","Performance","Navegación"
manual = {1:A,2:R,3:R,5:M,6:M,7:M,8:M,9:M,10:M,11:M,12:M,13:M,14:M,15:M,16:M,18:M,20:M,21:M,22:M,23:M,24:M,25:M,26:M,27:M,28:M,29:M,
 36:N,38:P,42:R,52:A,57:I,58:T,101:T,135:R,136:R,137:R,138:R,139:R,140:R,141:R,142:R,143:R,144:N,148:G,158:T,159:G,164:G,170:G,
 200:A,201:A,209:T,215:N,216:N,221:N,229:T,253:G,254:G,255:G,256:G,259:A,267:I,270:T,292:R,293:R,294:I,295:I,296:T,297:G,298:G,299:G,300:G,
 301:A,302:T,303:T,304:T,305:M,306:A,308:M,309:A,310:A,311:A,312:G,313:G,314:P,315:P,316:P,317:T,319:N,320:I,321:G,322:A,323:A,324:A,325:G,326:P,
 328:I,329:I,330:I,331:G,332:T,333:G,334:G,335:T,336:M,337:N,338:N,339:R,340:G,341:G,342:I,343:G,344:G,345:M,347:P,348:P,349:P,350:G,351:R,353:T,
 356:A,357:M,358:M,360:M,361:G,362:P,363:G,364:R,365:R,366:T,367:G,368:M,369:T,370:I,371:M,372:G,375:P,376:G,377:R,378:G,379:G,380:G,381:I,382:I,383:R}
deANAC = {"Aerodinámica Básica":A,"Grupo Motopropulsor":M,"Instrumentos De Vuelo":I,"Regulaciones":R,"Generalidades":G,"Meteorología":T,"Performance":P,"Navegación":N}
def limpiar(t):
    t = re.sub(r"^\s*24-10-13\s*-?\s*", "", t)                        # fecha de carga
    t = re.sub(r"^\s*(\d{1,3}\s*[\.\-]+\s*)", "", t)                 # "001- ", "10.- "
    t = re.sub(r"^\s*(PPA\s*:?\s*PERFM|PPAMOT|PPAPERMF|PPANAV|PPA|NAV|CRM|Instru\.?\s*[Vv])\s*[:\.]?\s*\d?\.?\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if t.isupper(): t = t.capitalize()
    return t
def sin_pie(t):
    # El pie de la última página del PDF ("Powered by TCExam … TCPDF …") se pega al último texto.
    return re.sub(r"\s*Powered by TC.*$", "", t)
def opcion(t):
    t = re.sub(r"^\s*([a-cA-C][\)\.]|[a-c]\))\s*", "", t).strip().lstrip("-– ").strip()
    return re.sub(r"\s+", " ", t)
# Las figuras recortadas del mismo banco (figuras.py y figuras-final.py): pregunta -> archivo.
mapa = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {"pregunta_figura": {}, "dims": {}}
salida, figuras = [], 0
for q in b:
    figura = mapa["pregunta_figura"].get(str(q["n"]))
    if re.search(r"figura|fig\.|ilustraci|gr[aá]fic|imagen", q["texto"], re.I) and not figura and q["n"] not in (167, 253):
        figuras += 1; continue
    materia = manual.get(q["n"]) or deANAC.get(q["materia"])
    assert materia, q["n"]
    ops = [sin_pie(opcion(o["texto"])) for o in q["opciones"]]
    assert all(ops), q["n"]
    item = {"id": q["n"], "materia": materia, "pregunta": limpiar(q["texto"]), "opciones": ops, "correcta": [o["correcta"] for o in q["opciones"]].index(True)}
    if figura: item["figura"] = {"src": figura, "ancho": mapa["dims"][figura][0], "alto": mapa["dims"][figura][1]}
    salida.append(item)
print("sin figura disponible (afuera):", figuras, "| quedan:", len(salida), "| con figura:", sum(1 for x in salida if "figura" in x))
from collections import Counter; print(Counter(q["materia"] for q in salida))
json.dump(salida, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
for q in salida[:3] + [x for x in salida if x["id"] in (5,135,297,356,364)]: print(q["id"], q["materia"], "|", q["pregunta"][:80], "|", q["opciones"])

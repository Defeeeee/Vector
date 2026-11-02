import sys, pypdf
r = pypdf.PdfReader(sys.argv[1])
out = []
for i, p in enumerate(r.pages):
    out.append(f"\n=== PAGINA {i+1} ===\n" + (p.extract_text() or ""))
open(sys.argv[2], "w").write("".join(out))
print(sys.argv[1].split("/")[-1], len(r.pages), "páginas", sum(len(x) for x in out), "caracteres")

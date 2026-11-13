"""
Las firmas de los certificantes y el dorso de las hojas (migración 047): lo que valida el modelo.

    python test_firmas_certificantes.py
"""
import base64
import sys
from uuid import uuid4

from pydantic import ValidationError

from src.models.firmas import MAX_FIRMA_CHARS, DorsoHojaIn, FirmaCertificanteIn

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


def falla(fn):
    try:
        fn()
    except ValidationError:
        return True
    return False


CABECERA = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
PNG = "data:image/png;base64," + base64.b64encode(CABECERA).decode()
JPG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff").decode()
FALSO = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode()

f = FirmaCertificanteIn(nombre="  juan   pérez ", licencia=" ina 12345 ", autoridad_id=7, png=PNG)
check("la aclaración va en mayúsculas y sin espacios de más", f.nombre == "JUAN PÉREZ")
check("la licencia también", f.licencia == "INA 12345")
check("sin licencia queda en None", FirmaCertificanteIn(nombre="A", licencia="  ", png=PNG).licencia is None)
check("una firma sin nombre no pasa", falla(lambda: FirmaCertificanteIn(nombre="   ", png=PNG)))
check("un JPG no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png=JPG)))
check("un PNG que no lo es (cabecera) no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png=FALSO)))
check("base64 roto no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png="data:image/png;base64,@@@")))
check(
    "pasar el tope no pasa",
    falla(lambda: FirmaCertificanteIn(nombre="A", png="data:image/png;base64," + "A" * MAX_FIRMA_CHARS)),
)

lb = uuid4()
d = DorsoHojaIn(logbook_id=lb, hoja=3, png=PNG, aclaracion=" pedro  gómez ", fecha="2026-11-02")
check("el dorso normaliza la aclaración", d.aclaracion == "PEDRO GÓMEZ")
check("el dorso toma la fecha", d.fecha.isoformat() == "2026-11-02")
check("el dorso admite hasta MAX_DORSO_CHARS", DorsoHojaIn(logbook_id=lb, hoja=1, png=PNG).png == PNG)
check("el dorso puede ir sin imagen", DorsoHojaIn(logbook_id=lb, hoja=1, aclaracion="X").png is None)
check("la hoja 0 no existe", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=0)))
check("un dorso con JPG no pasa", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, png=JPG)))

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")

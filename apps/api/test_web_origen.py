"""web_de_origen: con dos dominios vivos, Google y recuperar contraseña vuelven al que usó el piloto."""
import os

os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "dummy-key")

from types import SimpleNamespace

from src.config import settings
from src.controllers.auth import web_de_origen


def pedido(origen):
    return SimpleNamespace(headers={"origin": origen} if origen is not None else {})


def test_web_de_origen():
    d = "https://vectoraero.ar"
    assert web_de_origen(pedido("https://vector.fdiaznem.com.ar"), d) == "https://vector.fdiaznem.com.ar"
    assert web_de_origen(pedido("https://vectoraero.ar"), d) == "https://vectoraero.ar"
    assert web_de_origen(pedido("https://www.vectoraero.ar/"), d) == "https://www.vectoraero.ar"
    # Un origen ajeno o ninguno: el de por defecto, nunca el pedido.
    assert web_de_origen(pedido("https://evil.example"), d) == d
    assert web_de_origen(pedido(None), d + "/") == d


def test_cors_y_web_por_defecto():
    for o in ("https://vectoraero.ar", "https://www.vectoraero.ar", "https://api.vectoraero.ar",
              "https://auth.vectoraero.ar", "https://vector.fdiaznem.com.ar"):
        assert o in settings.allowed_origins, o
    assert settings.web_url == "https://vectoraero.ar"


if __name__ == "__main__":
    test_web_de_origen()
    test_cors_y_web_por_defecto()
    print("ok")

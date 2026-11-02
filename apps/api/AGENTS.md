# AGENTS.md — apps/api

La API de Vector: Python + Litestar + Supabase. Lo del producto entero (invariantes,
navegación, deploy, la bitácora) está en el `AGENTS.md` de la raíz; acá va sólo lo que
hace falta para tocar esta carpeta.

> Hasta el 2026-11-02 esto era el repo `FlightLog-BackEnd`, y este archivo su bitácora
> completa. Las entradas están, sin editar, en `docs/bitacora/api/` (una por mes); las
> nuevas van en la bitácora común, `docs/bitacora/AAAA-MM.md`.

## Qué hay acá

| Dónde | Qué |
|---|---|
| `src/controllers/` | Las rutas, por recurso. Todo cuelga de `/api`. |
| `src/models/` | Los modelos Pydantic. |
| `src/services/` | La lógica: auditoría, avisos, mails, CAD, ADS-B. Lo puro se testea offline. |
| `src/auth/` | El guard que verifica el JWT de Supabase y arma el cliente con el RLS del piloto. |
| `src/config.py` | Las variables, de `.env` (pydantic-settings). |
| `migrations/` | El SQL, numerado. **Todo cambio de modelo de datos se hace acá**, con su migración. |
| `run.py` | El server (uvicorn, puerto 7477). Es el proceso `flightlog-7477` de PM2. |
| `grabador_adsb.py` | El grabador ADS-B: su propio proceso de PM2, `grabador-adsb`. |
| `limpiar_storage.py` | Limpieza manual del storage de Supabase. |
| `test_*.py` | Los tests: scripts que salen con 1 si algo falla, sin pytest. |

## Comandos

```bash
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run.py                       # http://localhost:7477/api — ojo: lee el .env, que apunta a producción
.venv/bin/python test_audit_engine.py         # cada test_*.py se corre así (la lista está en api-ci.yml)
.venv/bin/ruff check src/ --select=E9,F
```

- **Sólo el backend habla con Supabase** (el `.env` de esta carpeta). Es la base de
  producción también en desarrollo.
- El CI no tiene `.env`: un módulo que importa `src.config` al cargarse rompe los tests
  que no le pasan variables de mentira (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`).
- **`test_registration.py` no es un test**: pega contra un server local y crea un
  usuario de verdad en Supabase. No va en el CI.
- En el VPS el virtualenv es `venv`; en otras máquinas, `.venv`. El deploy detecta cuál.
- Las cartas Jeppesen (contenido pago, invariante 11) viven en `Charts/`, fuera de git:
  `JEPPESEN_CHARTS_DIR` del `.env` apunta ahí.

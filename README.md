# Vector

Bitácora digital para pilotos argentinos: el libro de vuelo en formato ANAC, el desglose
de horas, los vencimientos y "¿puedo volar hoy?" según la RAAC 61. Además, el plan de
vuelo para EANA, el paso de los vuelos al CAD de ANAC y una red de pilotos.

En producción: [vector.fdiaznem.com.ar](https://vector.fdiaznem.com.ar).

## Estructura

```text
apps/
├── web/         Next.js 16 · React 19 · Tailwind v4   → vector.fdiaznem.com.ar
├── api/         Python · Litestar · Supabase           → api.flightlog.fdiaznem.com.ar
└── extension/   La extensión "Vector → CAD" (la empaqueta el build de la web)
docs/
├── bitacora/    Qué se cambió, cuándo y por qué (la de la API vieja, en bitacora/api/)
├── normativa/   Las secciones de la RAAC y del AIP que cita el código
└── brief/       Los planes, tal como se escribieron
```

## Desarrollo

```bash
cd apps/web && npm ci && npm run dev          # http://localhost:3000
```

```bash
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python run.py                       # http://localhost:7477/api
```

Las dos leen su `.env` (`apps/web/.env.local`, `apps/api/.env`), y **la API apunta a la
base de producción**: para probar pantallas sin riesgo, ver "Cómo verificar lo que está
detrás de login" en [`AGENTS.md`](AGENTS.md).

## Deploy

Pusheando a `main`: cada app tiene su CI y su deploy, que corren sólo si el push toca su
carpeta y despliegan sólo si el CI pasa. El detalle está en [`AGENTS.md`](AGENTS.md#deploy).

## Para agentes

Antes de tocar nada, [`AGENTS.md`](AGENTS.md): lo vigente, los invariantes y cómo se
lleva la bitácora. Para la API, además, [`apps/api/AGENTS.md`](apps/api/AGENTS.md).

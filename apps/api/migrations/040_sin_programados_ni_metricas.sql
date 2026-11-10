-- 040 — Se sacan los vuelos programados y las métricas propias (2026-11-10).
--
-- La 3.12.0 sacó sus pantallas (medido el 2026-11-05: 0 filas en las dos tablas); la 3.15.0 saca
-- la API, el barrido del briefing del vuelo programado y, acá, las tablas. Federico, 2026-11-10:
-- "se pueden sacar" → "5 tmb". Antes de aplicar se volvió a medir: 0 filas en las dos, ninguna
-- clave foránea entrante. Las migraciones 004 y 009 quedan como historia.

drop trigger if exists planned_flights_touch_trigger on public.planned_flights;
drop function if exists public.planned_flights_touch();
drop table if exists public.planned_flights;
drop table if exists public.custom_stats;

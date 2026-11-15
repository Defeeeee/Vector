-- 055 — Varios seguimientos a la vez, y compartir un vuelo sin plan (2026-11-15).
--
-- Aditiva en datos (una columna con default) y **afloja** un índice: no borra ni reescribe filas.
--
-- Hasta la 054 un piloto tenía a lo sumo un seguimiento sin terminar (índice único
-- `seguimientos_en_vivo_uno_activo_idx`, migración 041). Dos pedidos de Federico lo vuelven
-- incómodo: compartir con la familia un vuelo que todavía no tiene plan (origen, destino y
-- horario, sin ruta), y tener más de uno a la vez (una salida a la mañana y otra a la tarde, o
-- el link de un plan y el del Mapa en vuelo).
--
-- - Se borra el índice único y se crea uno común, para que "los activos de un piloto" siga siendo
--   una consulta barata. **El tope (5 por cuenta) lo pone el código**, no la base: así se cambia
--   sin migración y el mensaje al piloto es claro.
-- - `ruta_orientativa`: el piloto no cargó la ruta; el link sólo tiene origen, destino y horario, y
--   la línea del mapa es directa. La página pública lo avisa. Es público (sale en `vista_publica`)
--   porque cambia lo que se le dice a la familia: no oculta nada.

drop index if exists public.seguimientos_en_vivo_uno_activo_idx;

create index if not exists seguimientos_en_vivo_activos_idx
  on public.seguimientos_en_vivo (user_id) where terminado_at is null;

alter table public.seguimientos_en_vivo
  add column if not exists ruta_orientativa boolean not null default false;

comment on column public.seguimientos_en_vivo.ruta_orientativa is
  'El piloto no cargó una ruta: el link tiene sólo origen, destino y horarios, y la línea del mapa entre ellos es directa y orientativa.';

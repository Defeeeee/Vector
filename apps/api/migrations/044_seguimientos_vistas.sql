-- 044 — Quién está mirando el link de "Compartir mi vuelo" (2026-11-11).
--
-- Aditiva: sólo columnas nuevas con default. La 041 y la 042 quedan como están.
--
-- El piloto, en la pantalla de vuelo, ve "2 te están mirando" o "te vieron hace 3 min". Para eso
-- la página pública manda un identificador al azar de su navegador (16 caracteres, en el
-- `localStorage` de quien mira) y el backend anota **sólo ese id y la hora del servidor**. No se
-- guarda la IP, ni el user agent, ni nada que identifique a nadie: el id no dice quién es, y se
-- borra con el seguimiento (a los 30 días, junto con la fila).
--
-- - `vistas`: `{id: epoch_s}` con los 20 ids más recientes (el tope lo pone el backend). Alcanza
--   para "cuántos miran ahora" (ventana de 45 s). Una consulta del mismo id se anota como mucho
--   cada 30 s, así que son pocas escrituras por visitante.
-- - `vistos_total`: cuántos ids distintos vieron el link desde que empezó. Es un contador porque
--   `vistas` está acotado; un id que vuelve después de haber salido de los 20 más recientes
--   cuenta de nuevo (se acepta: es una cifra para el piloto, no una auditoría).
-- - `ultima_vista_at`: la última vez que alguien lo abrió.
--
-- Nada de esto sale en `vista_publica`: quien mira no ve a los otros (lo fija el test).

alter table public.seguimientos_en_vivo
  add column if not exists vistas          jsonb       not null default '{}'::jsonb,
  add column if not exists vistos_total    integer     not null default 0 check (vistos_total >= 0),
  add column if not exists ultima_vista_at timestamptz;

comment on column public.seguimientos_en_vivo.vistas is
  'Ids al azar de los navegadores que abrieron el link ({id: epoch_s}, los 20 más recientes). Sin IP ni user agent. Sólo lo lee el piloto, como conteo.';

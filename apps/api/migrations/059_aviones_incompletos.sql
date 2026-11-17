-- 059 — Aviones que se agregan solos desde el libro importado, con los datos a completar.
--
-- Al importar el libro (PDF o fotos), las matrículas que no están en el Hangar se crean con
-- lo que se lee —matrícula y modelo— y quedan marcadas como incompletas: el piloto completa
-- tipo OACI, categoría y potencia desde el Hangar y la marca se apaga sola (el backend la
-- pone en true al guardar con tipo OACI, modelo y categoría).
--
-- Aditiva y con default constante (Postgres no reescribe la tabla): los aviones que ya
-- existen quedan en `true`, o sea completos, como estaban.

alter table public.aircraft
  add column if not exists datos_completos boolean not null default true;

-- ---------------------------------------------------------------------------
-- Importaciones del libro (2026-11-17): leer un libro largo lleva minutos, así que es un
-- trabajo en segundo plano con estado. El piloto sube el PDF o las fotos, el server las lee de
-- a poco (el archivo vive en el VPS, fuera de la base y del repo, y se borra al terminar) y le
-- manda un mail cuando está listo para revisar. NADA se importa sin que el piloto lo revise.
--
-- `resultado` trae los vuelos leídos y los aviones a crear; `lotes_fallidos`, los rangos de
-- hojas que no se pudieron leer ([{"desde":9,"hasta":12}]). `latido_at` es la última vez que el
-- proceso avanzó: un barrido retoma los que quedaron 'procesando' sin latido (un deploy reinicia
-- el server). `aviso_enviado_at` se reserva con un update condicional: un mail por trabajo.
--
-- RLS: el piloto lee las suyas y sólo puede cambiar `estado` (descartar o dar por importada);
-- el progreso y el resultado los escribe el server con el service role.
-- ---------------------------------------------------------------------------

create table if not exists public.importaciones_libro (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  estado            text not null default 'subido'
                      check (estado in ('subido','procesando','listo','error','importado','descartado')),
  paginas_total     integer not null default 0 check (paginas_total between 0 and 1000),
  paginas_leidas    integer not null default 0 check (paginas_leidas >= 0),
  lotes_fallidos    jsonb not null default '[]'::jsonb,
  resultado         jsonb,
  error             text check (error is null or length(error) <= 500),
  latido_at         timestamptz not null default now(),
  creado_at         timestamptz not null default now(),
  terminado_at      timestamptz,
  aviso_enviado_at  timestamptz
);

create index if not exists importaciones_libro_user_idx on public.importaciones_libro (user_id, creado_at desc);
create index if not exists importaciones_libro_estado_idx on public.importaciones_libro (estado, latido_at);

alter table public.importaciones_libro enable row level security;

drop policy if exists "importaciones_select_propias" on public.importaciones_libro;
drop policy if exists "importaciones_update_propias" on public.importaciones_libro;
create policy "importaciones_select_propias" on public.importaciones_libro
  for select using (auth.uid() = user_id);
create policy "importaciones_update_propias" on public.importaciones_libro
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.importaciones_libro from anon;
revoke insert, delete, update on table public.importaciones_libro from authenticated;
grant update (estado) on table public.importaciones_libro to authenticated;

comment on table public.importaciones_libro is
  'Lectura en segundo plano de un libro de vuelo subido (PDF o fotos). El archivo vive en el VPS y se borra al terminar.';

-- El mail de "tu libro está listo" se mide como los otros (panel de administración).
alter table public.mail_envios drop constraint if exists mail_envios_tipo_check;
alter table public.mail_envios add constraint mail_envios_tipo_check
  check (tipo in ('primer-vuelo', 'resumen-mensual', 'briefing', 'novedades', 'plan-por-registrar', 'importacion-libro'));

-- Verificación:
-- select count(*) from pg_policies where tablename = 'importaciones_libro';   -- esperado: 2
-- select column_name, column_default from information_schema.columns
--   where table_name = 'aircraft' and column_name = 'datos_completos';   -- default true
-- select count(*) from public.aircraft where datos_completos = false;     -- 0 al aplicarla

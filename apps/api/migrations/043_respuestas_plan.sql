-- 043 — Las respuestas de la oficina ARO/AIS a un plan de vuelo (2026-11-11).
--
-- Los planes salen con un `reply_to` que, además del piloto, lleva una dirección
-- `plan-<id>-<firma>@respuestas.vector.fdiaznem.com.ar`. Resend recibe lo que llega ahí y
-- avisa a la web (`/api/mail/entrante`), que clasifica la respuesta y se la pasa al
-- backend: se guarda acá y el piloto recibe un aviso push. La respuesta de la oficina le
-- sigue llegando al piloto por mail; esto es sólo para enterarse.
--
-- 1. `planes_respuestas`: una fila por mail recibido. `email_id` (el de Resend) es único,
--    para que un reintento del webhook no duplique ni vuelva a avisar. `texto` es lo que
--    escribió la oficina sin lo citado, cortado a 4000 caracteres.
--    Lo escribe el backend con el cliente de servicio; el piloto sólo puede leer y borrar
--    lo suyo (RLS del dueño).
--
-- 2. `planes_de_vuelo.respuesta_estado` / `respuesta_at`: la clasificación de la última
--    respuesta de la oficina, para la lista de planes sin traer la tabla de respuestas.
--
-- Se borra con el plan (`on delete cascade`).

create table if not exists public.planes_respuestas (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.planes_de_vuelo(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  email_id      text not null unique,
  de            text not null,
  asunto        text not null default '',
  texto         text not null default '' check (length(texto) <= 4000),
  clasificacion text not null check (clasificacion in ('recibido', 'aceptado', 'rechazado', 'corregir', 'otra')),
  -- Si la mandó la oficina del plan (cuenta para el estado y el aviso) o un tercero.
  de_oficina    boolean not null default true,
  recibido_at   timestamptz not null default now()
);

create index if not exists planes_respuestas_plan_idx on public.planes_respuestas (plan_id, recibido_at desc);

alter table public.planes_respuestas enable row level security;

create policy "planes_respuestas_select_propias" on public.planes_respuestas
  for select using (auth.uid() = user_id);
create policy "planes_respuestas_delete_propias" on public.planes_respuestas
  for delete using (auth.uid() = user_id);

revoke all on table public.planes_respuestas from anon;

comment on table public.planes_respuestas is
  'Respuestas por mail de la oficina ARO/AIS a un plan de vuelo. Las escribe el backend (webhook de Resend); el piloto lee y borra las suyas.';

alter table public.planes_de_vuelo
  add column if not exists respuesta_estado text
    check (respuesta_estado in ('recibido', 'aceptado', 'rechazado', 'corregir', 'otra')),
  add column if not exists respuesta_at timestamptz;

comment on column public.planes_de_vuelo.respuesta_estado is 'Clasificación de la última respuesta de la oficina. NULL = no contestó.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select polname from pg_policy where polrelid = 'public.planes_respuestas'::regclass order by 1;
--   -- esperado: planes_respuestas_delete_propias, planes_respuestas_select_propias
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'planes_de_vuelo' and column_name like 'respuesta_%';

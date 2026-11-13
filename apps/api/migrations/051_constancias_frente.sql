-- 051 — Constancias en el frente de la hoja, una foto del sello real por vuelo (2026-11-13).
--
-- La hoja del examen de PPA de Federico (03/11/25, EXA, General Rodríguez) tiene, sobre las
-- columnas vacías de la discriminación, el sello de ANAC ("rindió los exámenes correspondientes
-- a la licencia… Resultado: aprobado") firmado por el inspector. "Sí, armala": el PDF del libro
-- estampa esa imagen en el frente de la hoja de ese vuelo, donde está en el papel.
--
-- **Es la foto del sello real, limpia en el navegador.** Vector nunca dibuja un sello de una
-- autoridad a partir de datos: sería fabricar un documento oficial.
--
-- `vuelo_constancias`: una fila por imagen (hasta 2 por vuelo, lo impone el backend), aparte de
-- `flights` para que la lista de vuelos no cargue imágenes. Se borra con el vuelo.
--
-- Aditiva: tabla nueva. Se puede volver a correr. Ninguna agregación la lee.

create table if not exists public.vuelo_constancias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  flight_id   uuid not null references public.flights(id) on delete cascade,
  png         text not null check (png like 'data:image/png;base64,%' and length(png) <= 450000),
  orden       smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists vuelo_constancias_vuelo_idx on public.vuelo_constancias (flight_id, orden);
create index if not exists vuelo_constancias_user_idx on public.vuelo_constancias (user_id);

alter table public.vuelo_constancias enable row level security;

drop policy if exists "vuelo_constancias_select_propias" on public.vuelo_constancias;
drop policy if exists "vuelo_constancias_insert_propias" on public.vuelo_constancias;
drop policy if exists "vuelo_constancias_update_propias" on public.vuelo_constancias;
drop policy if exists "vuelo_constancias_delete_propias" on public.vuelo_constancias;
create policy "vuelo_constancias_select_propias" on public.vuelo_constancias
  for select using (auth.uid() = user_id);
create policy "vuelo_constancias_insert_propias" on public.vuelo_constancias
  for insert with check (auth.uid() = user_id);
create policy "vuelo_constancias_update_propias" on public.vuelo_constancias
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vuelo_constancias_delete_propias" on public.vuelo_constancias
  for delete using (auth.uid() = user_id);

revoke all on table public.vuelo_constancias from anon;

comment on table public.vuelo_constancias is
  'Foto del sello real (p. ej. el de ANAC en un examen) que va en el frente de la hoja de ese vuelo. Sólo sirve para el PDF del libro del piloto.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select count(*) from pg_policies where tablename = 'vuelo_constancias';   -- esperado: 4
-- select relrowsecurity from pg_class where oid = 'public.vuelo_constancias'::regclass;  -- true

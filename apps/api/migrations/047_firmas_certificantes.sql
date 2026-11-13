-- 047 — Las firmas de los certificantes y el dorso de cada hoja del libro (2026-11-13).
--
-- Federico: "poder sacarle foto a la firma del certificante para que quede guardada y que se
-- plasme en la sección de certificaciones de cada uno de los vuelos [...]. Además las firmas
-- también deben ir del lado de atrás de cada hoja del libro con la aclaración".
--
-- Dos tablas, las dos del piloto (RLS con las cuatro políticas explícitas, como la 024):
--
-- 1. `firmas_certificantes`: la firma de quien certifica sus vuelos (instructor, jefe de
--    instrucción), con su aclaración, su licencia y, si corresponde a una de las autoridades
--    del CAD, su id (`flights.cad_autoridad_id`, migración 032). Un PNG ya limpiado en el
--    navegador del piloto. **Sólo se usa para el PDF del libro de ese piloto**: no sale de su
--    cuenta. Quien la guarda declara que tiene la autorización del certificante.
-- 2. `libro_hojas_dorso`: lo que va en el dorso de una hoja del libro (la numeración es la
--    de `libro-anac.ts`): la firma, la aclaración y la fecha. Una por libro y hoja.
--
-- Ninguna agregación lee estas tablas. Los PNG van en la fila (data URL, con tope): son
-- decenas de KB, como `firmas_plan_vuelo`, y sólo hacen falta al armar el PDF.

create table if not exists public.firmas_certificantes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- La aclaración, en mayúsculas y sin espacios de más.
  nombre        text not null check (length(nombre) between 1 and 120),
  licencia      text check (licencia is null or length(licencia) <= 40),
  -- El id de la autoridad del CAD (`AUTORIDADES_CAD`), si es una de esas.
  autoridad_id  smallint,
  png           text not null check (png like 'data:image/png;base64,%' and length(png) <= 250000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists firmas_certificantes_user_nombre_idx
  on public.firmas_certificantes (user_id, nombre);

alter table public.firmas_certificantes enable row level security;

create policy "firmas_certificantes_select_propias" on public.firmas_certificantes
  for select using (auth.uid() = user_id);
create policy "firmas_certificantes_insert_propias" on public.firmas_certificantes
  for insert with check (auth.uid() = user_id);
create policy "firmas_certificantes_update_propias" on public.firmas_certificantes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "firmas_certificantes_delete_propias" on public.firmas_certificantes
  for delete using (auth.uid() = user_id);

create table if not exists public.libro_hojas_dorso (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  logbook_id  uuid not null references public.logbooks(id) on delete cascade,
  hoja        integer not null check (hoja >= 1),
  png         text check (png is null or (png like 'data:image/png;base64,%' and length(png) <= 450000)),
  aclaracion  text check (aclaracion is null or length(aclaracion) <= 160),
  fecha       date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (logbook_id, hoja)
);

create index if not exists libro_hojas_dorso_user_idx on public.libro_hojas_dorso (user_id);

alter table public.libro_hojas_dorso enable row level security;

create policy "libro_hojas_dorso_select_propias" on public.libro_hojas_dorso
  for select using (auth.uid() = user_id);
create policy "libro_hojas_dorso_insert_propias" on public.libro_hojas_dorso
  for insert with check (auth.uid() = user_id);
create policy "libro_hojas_dorso_update_propias" on public.libro_hojas_dorso
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "libro_hojas_dorso_delete_propias" on public.libro_hojas_dorso
  for delete using (auth.uid() = user_id);

create or replace function public.firmas_touch()
returns trigger
language plpgsql
set search_path to ''
as $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

drop trigger if exists firmas_certificantes_touch_trigger on public.firmas_certificantes;
create trigger firmas_certificantes_touch_trigger
  before update on public.firmas_certificantes
  for each row execute function public.firmas_touch();

drop trigger if exists libro_hojas_dorso_touch_trigger on public.libro_hojas_dorso;
create trigger libro_hojas_dorso_touch_trigger
  before update on public.libro_hojas_dorso
  for each row execute function public.firmas_touch();

revoke all on table public.firmas_certificantes from anon;
revoke all on table public.libro_hojas_dorso from anon;

comment on table public.firmas_certificantes is
  'Firmas de certificantes (PNG limpio) para el PDF del libro del piloto. No salen de su cuenta.';
comment on table public.libro_hojas_dorso is
  'El dorso de cada hoja del libro: firma, aclaración y fecha. Una por libro y hoja.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select tablename, count(*) from pg_policies
--   where tablename in ('firmas_certificantes','libro_hojas_dorso') group by 1;
--   -- esperado: 4 y 4
-- select relname, relrowsecurity from pg_class
--   where oid in ('public.firmas_certificantes'::regclass, 'public.libro_hojas_dorso'::regclass);
--   -- esperado: las dos en true
-- select indexname from pg_indexes where tablename = 'firmas_certificantes';
--   -- esperado: incluye firmas_certificantes_user_nombre_idx

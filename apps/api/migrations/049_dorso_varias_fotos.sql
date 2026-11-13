-- 049 — Varias fotos por dorso y varios sellos por persona, cada sello con su cargo (2026-11-13).
--
-- Federico: "los dorsos sólo dejan poner una sola foto, arreglá eso" y "Gustavo no me deja
-- agregarlo de nuevo ni ponerle dos dorsos posibles; uno como Jefe y uno como IV": el título
-- del CAD cambia —Macedo tiene 45 vuelos como JEFE DE INSTRUCTORES (cad_autoridad_id = 6) y
-- 1 como INSTRUCTOR DE VUELO (5)—. Una persona con varios sellos, no dos personas: duplicarla
-- partiría sus vuelos y rompería las sugerencias por nombre.
--
-- Aditiva: tablas y columnas nuevas. Lo viejo (`libro_hojas_dorso.png`,
-- `firmas_certificantes.png_sello`, `libro_hojas_dorso.certificante_ids`) NO se borra: queda
-- sin usar por compatibilidad con el backend anterior mientras se despliega, y se pasa a lo
-- nuevo acá mismo. Se puede volver a correr: no duplica.
--
-- 1. `libro_hojas_dorso_fotos`: las fotos de un dorso (una fila por foto), por libro y hoja.
--    Las toma el PDF a tamaño real. Hasta 12 por hoja (lo impone el backend).
-- 2. `certificante_sellos`: los sellos de una persona, cada uno con su etiqueta ("Jefe de
--    instructores"), su cargo del CAD (`autoridad_id`, de `AUTORIDADES_CAD`) y, si hace falta,
--    cómo va el nombre al CAD con ese cargo (`nombre_cad`, p. ej. con la licencia). Hasta 6
--    por persona (el backend). `firmas_certificantes.autoridad_id` queda como el cargo por
--    defecto de la persona; la firma sola de la celda (`png`) sigue siendo una por persona.
-- 3. `flights.certificante_sello_id`: con qué sello/cargo certificó ese vuelo.
-- 4. `libro_hojas_dorso.sello_ids`: los sellos que van en el dorso de esa hoja (hasta 12).
--
-- Ninguna agregación lee estas tablas ni columnas.

-- 1. Fotos del dorso ------------------------------------------------------------------

create table if not exists public.libro_hojas_dorso_fotos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  logbook_id  uuid not null references public.logbooks(id) on delete cascade,
  hoja        integer not null check (hoja >= 1),
  png         text not null check (png like 'data:image/png;base64,%' and length(png) <= 450000),
  orden       smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists libro_hojas_dorso_fotos_hoja_idx
  on public.libro_hojas_dorso_fotos (logbook_id, hoja);

alter table public.libro_hojas_dorso_fotos enable row level security;

drop policy if exists "libro_hojas_dorso_fotos_select_propias" on public.libro_hojas_dorso_fotos;
drop policy if exists "libro_hojas_dorso_fotos_insert_propias" on public.libro_hojas_dorso_fotos;
drop policy if exists "libro_hojas_dorso_fotos_update_propias" on public.libro_hojas_dorso_fotos;
drop policy if exists "libro_hojas_dorso_fotos_delete_propias" on public.libro_hojas_dorso_fotos;
create policy "libro_hojas_dorso_fotos_select_propias" on public.libro_hojas_dorso_fotos
  for select using (auth.uid() = user_id);
create policy "libro_hojas_dorso_fotos_insert_propias" on public.libro_hojas_dorso_fotos
  for insert with check (auth.uid() = user_id);
create policy "libro_hojas_dorso_fotos_update_propias" on public.libro_hojas_dorso_fotos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "libro_hojas_dorso_fotos_delete_propias" on public.libro_hojas_dorso_fotos
  for delete using (auth.uid() = user_id);

revoke all on table public.libro_hojas_dorso_fotos from anon;

-- Las fotos que ya había (una por hoja) pasan a ser la primera de su hoja.
insert into public.libro_hojas_dorso_fotos (user_id, logbook_id, hoja, png, orden, created_at)
select d.user_id, d.logbook_id, d.hoja, d.png, 0, d.created_at
  from public.libro_hojas_dorso d
 where d.png is not null
   and not exists (
     select 1 from public.libro_hojas_dorso_fotos f
      where f.logbook_id = d.logbook_id and f.hoja = d.hoja
   );

comment on table public.libro_hojas_dorso_fotos is
  'Las fotos del dorso de una hoja del libro (varias por hoja). Sólo sirven para el PDF del libro del piloto.';
comment on column public.libro_hojas_dorso.png is
  'En desuso desde la 049: las fotos viven en libro_hojas_dorso_fotos. Queda por compatibilidad.';

-- 2. Sellos de cada persona -----------------------------------------------------------

create table if not exists public.certificante_sellos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  certificante_id uuid not null references public.firmas_certificantes(id) on delete cascade,
  etiqueta        text not null check (length(etiqueta) between 1 and 60),
  -- El cargo del CAD de este sello (`AUTORIDADES_CAD`); null = sin cargo.
  autoridad_id    smallint,
  -- Cómo va el nombre al CAD con este cargo; null = el de la persona.
  nombre_cad      text check (nombre_cad is null or length(nombre_cad) <= 160),
  png             text not null check (png like 'data:image/png;base64,%' and length(png) <= 450000),
  orden           smallint not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists certificante_sellos_persona_idx
  on public.certificante_sellos (certificante_id, orden);
create index if not exists certificante_sellos_user_idx
  on public.certificante_sellos (user_id);

alter table public.certificante_sellos enable row level security;

drop policy if exists "certificante_sellos_select_propias" on public.certificante_sellos;
drop policy if exists "certificante_sellos_insert_propias" on public.certificante_sellos;
drop policy if exists "certificante_sellos_update_propias" on public.certificante_sellos;
drop policy if exists "certificante_sellos_delete_propias" on public.certificante_sellos;
create policy "certificante_sellos_select_propias" on public.certificante_sellos
  for select using (auth.uid() = user_id);
create policy "certificante_sellos_insert_propias" on public.certificante_sellos
  for insert with check (auth.uid() = user_id);
create policy "certificante_sellos_update_propias" on public.certificante_sellos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "certificante_sellos_delete_propias" on public.certificante_sellos
  for delete using (auth.uid() = user_id);

revoke all on table public.certificante_sellos from anon;

-- El `png_sello` que ya había es el primer sello de su persona, con el cargo por defecto de ella.
insert into public.certificante_sellos (user_id, certificante_id, etiqueta, autoridad_id, png, orden)
select c.user_id, c.id, 'Con sello', c.autoridad_id, c.png_sello, 0
  from public.firmas_certificantes c
 where c.png_sello is not null
   and not exists (select 1 from public.certificante_sellos s where s.certificante_id = c.id);

comment on table public.certificante_sellos is
  'Los sellos de una persona certificante (uno por cargo del CAD). Sólo sirven para el PDF del libro del piloto.';
comment on column public.firmas_certificantes.png_sello is
  'En desuso desde la 049: los sellos viven en certificante_sellos. Queda por compatibilidad.';

-- 3. Con qué sello certificó cada vuelo -----------------------------------------------

alter table public.flights
  add column if not exists certificante_sello_id uuid references public.certificante_sellos(id) on delete set null;

create index if not exists flights_certificante_sello_idx
  on public.flights (certificante_sello_id) where certificante_sello_id is not null;

comment on column public.flights.certificante_sello_id is
  'Con qué sello/cargo de la persona certificó el vuelo (certificante_sellos). Sólo sirve para el PDF del libro.';

-- 4. Los sellos de cada dorso ---------------------------------------------------------

alter table public.libro_hojas_dorso
  add column if not exists sello_ids uuid[] not null default '{}';

alter table public.libro_hojas_dorso drop constraint if exists libro_hojas_dorso_sellos_largo;
alter table public.libro_hojas_dorso
  add constraint libro_hojas_dorso_sellos_largo check (cardinality(sello_ids) <= 12);

-- Lo que estaba en `certificante_ids` (personas) pasa a ser el primer sello de cada una,
-- en el mismo orden. Sólo a los dorsos que todavía no tienen `sello_ids`.
update public.libro_hojas_dorso d
   set sello_ids = coalesce((
         select array_agg(s.id order by p.ord)
           from unnest(d.certificante_ids) with ordinality as p(cid, ord)
           join lateral (
             select id from public.certificante_sellos
              where certificante_id = p.cid
              order by orden, created_at
              limit 1
           ) s on true
       ), '{}')
 where cardinality(d.certificante_ids) > 0
   and cardinality(d.sello_ids) = 0;

comment on column public.libro_hojas_dorso.sello_ids is
  'Los sellos (certificante_sellos) que van en el dorso de la hoja, además de sus fotos.';
comment on column public.libro_hojas_dorso.certificante_ids is
  'En desuso desde la 049: ahora son sello_ids. Queda por compatibilidad.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select tablename, count(*) from pg_policies
--   where tablename in ('libro_hojas_dorso_fotos','certificante_sellos') group by 1;
--   -- esperado: 4 y 4
-- select relname, relrowsecurity from pg_class
--   where oid in ('public.libro_hojas_dorso_fotos'::regclass, 'public.certificante_sellos'::regclass);
--   -- esperado: las dos en true
-- select (select count(*) from public.libro_hojas_dorso where png is not null) as dorsos_con_png,
--        (select count(*) from public.libro_hojas_dorso_fotos) as fotos;
--   -- esperado: fotos >= dorsos_con_png (al aplicarla, iguales)
-- select (select count(*) from public.firmas_certificantes where png_sello is not null) as con_sello_viejo,
--        (select count(*) from public.certificante_sellos) as sellos;
--   -- esperado: sellos >= con_sello_viejo (al aplicarla, iguales)
-- select count(*) from public.libro_hojas_dorso
--   where cardinality(certificante_ids) > 0 and cardinality(sello_ids) = 0;
--   -- esperado: 0, salvo dorsos que sólo elegían personas sin sello (no había nada que pasar)
-- select column_name from information_schema.columns
--   where table_schema = 'public' and column_name in ('certificante_sello_id','sello_ids')
--   order by 1;
--   -- esperado: 2 filas

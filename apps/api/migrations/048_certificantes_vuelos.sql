-- 048 — Asociar a cada vuelo quién lo certificó, y que su firma se use sola o no (2026-11-13).
--
-- Federico: "poder asociar la firma a cada uno que certificó mis vuelos, para que se auto
-- utilicen o no". Con los datos reales no alcanza buscar la firma por el nombre del CAD
-- (`flights.cad_autoridad_nombre`): un mismo instructor aparece con dos nombres, a otro le
-- agregaron el número de licencia, y 12 vuelos no tienen certificante cargado aunque en el
-- papel los firmó alguien. Ahora el vuelo apunta a la persona.
--
-- Aditiva: sólo columnas nuevas, con default o nulas. Nada se borra ni se reescribe.
--
-- 1. `firmas_certificantes`:
--    - `alias`: otros nombres con los que aparece en los vuelos (normalizados: mayúsculas,
--      sin acentos ni puntuación). Sirven para sugerir y para la búsqueda de respaldo del PDF.
--    - `png_sello`: la firma con sello o aclaración, para el dorso de las hojas (mismo
--      formato que `libro_hojas_dorso.png`, mismo tope).
--    - `automatica`: si su firma se pone sola en la celda del PDF.
-- 2. `flights`:
--    - `certificante_id`: la persona que lo certificó (el RLS de `flights` ya es del dueño;
--      el backend sólo deja asignar un certificante del mismo usuario).
--    - `certificante_firma`: la anulación por vuelo. null = lo que diga la persona;
--      'si' = firma aunque la persona no sea automática; 'no' = este vuelo sin firma.
-- 3. `libro_hojas_dorso.certificante_ids`: las personas cuyas firmas con sello se acomodan
--    en el dorso de esa hoja, si no tiene foto propia.
--
-- Ninguna agregación lee estas columnas.

alter table public.firmas_certificantes
  add column if not exists alias text[] not null default '{}',
  add column if not exists png_sello text,
  add column if not exists automatica boolean not null default true;

alter table public.firmas_certificantes drop constraint if exists firmas_certificantes_png_sello_check;
alter table public.firmas_certificantes
  add constraint firmas_certificantes_png_sello_check
  check (png_sello is null or (png_sello like 'data:image/png;base64,%' and length(png_sello) <= 450000));

alter table public.firmas_certificantes drop constraint if exists firmas_certificantes_alias_largo;
alter table public.firmas_certificantes
  add constraint firmas_certificantes_alias_largo check (cardinality(alias) <= 20);

alter table public.flights
  add column if not exists certificante_id uuid references public.firmas_certificantes(id) on delete set null,
  add column if not exists certificante_firma text;

alter table public.flights drop constraint if exists flights_certificante_firma_check;
alter table public.flights
  add constraint flights_certificante_firma_check check (certificante_firma is null or certificante_firma in ('si', 'no'));

create index if not exists flights_certificante_idx on public.flights (certificante_id) where certificante_id is not null;

alter table public.libro_hojas_dorso
  add column if not exists certificante_ids uuid[] not null default '{}';

alter table public.libro_hojas_dorso drop constraint if exists libro_hojas_dorso_certificantes_largo;
alter table public.libro_hojas_dorso
  add constraint libro_hojas_dorso_certificantes_largo check (cardinality(certificante_ids) <= 12);

comment on column public.firmas_certificantes.alias is
  'Otros nombres con los que aparece esta persona en cad_autoridad_nombre (normalizados).';
comment on column public.firmas_certificantes.png_sello is
  'Su firma con sello o aclaración, para el dorso de las hojas del libro.';
comment on column public.firmas_certificantes.automatica is
  'Si su firma se pone sola en la celda de certificaciones del PDF.';
comment on column public.flights.certificante_id is
  'Quién certificó el vuelo (firmas_certificantes). Sólo sirve para el PDF del libro.';
comment on column public.flights.certificante_firma is
  'Anulación por vuelo: null = lo que diga la persona, si = firma, no = sin firma.';
comment on column public.libro_hojas_dorso.certificante_ids is
  'Personas cuyas firmas con sello van en el dorso de la hoja si no tiene foto propia.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and (
--     (table_name = 'firmas_certificantes' and column_name in ('alias','png_sello','automatica'))
--  or (table_name = 'flights' and column_name in ('certificante_id','certificante_firma'))
--  or (table_name = 'libro_hojas_dorso' and column_name = 'certificante_ids'))
--   order by table_name, column_name;
--   -- esperado: 6 filas; alias y certificante_ids con default '{}', automatica default true
-- select count(*) from public.flights where certificante_id is not null;
--   -- esperado: 0 recién aplicada
-- select count(*) from public.firmas_certificantes where automatica is not true;
--   -- esperado: 0 (todas las que ya había quedan automáticas)
-- select indexname from pg_indexes where tablename = 'flights' and indexname = 'flights_certificante_idx';
--   -- esperado: 1 fila

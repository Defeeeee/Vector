-- 054 — Checklists del avión: la de la escuela o el avión, tal cual está en papel (2026-11-15).
--
-- El piloto carga la checklist de su avión (secciones, pasos "Etiqueta: valor", sub-pasos, notas)
-- y la usa tildando ítem por ítem en tierra y en vuelo. **Vector no inventa ni completa
-- procedimientos**: no hay checklist "de fábrica", sólo lo que cargó el piloto.
--
-- Se guarda **el texto** (un formato simple: `# Sección`, `- paso`, `> nota`, sub-pasos con
-- sangría), no JSON: es lo que el piloto edita y lo que se muestra. Los topes (80 letras el
-- nombre, 40.000 el texto) los repite el backend, que además valida la forma.
--
-- `aircraft.checklist_id`: la checklist asignada a cada avión. Una checklist puede servir a varios
-- aviones (los Tecnam Astore de una escuela comparten la general); si se borra, el avión queda
-- sin checklist (`on delete set null`), nunca se borra un avión.
--
-- Aditiva: tabla y columna nuevas. Se puede volver a correr. Ninguna agregación la lee.

create table if not exists public.checklists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  nombre      text not null check (length(nombre) between 1 and 80),
  texto       text not null default '' check (length(texto) <= 40000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists checklists_user_idx on public.checklists (user_id);

alter table public.checklists enable row level security;

drop policy if exists "checklists_select_propias" on public.checklists;
drop policy if exists "checklists_insert_propias" on public.checklists;
drop policy if exists "checklists_update_propias" on public.checklists;
drop policy if exists "checklists_delete_propias" on public.checklists;
create policy "checklists_select_propias" on public.checklists
  for select using (auth.uid() = user_id);
create policy "checklists_insert_propias" on public.checklists
  for insert with check (auth.uid() = user_id);
create policy "checklists_update_propias" on public.checklists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checklists_delete_propias" on public.checklists
  for delete using (auth.uid() = user_id);

revoke all on table public.checklists from anon;

comment on table public.checklists is
  'Checklist que cargó el piloto, en el formato de texto de Vector (# sección, - paso, > nota). Vector no trae ninguna de fábrica.';

alter table public.aircraft
  add column if not exists checklist_id uuid references public.checklists(id) on delete set null;

create index if not exists aircraft_checklist_idx on public.aircraft (checklist_id);

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select count(*) from pg_policies where tablename = 'checklists';   -- esperado: 4
-- select relrowsecurity from pg_class where oid = 'public.checklists'::regclass;  -- true
-- select column_name from information_schema.columns where table_name = 'aircraft' and column_name = 'checklist_id';

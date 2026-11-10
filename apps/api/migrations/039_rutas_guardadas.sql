-- 039 — Las rutas guardadas del Mapa (2026-11-10).
--
-- Federico (2026-11-05): "y guardar borradores en el mapa". Una ruta se arma en la compu y
-- se vuela con el teléfono, así que no alcanza con el `localStorage` del navegador: va a la
-- base, una fila por ruta, con un nombre y, si se eligió, el avión.
--
-- **Una ruta guardada no es un vuelo ni un plan de vuelo**: ninguna agregación la lee, y
-- presentar el plan sigue siendo `planes_de_vuelo` (024). RLS con las cuatro políticas
-- explícitas, como la 024: cada piloto ve y toca sólo lo suyo.

create table if not exists public.rutas_guardadas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  nombre       text not null check (length(nombre) between 1 and 80),
  -- La ruta como se escribe en el Mapa: "SADF DCT SADM", "SADF BENAVIDEZ SAAK".
  ruta         text not null check (length(ruta) between 1 and 600),
  aircraft_id  uuid references public.aircraft(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists rutas_guardadas_user_updated_idx
  on public.rutas_guardadas (user_id, updated_at desc);

alter table public.rutas_guardadas enable row level security;

create policy "rutas_guardadas_select_propias" on public.rutas_guardadas
  for select using (auth.uid() = user_id);
create policy "rutas_guardadas_insert_propias" on public.rutas_guardadas
  for insert with check (auth.uid() = user_id);
create policy "rutas_guardadas_update_propias" on public.rutas_guardadas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "rutas_guardadas_delete_propias" on public.rutas_guardadas
  for delete using (auth.uid() = user_id);

create or replace function public.rutas_guardadas_touch()
returns trigger
language plpgsql
set search_path to ''
as $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

drop trigger if exists rutas_guardadas_touch_trigger on public.rutas_guardadas;
create trigger rutas_guardadas_touch_trigger
  before update on public.rutas_guardadas
  for each row execute function public.rutas_guardadas_touch();

revoke all on table public.rutas_guardadas from anon;

comment on table public.rutas_guardadas is
  'Rutas guardadas del Mapa. NO son vuelos ni planes de vuelo: ninguna agregación lee esta tabla.';

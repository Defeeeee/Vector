-- 056 — Seguidores y Vector Tracker (2026-11-15).
--
-- Aditiva: tres tablas nuevas y una columna opcional. La 041 a la 055 quedan como están.
--
-- Vector Tracker (tracker.vectoraero.ar) es una interfaz aparte para quien SIGUE vuelos sin ser piloto
-- (la familia, un instructor con sus alumnos): entra con Google y ve los vuelos que el piloto le
-- asignó, con aviso push de despegue y aterrizaje. Es la misma cuenta de Vector: no hay un tipo de
-- usuario aparte, sólo una relación entre dos cuentas. **El link público `/seguir/<token>` no cambia
-- ni depende de nada de esto.**
--
-- - `seguidores`: una fila por persona que el piloto invita. Nace PENDIENTE con un link de
--   invitación (`invitacion_token`, aleatorio y largo, **de un solo uso**, vence a los 7 días) que
--   el piloto manda por donde quiera. Quien lo abre y entra con Google lo acepta: se completa
--   `seguidor_id` y `vinculado_at` y **el token se borra** (así no se puede usar dos veces). El
--   `apodo` ("Mamá") lo pone el piloto y sólo lo ve él. El piloto anula una invitación pendiente o
--   quita a un seguidor borrando la fila: el acceso se corta al instante (todo cuelga de esta
--   fila). Un piloto sólo puede seguir una vez a la misma cuenta (índice parcial único). El tope
--   de 20 por piloto —pendientes incluidas— se controla en el código.
-- - `seguimiento_seguidores`: **qué vuelo ve cada seguidor**. El seguidor no ve "todos los vuelos
--   del piloto": ve sólo los seguimientos a los que el piloto lo asignó, a mano, uno por uno. Se
--   borra con el seguimiento (30 días, o al borrarlo) y con el seguidor.
-- - RLS: el piloto ve, crea, edita y borra sus filas de `seguidores`; el seguidor sólo LEE la suya.
--   Del lado de las asignaciones, el piloto dueño del seguimiento las maneja (y sólo con seguidores
--   suyos); el seguidor lee las suyas. Aceptar una invitación y leer los vuelos lo hace el backend
--   con el service role, después de filtrar por estas filas.
-- - `tracker_suscripciones`: push web por cuenta del seguidor (no por vuelo, como en la 046). Una
--   credencial para mandarle notificaciones a un navegador: **sin políticas para anon ni
--   authenticated**, sólo el service role, y se borra con la cuenta.
-- - `profiles.alta_desde`: de dónde nació la cuenta. `null` es la web de siempre; `'tracker'` es una
--   cuenta que se creó entrando al tracker (por una invitación). Sirve para que el panel de
--   administración y el "uso real" separen a la familia de los pilotos. No cambia otras métricas.

create table if not exists public.seguidores (
  id                  uuid primary key default gen_random_uuid(),
  piloto_id           uuid not null references auth.users(id) on delete cascade,
  apodo               text check (apodo is null or char_length(apodo) <= 40),
  invitacion_token    text unique check (invitacion_token is null or length(invitacion_token) >= 32),
  invitacion_vence_at timestamptz,
  seguidor_id         uuid references auth.users(id) on delete cascade,
  creado_at           timestamptz not null default now(),
  vinculado_at        timestamptz,
  -- O está pendiente (con link) o ya tiene seguidor.
  check (invitacion_token is not null or seguidor_id is not null),
  check (seguidor_id is null or seguidor_id <> piloto_id)
);

create unique index if not exists seguidores_piloto_seguidor_uq
  on public.seguidores (piloto_id, seguidor_id) where seguidor_id is not null;
create index if not exists seguidores_piloto_idx on public.seguidores (piloto_id);
create index if not exists seguidores_seguidor_idx on public.seguidores (seguidor_id) where seguidor_id is not null;

alter table public.seguidores enable row level security;

drop policy if exists "seguidores_piloto_ve" on public.seguidores;
create policy "seguidores_piloto_ve" on public.seguidores for select to authenticated
  using (piloto_id = auth.uid());
drop policy if exists "seguidores_piloto_crea" on public.seguidores;
create policy "seguidores_piloto_crea" on public.seguidores for insert to authenticated
  with check (piloto_id = auth.uid() and seguidor_id is null);
drop policy if exists "seguidores_piloto_edita" on public.seguidores;
create policy "seguidores_piloto_edita" on public.seguidores for update to authenticated
  using (piloto_id = auth.uid()) with check (piloto_id = auth.uid());
-- El piloto sólo edita el apodo: si pudiera escribir `seguidor_id`, "vincularía" a cualquier cuenta
-- sin que acepte (aceptar lo hace el backend con el service role). Permiso por columna.
revoke update on table public.seguidores from anon, authenticated;
grant update (apodo) on table public.seguidores to authenticated;
drop policy if exists "seguidores_piloto_borra" on public.seguidores;
create policy "seguidores_piloto_borra" on public.seguidores for delete to authenticated
  using (piloto_id = auth.uid());
drop policy if exists "seguidores_seguidor_lee" on public.seguidores;
create policy "seguidores_seguidor_lee" on public.seguidores for select to authenticated
  using (seguidor_id = auth.uid());

comment on table public.seguidores is
  'Personas que un piloto invitó a seguir sus vuelos en Vector Tracker. Pendiente = con link de un solo uso; vinculada = con seguidor_id.';

create table if not exists public.seguimiento_seguidores (
  seguimiento_id   uuid not null references public.seguimientos_en_vivo(id) on delete cascade,
  seguidor_fila_id uuid not null references public.seguidores(id) on delete cascade,
  creado_at        timestamptz not null default now(),
  primary key (seguimiento_id, seguidor_fila_id)
);

create index if not exists seguimiento_seguidores_fila_idx on public.seguimiento_seguidores (seguidor_fila_id);

alter table public.seguimiento_seguidores enable row level security;

drop policy if exists "asignaciones_piloto" on public.seguimiento_seguidores;
create policy "asignaciones_piloto" on public.seguimiento_seguidores for all to authenticated
  using (exists (select 1 from public.seguimientos_en_vivo s where s.id = seguimiento_id and s.user_id = auth.uid()))
  with check (
    exists (select 1 from public.seguimientos_en_vivo s where s.id = seguimiento_id and s.user_id = auth.uid())
    and exists (select 1 from public.seguidores f where f.id = seguidor_fila_id and f.piloto_id = auth.uid() and f.seguidor_id is not null)
  );
drop policy if exists "asignaciones_seguidor_lee" on public.seguimiento_seguidores;
create policy "asignaciones_seguidor_lee" on public.seguimiento_seguidores for select to authenticated
  using (exists (select 1 from public.seguidores f where f.id = seguidor_fila_id and f.seguidor_id = auth.uid()));

comment on table public.seguimiento_seguidores is
  'Qué seguidores ven cada seguimiento: el piloto los asigna a mano. Sin fila, el seguidor no ve ese vuelo.';

create table if not exists public.tracker_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh     text not null check (length(p256dh) between 1 and 200),
  auth       text not null check (length(auth) between 1 and 100),
  creado_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists tracker_suscripciones_user_idx on public.tracker_suscripciones (user_id);

alter table public.tracker_suscripciones enable row level security;
revoke all on table public.tracker_suscripciones from anon, authenticated;

comment on table public.tracker_suscripciones is
  'Suscripciones push de quien sigue vuelos en Vector Tracker, por cuenta. Sólo el service role.';

alter table public.profiles add column if not exists alta_desde text;

comment on column public.profiles.alta_desde is
  'De dónde nació la cuenta: null es la web de Vector; ''tracker'' es una cuenta creada entrando a Vector Tracker.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select count(*) from pg_policies where tablename = 'seguidores';               -- esperado: 5
-- select count(*) from pg_policies where tablename = 'seguimiento_seguidores';   -- esperado: 2
-- select count(*) from pg_policies where tablename = 'tracker_suscripciones';    -- esperado: 0
-- select grantee from information_schema.role_table_grants
--   where table_name = 'tracker_suscripciones' and grantee in ('anon','authenticated');  -- ninguna
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name = 'alta_desde';

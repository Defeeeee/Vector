-- 041 — Que la familia siga el vuelo en vivo (2026-11-11).
--
-- Con el Mapa en modo vuelo, el piloto toca "Compartir mi vuelo" y manda un link. Quien lo abre,
-- sin cuenta, ve el avión en un mapa, por dónde pasó y la ruta prevista. El link vence solo:
-- cuando el piloto toca Terminar o, a más tardar, a las 12 horas.
--
-- **No confundir con `seguimientos`** (018), que son los "seguir a un piloto" de la red social.
-- Ésta es `seguimientos_en_vivo`.
--
-- Qué hay acá y qué no (invariante 14, en espíritu): el nombre de pila, la ruta que el piloto
-- tenía escrita en el Mapa, y las posiciones del GPS del teléfono. **Nunca** la matrícula ni
-- nada de la bitácora: esta tabla no tiene cómo guardarlas. La API pública (`GET
-- /publico/seguimientos/{token}`) devuelve una lista fija de campos, sin `user_id`.
--
-- El token es el secreto del link: 32 caracteres url-safe de `secrets.token_urlsafe(24)`
-- (192 bits), distinto del id. Se guarda tal cual y no con hash porque `POST /seguimientos`
-- tiene que poder devolver el link de un seguimiento que ya está activo.
--
-- El recorrido va en un jsonb de la misma fila ([[lat, lon], …], como mucho 400 puntos; el
-- backend lo ralea): se lee entero en cada pedido público y nunca se consulta por punto, así
-- que una tabla aparte sólo sumaría un join y cientos de filas por vuelo. La última posición
-- va en columnas propias, sin horas del GPS: la hora es la del servidor al recibirla.
--
-- Se borra a los 30 días de creado (como las posiciones ADS-B): lo hace `grabador_adsb.py`,
-- que ya limpia una vez por hora. Un link que venció o terminó deja de abrirse mucho antes.
--
-- RLS: el dueño ve y escribe lo suyo, como la 039. La lectura pública pasa por el backend con
-- el service role; `anon` no tiene acceso.

create table if not exists public.seguimientos_en_vivo (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  token          text not null unique check (length(token) >= 32),
  -- Sólo el nombre de pila del piloto.
  nombre         text not null check (length(nombre) between 1 and 40),
  -- La ruta como se escribe en el Mapa ("SADF SADM") y sus puntos [[lat, lon, "codigo"], …].
  ruta           text not null default '' check (length(ruta) <= 600),
  puntos         jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(puntos) = 'array' and jsonb_array_length(puntos) <= 60),
  created_at     timestamptz not null default now(),
  vence_at       timestamptz not null default (now() + interval '12 hours'),
  terminado_at   timestamptz,
  -- La última posición. `ultima_at` es la hora del servidor al recibirla.
  ultima_lat     double precision check (ultima_lat between -90 and 90),
  ultima_lon     double precision check (ultima_lon between -180 and 180),
  ultima_alt_ft  integer,
  ultima_gs_kt   real,
  ultima_track   real check (ultima_track is null or ultima_track between 0 and 360),
  ultima_at      timestamptz,
  recorrido      jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(recorrido) = 'array' and jsonb_array_length(recorrido) <= 400),
  check (vence_at > created_at)
);

-- Un piloto tiene a lo sumo un seguimiento sin terminar; el backend marca como terminados los
-- vencidos antes de crear otro.
create unique index if not exists seguimientos_en_vivo_uno_activo_idx
  on public.seguimientos_en_vivo (user_id) where terminado_at is null;

-- Para el borrado a los 30 días.
create index if not exists seguimientos_en_vivo_created_idx
  on public.seguimientos_en_vivo (created_at);

alter table public.seguimientos_en_vivo enable row level security;

create policy "seguimientos_en_vivo_select_propios" on public.seguimientos_en_vivo
  for select using (auth.uid() = user_id);
create policy "seguimientos_en_vivo_insert_propios" on public.seguimientos_en_vivo
  for insert with check (auth.uid() = user_id);
create policy "seguimientos_en_vivo_update_propios" on public.seguimientos_en_vivo
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seguimientos_en_vivo_delete_propios" on public.seguimientos_en_vivo
  for delete using (auth.uid() = user_id);

revoke all on table public.seguimientos_en_vivo from anon;

comment on table public.seguimientos_en_vivo is
  'Seguimiento en vivo de un vuelo, para que alguien con el link (token) lo mire sin cuenta. NO es un vuelo: ninguna agregación lo lee. Sin matrícula. Se borra a los 30 días.';

-- 046 — Avisos al que mira el vuelo: "despegó" y "aterrizó" (2026-11-12).
--
-- Aditiva: una tabla nueva y tres columnas opcionales. La 041 a la 045 quedan como están.
--
-- Quien abre el link de "Compartir mi vuelo" (`/seguir/<token>`, sin cuenta) puede pedir que el
-- navegador le avise cuando el avión despega y cuando aterriza. Es un push web: la página guarda
-- la suscripción del navegador (`endpoint`, `p256dh`, `auth`) para ESE link y nada más. No hay
-- cuenta, ni nombre, ni mail, ni IP.
--
-- - `seguimientos_avisos`: una fila por navegador y por seguimiento. Único por (seguimiento,
--   endpoint), así que pedir dos veces es lo mismo. **Se borra con el seguimiento** (`on delete
--   cascade`): la limpieza a los 30 días de `grabador_adsb.py` ya borra los seguimientos, y las
--   suscripciones se van con ellos. Las que el servicio de push dice que ya no existen (404/410)
--   las borra el envío.
-- - **Sin políticas para `anon` ni `authenticated`**: con RLS prendido y ninguna política, nadie
--   las lee ni las escribe salvo el service role (el backend). Una suscripción es una credencial
--   para mandarle notificaciones a un navegador: no sale por ninguna API pública, ni siquiera la
--   del propio piloto.
-- - `seguimientos_en_vivo.despego_at`: cuándo se vio el primer tramo en el aire (ADS-B o GPS del
--   teléfono). `aviso_despegue_at` y `aviso_aterrizaje_at`: cuándo se mandó (o se dejó pasar, si ya
--   era viejo) cada aviso, para que salga una sola vez aunque el barrido corra cada 30 s o dos
--   procesos coincidan: se "reserva" la columna con un update condicional antes de mandar.
--   `aviso_aterrizaje_at` también cubre el "terminó el vuelo" cuando el piloto termina a mano.
--
-- Nada de esto sale en `vista_publica` (lo fija el test).

create table if not exists public.seguimientos_avisos (
  id              uuid primary key default gen_random_uuid(),
  seguimiento_id  uuid not null references public.seguimientos_en_vivo(id) on delete cascade,
  endpoint        text not null check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh          text not null check (length(p256dh) between 1 and 200),
  auth            text not null check (length(auth) between 1 and 100),
  created_at      timestamptz not null default now(),
  unique (seguimiento_id, endpoint)
);

create index if not exists seguimientos_avisos_seguimiento_idx
  on public.seguimientos_avisos (seguimiento_id);

alter table public.seguimientos_avisos enable row level security;
revoke all on table public.seguimientos_avisos from anon, authenticated;

comment on table public.seguimientos_avisos is
  'Suscripciones push de quien mira un seguimiento (sin cuenta). Sólo el service role. Se borran con el seguimiento.';

alter table public.seguimientos_en_vivo
  add column if not exists despego_at          timestamptz,
  add column if not exists aviso_despegue_at   timestamptz,
  add column if not exists aviso_aterrizaje_at timestamptz;

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select relrowsecurity from pg_class where oid = 'public.seguimientos_avisos'::regclass;
--   -- esperado: true
-- select count(*) from pg_policies where tablename = 'seguimientos_avisos';
--   -- esperado: 0
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'seguimientos_avisos' and grantee in ('anon','authenticated');
--   -- esperado: ninguna fila
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'seguimientos_en_vivo'
--     and column_name in ('despego_at','aviso_despegue_at','aviso_aterrizaje_at');
--   -- esperado: las tres

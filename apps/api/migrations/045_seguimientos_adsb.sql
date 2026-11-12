-- 045 — El vuelo compartido usa ADS-B (2026-11-11).
--
-- Aditiva: sólo columnas nuevas, todas opcionales. La 041, la 042 y la 044 quedan como están.
--
-- Dos cosas nuevas para "Compartir mi vuelo":
--
-- 1. **ADS-B como respaldo del teléfono.** Si el teléfono deja de mandar (pantalla apagada,
--    batería, sin señal), el link sigue mostrando el avión con las posiciones ADS-B públicas de
--    su matrícula (`adsb_posiciones`, migración 034), y las junta con las del GPS por hora. Para
--    buscarlas hace falta la matrícula, y la 042 prohíbe guardarla con el interruptor apagado
--    (`seguimientos_en_vivo_matricula_con_permiso`): ese check **no se toca**. Por eso la
--    matrícula para ADS-B va en una columna aparte, `matricula_adsb`, que es **interna**: nunca
--    sale en la API pública (`vista_publica` arma el dict campo por campo y el test fija las
--    claves). `avion_matricula` sigue siendo la que se muestra, y sólo con el interruptor prendido.
--
-- 2. **Compartir sin el teléfono, desde el plan de vuelo.** El editor del plan crea el seguimiento
--    con la matrícula, la ruta y la salida del plan: antes de despegar el link dice "Sale a las
--    12:30"; cuando ADS-B ve al avión en el aire muestra el vuelo; cuando aterriza pasa a "Aterrizó"
--    y termina solo. Para eso:
--    - `plan_id`: el plan de origen (`on delete set null`: borrar el plan no borra el link). Es
--      también lo que distingue un seguimiento desde un plan de uno del Mapa.
--    - `salida_prevista`: la EOBT vigente del plan (con las demoras), en UTC. Ancla la ventana de
--      ADS-B (un rato antes de la salida, para no mezclar vuelos anteriores del mismo avión) y el
--      "Sale a las…".
--    - `duracion_prevista_min`: la casilla 16 (EET) del plan, para el vencimiento. El vencimiento
--      de un seguimiento desde un plan es la salida más la duración más un margen
--      (`vence_at`, que ya existe), no 12 horas desde que se creó.
--    - `aterrizo_at`: cuándo tocó tierra, si el backend lo detectó con ADS-B. Si está, el link
--      dice "Aterrizó" y no "El vuelo terminó"; `terminado_at` toma el mismo valor.
--
-- Nada de esto cambia lo que ya salía: las claves nuevas de la vista pública son `fase`,
-- `salida_prevista` y `con_adsb` (sí/no, sin la matrícula).
--
-- Lo que la base garantiza: la matrícula ADS-B tiene la forma de `adsb_aviones.matricula`
-- (mayúsculas y números, sin guión), así que no hay cómo guardar texto libre ahí.

alter table public.seguimientos_en_vivo
  add column if not exists matricula_adsb        text
    check (matricula_adsb is null or matricula_adsb ~ '^[A-Z0-9]{2,10}$'),
  add column if not exists plan_id               uuid references public.planes_de_vuelo(id) on delete set null,
  add column if not exists salida_prevista       timestamptz,
  add column if not exists duracion_prevista_min integer
    check (duracion_prevista_min is null or duracion_prevista_min between 1 and 1440),
  add column if not exists aterrizo_at           timestamptz;

-- Para "¿tiene este plan un seguimiento activo?" al abrir el editor.
create index if not exists seguimientos_en_vivo_plan_idx
  on public.seguimientos_en_vivo (plan_id) where plan_id is not null;

comment on column public.seguimientos_en_vivo.matricula_adsb is
  'INTERNA, nunca pública: la matrícula normalizada (LVABC) para buscar las posiciones ADS-B del avión. Aparte de avion_matricula, que es la que se muestra y sólo con mostrar_matricula.';
comment on column public.seguimientos_en_vivo.aterrizo_at is
  'Cuándo tocó tierra según ADS-B/GPS (sólo en seguimientos desde un plan). terminado_at toma el mismo valor.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'seguimientos_en_vivo'
--     and column_name in ('matricula_adsb','plan_id','salida_prevista','duracion_prevista_min','aterrizo_at');
--   -- esperado: las cinco
-- select conname from pg_constraint where conrelid = 'public.seguimientos_en_vivo'::regclass order by 1;
--   -- esperado: sigue estando seguimientos_en_vivo_matricula_con_permiso

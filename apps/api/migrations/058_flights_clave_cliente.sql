-- 058 — Clave del cliente en un vuelo, para registrar sin señal sin duplicar (2026-11-17).
--
-- Aditiva: una columna nueva y un índice único parcial; no toca ni reescribe filas.
--
-- El formulario de Registrar vuelo genera un uuid al abrirse y lo manda siempre. Sin red, el
-- pedido queda en una cola del teléfono y se reintenta con la misma clave: si el primer intento
-- sí llegó (y la respuesta se perdió), el backend devuelve ese vuelo en vez de crear otro y de
-- cobrar el saldo dos veces. Los vuelos de antes y los de WhatsApp quedan con la clave en null.

alter table public.flights
  add column if not exists clave_cliente uuid;

create unique index if not exists flights_user_clave_cliente_uniq
  on public.flights (user_id, clave_cliente)
  where clave_cliente is not null;

comment on column public.flights.clave_cliente is
  'Clave de idempotencia que genera el formulario al abrirse: reintentar el mismo alta devuelve el mismo vuelo. Interna.';

-- 042 — Más datos para quien mira el link de "Compartir mi vuelo" (2026-11-11).
--
-- Aditiva: sólo columnas nuevas, todas opcionales o con default. La 041 queda como está.
--
-- Qué se suma, y por qué es seguro (invariante 14, en espíritu: lo público lleva sólo lo que el
-- piloto eligió):
--
-- - **El avión**: marca y modelo (`avion_tipo`, p. ej. "Cessna 152") y su designador OACI
--   (`avion_icao`, "C152"). Es un tipo de avión, no identifica a nadie: sale siempre, y es una
--   copia (no hay `aircraft_id`: la tabla no apunta a la bitácora ni al Hangar).
-- - **La matrícula**: se muestra **sólo si el piloto prende "Mostrar la matrícula"**, apagado por
--   defecto. `mostrar_matricula` es el interruptor y `avion_matricula` guarda la matrícula
--   **únicamente mientras está prendido**: al apagarlo el backend la pone en null, así que con el
--   interruptor apagado la tabla ni siquiera la tiene. `vista_publica` pide las dos cosas.
--   Esto corrige el comentario de la 041 ("esta tabla no tiene cómo guardarla"): ahora sí puede,
--   pero sólo por una decisión del piloto, en cada vuelo.
-- - **Los puntos con nombre**: `puntos` pasa de [lat, lon, "codigo"] a [lat, lon, "codigo", "nombre"]
--   (p. ej. "SADF", "San Fernando"). Es el mismo jsonb y el mismo tope de 60: no hace falta
--   columna. Los puntos viejos de tres elementos se siguen leyendo (nombre vacío).
-- - **El recorrido con altura y hora**: `recorrido` pasa de [lat, lon] a [lat, lon, alt_ft, epoch_s]
--   (la hora es la del servidor al recibir la posición, en segundos). Mismo jsonb y mismo tope de
--   400 (el backend guarda como mucho 300); los puntos viejos de dos elementos se siguen leyendo.
--   Sirve para el perfil de altura y para saber si sube o baja.
--
-- No hay columna de "hora de inicio": es `created_at`, que ya existe, y `vista_publica` la expone
-- como `inicio`.

alter table public.seguimientos_en_vivo
  add column if not exists avion_tipo        text check (avion_tipo is null or length(avion_tipo) <= 60),
  add column if not exists avion_icao        text check (avion_icao is null or length(avion_icao) <= 8),
  add column if not exists avion_matricula   text check (avion_matricula is null or length(avion_matricula) <= 12),
  add column if not exists mostrar_matricula boolean not null default false;

-- Sin interruptor prendido no hay matrícula guardada: lo impone la base, no sólo el backend.
alter table public.seguimientos_en_vivo
  drop constraint if exists seguimientos_en_vivo_matricula_con_permiso;
alter table public.seguimientos_en_vivo
  add constraint seguimientos_en_vivo_matricula_con_permiso
  check (avion_matricula is null or mostrar_matricula);

comment on table public.seguimientos_en_vivo is
  'Seguimiento en vivo de un vuelo, para que alguien con el link (token) lo mire sin cuenta. NO es un vuelo: ninguna agregación lo lee. Lleva el tipo de avión; la matrícula sólo si el piloto prendió mostrar_matricula. Se borra a los 30 días.';

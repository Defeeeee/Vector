-- 052 — El dorso suma solo las firmas de los vuelos de su hoja (2026-11-13).
--
-- Federico: "al agregar un vuelo o una autoridad a un vuelo se debe autoagregar la firma con
-- sello o en su defecto, si no existiese, la firma y el nombre… al dorso eso". El PDF calcula
-- qué personas certificaron los vuelos de cada hoja (igual que la celda «Certificaciones») y
-- pone en el dorso el sello de cada una para ese cargo o, si no tiene, su firma con el nombre.
-- Se calcula al armar el PDF, no se guarda: si un vuelo cargado antes corre todas las hojas, el
-- dorso no queda desfasado.
--
-- `firmas_de_los_vuelos`: si esta hoja las suma. `null` = lo de siempre: sí, salvo que la hoja
-- tenga fotos (un dorso fotografiado ya trae sus firmas; sumarlas las duplicaría).
--
-- Aditiva: una columna nullable sin default. Se puede volver a correr.

alter table public.libro_hojas_dorso
  add column if not exists firmas_de_los_vuelos boolean;

comment on column public.libro_hojas_dorso.firmas_de_los_vuelos is
  'Si el dorso suma las firmas (sello o firma con nombre) de quienes certificaron los vuelos de la hoja. null = sí, salvo que la hoja tenga fotos.';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'libro_hojas_dorso' and column_name = 'firmas_de_los_vuelos';
--   -- esperado: firmas_de_los_vuelos | boolean | YES

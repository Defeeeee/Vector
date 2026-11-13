-- 050 — Textos del dorso, cada uno con su firma (2026-11-13).
--
-- Federico quiso agregar al dorso de la hoja 4 "EN EL DÍA DE LA FECHA 12/03/26 EL TITULAR DEL
-- PRESENTE LIBRO … QUEDA HABILITADO PARA TRANSPORTAR PASAJEROS" (163 letras) y el PUT falló: el
-- único texto del dorso era la aclaración, de hasta 160. Ese texto no es una aclaración, es una
-- constancia que firma un instructor: "cada texto se debería poder asociar a una firma".
--
-- `libro_hojas_dorso.textos`: una lista (hasta 12) de `{ "texto": "...", "firma": "foto:<uuid>" |
-- "sello:<uuid>" | null }`, de hasta 600 letras cada texto. `firma` apunta a una foto de ese
-- mismo dorso (`libro_hojas_dorso_fotos`) o a un sello (`certificante_sellos`): en el PDF el texto
-- va arriba de esa firma. Lo valida el backend; si la foto o el sello se borran, el texto queda
-- solo (no se pierde).
--
-- Aditiva: una columna con default. Se puede volver a correr.

alter table public.libro_hojas_dorso
  add column if not exists textos jsonb not null default '[]'::jsonb;

alter table public.libro_hojas_dorso drop constraint if exists libro_hojas_dorso_textos_lista;
alter table public.libro_hojas_dorso
  add constraint libro_hojas_dorso_textos_lista
  check (jsonb_typeof(textos) = 'array' and jsonb_array_length(textos) <= 12 and length(textos::text) <= 12000);

comment on column public.libro_hojas_dorso.textos is
  'Textos del dorso (constancias, habilitaciones), cada uno con la firma que lo avala: [{texto, firma: "foto:<id>" | "sello:<id>" | null}].';

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select column_name, data_type, column_default from information_schema.columns
--   where table_name = 'libro_hojas_dorso' and column_name = 'textos';
--   -- esperado: textos | jsonb | '[]'::jsonb
-- select count(*) from public.libro_hojas_dorso where jsonb_array_length(textos) > 0;
--   -- esperado: 0 al aplicarla

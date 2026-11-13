-- 053 — Borrar las columnas de firmas que quedaron sin uso (2026-11-13).
--
-- Federico: "borrá las columnas viejas de la base". Las tres quedaron sin uso con la migración
-- 049, y ningún código las lee ni las escribe desde entonces:
--   - `libro_hojas_dorso.png`: la foto única del dorso, que pasó a `libro_hojas_dorso_fotos`;
--   - `libro_hojas_dorso.certificante_ids`: las personas del dorso, reemplazadas por `sello_ids`;
--   - `firmas_certificantes.png_sello`: el sello único, que pasó a `certificante_sellos`.
--
-- Antes de borrar se revisó: los 6 `png_sello` están copiados en `certificante_sellos`. Una sola
-- foto de dorso (hoja 6 de "Mi libro") no tiene copia en las fotos: la app no la muestra desde la
-- 049, y esa hoja hoy tiene 2 sellos y ninguna foto, así que lo más probable es que se quitó a
-- propósito. **Igual se guarda** en `respaldo_firmas_053`, que sólo ve el service role, por si
-- hiciera falta; se puede borrar cuando Federico confirme que no.
--
-- Destructiva: la autorizó Federico en el chat. Se puede volver a correr.

create table if not exists public.respaldo_firmas_053 (
  tabla       text not null,
  fila_id     uuid not null,
  png         text,
  certificante_ids uuid[],
  respaldado_at timestamptz not null default now(),
  primary key (tabla, fila_id)
);
alter table public.respaldo_firmas_053 enable row level security;
revoke all on table public.respaldo_firmas_053 from anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'libro_hojas_dorso' and column_name = 'png') then
    insert into public.respaldo_firmas_053 (tabla, fila_id, png, certificante_ids)
      select 'libro_hojas_dorso', id, png, certificante_ids from public.libro_hojas_dorso
      where png is not null or coalesce(array_length(certificante_ids, 1), 0) > 0
    on conflict do nothing;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'firmas_certificantes' and column_name = 'png_sello') then
    insert into public.respaldo_firmas_053 (tabla, fila_id, png)
      select 'firmas_certificantes', id, png_sello from public.firmas_certificantes where png_sello is not null
    on conflict do nothing;
  end if;
end $$;

comment on table public.respaldo_firmas_053 is
  'Copia de las columnas de firmas borradas en la 053 (libro_hojas_dorso.png y certificante_ids, firmas_certificantes.png_sello). Sólo service role. Se puede borrar.';

alter table public.libro_hojas_dorso drop column if exists png;
alter table public.libro_hojas_dorso drop column if exists certificante_ids;
alter table public.firmas_certificantes drop column if exists png_sello;

-- ---------------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------------
-- select count(*) from information_schema.columns where table_schema = 'public'
--   and ((table_name = 'libro_hojas_dorso' and column_name in ('png', 'certificante_ids'))
--     or (table_name = 'firmas_certificantes' and column_name = 'png_sello'));   -- esperado: 0
-- select tabla, count(*) from public.respaldo_firmas_053 group by tabla;
--   -- esperado: libro_hojas_dorso 1, firmas_certificantes 6

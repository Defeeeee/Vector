-- 057 — Dónde aterrizó un vuelo compartido, y tramos encadenados del mismo piloto (2026-11-17).
--
-- Aditiva: tres columnas nuevas en `seguimientos_en_vivo`, ninguna borra ni reescribe filas.
--
-- Caso real del 2026-11-16 (LV-S048): la ida se compartió sin plan hacia SAZM, el piloto cambió de
-- destino en vuelo y no lo actualizó, y el seguimiento nunca se cerró (sólo se daba por aterrizado
-- si la señal se cortaba a 3 NM del destino cargado). La vuelta, de plan, salió mucho antes de lo
-- previsto y se descartó entera como "lo que el avión ya traía en el aire".
--
-- - `aterrizo_en`: `{"codigo": "SAZT", "nombre": "Tandil"}`, el aeródromo donde se detectó el
--   aterrizaje (cualquiera de los argentinos, no sólo el destino). Es público: sale en `vista_publica`
--   y en el aviso push. Vacío si no se pudo saber.
-- - `aterrizo_sin_ver`: el tramo se cerró porque el avión volvió a aparecer en el aire más de 20 min
--   después de perderse: aterrizó en algún lado fuera de la cobertura de ADS-B. Público.
-- - `desde_tramo_at`: cuándo terminó el tramo anterior del mismo piloto con el mismo avión (hasta 12 h
--   antes). Si está, la ventana de ADS-B de este seguimiento empieza ahí y no 30 min antes de su
--   salida prevista, y lo que el avión ya traía en el aire cuenta. Interna: no sale a ningún link.

alter table public.seguimientos_en_vivo
  add column if not exists aterrizo_en jsonb,
  add column if not exists aterrizo_sin_ver boolean not null default false,
  add column if not exists desde_tramo_at timestamptz;

comment on column public.seguimientos_en_vivo.aterrizo_en is
  'Dónde se detectó el aterrizaje: {codigo, nombre} del aeródromo argentino más cercano (el destino si era ése). Público.';
comment on column public.seguimientos_en_vivo.aterrizo_sin_ver is
  'El tramo se cerró porque el avión reapareció en el aire tras un corte largo: aterrizó fuera de la cobertura de ADS-B. Público.';
comment on column public.seguimientos_en_vivo.desde_tramo_at is
  'Cuándo terminó el tramo anterior del mismo piloto y avión: desde ahí se lee ADS-B. Interna.';

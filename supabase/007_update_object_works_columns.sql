-- Обновление структуры таблицы object_works
-- Новые столбцы: work_per_unit, materials_per_unit
-- Удаляем старые столбцы: tender_works, tender_materials, fact_works, fact_materials

-- Добавляем новые столбцы
ALTER TABLE object_works
ADD COLUMN IF NOT EXISTS work_per_unit NUMERIC,
ADD COLUMN IF NOT EXISTS materials_per_unit NUMERIC;

-- Удаляем старые столбцы (если существуют)
ALTER TABLE object_works
DROP COLUMN IF EXISTS tender_works,
DROP COLUMN IF EXISTS tender_materials,
DROP COLUMN IF EXISTS fact_works,
DROP COLUMN IF EXISTS fact_materials,
DROP COLUMN IF EXISTS quantity,
DROP COLUMN IF EXISTS unit_price,
DROP COLUMN IF EXISTS total_price,
DROP COLUMN IF EXISTS note;

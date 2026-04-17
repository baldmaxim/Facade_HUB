-- Добавление столбцов: № п/п и Привязка к работе
ALTER TABLE vor_templates
  ADD COLUMN IF NOT EXISTS point_number TEXT,
  ADD COLUMN IF NOT EXISTS work_binding TEXT;

COMMENT ON COLUMN vor_templates.point_number IS '№ п/п — номер пункта (колонка B в Excel)';
COMMENT ON COLUMN vor_templates.work_binding IS 'Привязка к работе (колонка D в Excel)';

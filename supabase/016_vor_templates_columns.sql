-- Добавление новых столбцов в таблицу шаблонов ВОР
ALTER TABLE vor_templates
  ADD COLUMN IF NOT EXISTS coefficient_translate NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS price_ref NUMERIC,
  ADD COLUMN IF NOT EXISTS link_kp TEXT,
  ADD COLUMN IF NOT EXISTS note_customer TEXT,
  ADD COLUMN IF NOT EXISTS note_gp TEXT;

COMMENT ON COLUMN vor_templates.coefficient_translate IS 'Коэффициент перевода (колонка J в Excel)';
COMMENT ON COLUMN vor_templates.currency IS 'Валюта (по умолчанию RUB)';
COMMENT ON COLUMN vor_templates.price_ref IS 'Стоимость — справочная цена за единицу';
COMMENT ON COLUMN vor_templates.link_kp IS 'Ссылка на КП (коммерческое предложение)';
COMMENT ON COLUMN vor_templates.note_customer IS 'Примечание заказчика';
COMMENT ON COLUMN vor_templates.note_gp IS 'Примечание ГП';

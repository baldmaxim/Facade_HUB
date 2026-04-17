-- Добавление недостающих столбцов в таблицу vor_templates
-- Соответствие колонкам Excel-шаблона ВОРа

ALTER TABLE vor_templates
  ADD COLUMN IF NOT EXISTS quantity_gp NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_type TEXT,
  ADD COLUMN IF NOT EXISTS price_per TEXT,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC;

-- Комментарии к новым столбцам
COMMENT ON COLUMN vor_templates.quantity_gp IS 'Количество ГП (колонка L в Excel)';
COMMENT ON COLUMN vor_templates.delivery_type IS 'Тип доставки (колонка N в Excel)';
COMMENT ON COLUMN vor_templates.price_per IS 'Цена за (единица, к которой привязана стоимость, колонка P в Excel)';
COMMENT ON COLUMN vor_templates.total_price IS 'Итоговая стоимость (колонка Q в Excel)';

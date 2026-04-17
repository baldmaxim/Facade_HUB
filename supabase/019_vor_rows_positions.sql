-- Добавляем тип 'position' для строк-позиций ВОР заказчика
-- Позиции — это входные строки из пустого ВОР, к которым привязываются шаблоны

-- Снимаем старый CHECK и ставим новый с 'position'
ALTER TABLE vor_rows DROP CONSTRAINT IF EXISTS vor_rows_row_type_check;
ALTER TABLE vor_rows ADD CONSTRAINT vor_rows_row_type_check
  CHECK (row_type IN ('work', 'material', 'position'));

-- Колонки для позиций
ALTER TABLE vor_rows ADD COLUMN IF NOT EXISTS position_code TEXT;
ALTER TABLE vor_rows ADD COLUMN IF NOT EXISTS qty_customer NUMERIC;
ALTER TABLE vor_rows ADD COLUMN IF NOT EXISTS qty_gp NUMERIC;

-- Комментарии
COMMENT ON COLUMN vor_rows.position_code IS 'Код позиции заказчика (10.1.1.1.)';
COMMENT ON COLUMN vor_rows.qty_customer IS 'Количество заказчика (столбец I в Excel)';
COMMENT ON COLUMN vor_rows.qty_gp IS 'Количество ГП (столбец L в Excel)';

-- Добавление столбца order_number к существующей таблице work_price
ALTER TABLE work_price ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- Комментарий к новому столбцу
COMMENT ON COLUMN work_price.order_number IS 'Порядковый номер для сортировки';

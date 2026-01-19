-- Добавление столбца order_number к существующей таблице work_price_tender
ALTER TABLE work_price_tender ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- Комментарий к новому столбцу
COMMENT ON COLUMN work_price_tender.order_number IS 'Порядковый номер для сортировки';

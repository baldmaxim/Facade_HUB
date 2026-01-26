-- Добавляем поле примечания в таблицу work_price_tender
ALTER TABLE work_price_tender
ADD COLUMN note TEXT;

-- Комментарий к новому столбцу
COMMENT ON COLUMN work_price_tender.note IS 'Примечание к цене работы на тендере';

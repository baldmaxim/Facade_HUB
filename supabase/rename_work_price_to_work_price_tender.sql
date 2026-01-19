-- Переименование таблицы work_price в work_price_tender
ALTER TABLE work_price RENAME TO work_price_tender;

-- Обновление комментария таблицы
COMMENT ON TABLE work_price_tender IS 'Цены работ для конкретных объектов на тендере';

-- Переименование индексов
ALTER INDEX idx_work_price_object_id RENAME TO idx_work_price_tender_object_id;
ALTER INDEX idx_work_price_work_type_id RENAME TO idx_work_price_tender_work_type_id;

-- Переименование функции триггера
ALTER FUNCTION update_work_price_updated_at() RENAME TO update_work_price_tender_updated_at;

-- Переименование триггера
ALTER TRIGGER trigger_update_work_price_updated_at ON work_price_tender
  RENAME TO trigger_update_work_price_tender_updated_at;

-- Обновление политик безопасности (удаляем старые и создаем новые с правильными именами)
DROP POLICY IF EXISTS "Allow public read access on work_price" ON work_price_tender;
DROP POLICY IF EXISTS "Allow public insert access on work_price" ON work_price_tender;
DROP POLICY IF EXISTS "Allow public update access on work_price" ON work_price_tender;
DROP POLICY IF EXISTS "Allow public delete access on work_price" ON work_price_tender;

CREATE POLICY "Allow public read access on work_price_tender"
  ON work_price_tender FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access on work_price_tender"
  ON work_price_tender FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access on work_price_tender"
  ON work_price_tender FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete access on work_price_tender"
  ON work_price_tender FOR DELETE
  USING (true);

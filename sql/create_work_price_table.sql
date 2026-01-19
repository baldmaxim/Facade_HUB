-- Таблица для хранения цен работ по объектам
CREATE TABLE work_price_tender (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  work_type_id UUID NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(object_id, work_type_id)
);

-- Комментарий к таблице
COMMENT ON TABLE work_price_tender IS 'Цены работ для конкретных объектов';

-- Комментарии к столбцам
COMMENT ON COLUMN work_price_tender.id IS 'Уникальный идентификатор записи';
COMMENT ON COLUMN work_price_tender.object_id IS 'ID объекта (ссылка на таблицу objects)';
COMMENT ON COLUMN work_price_tender.work_type_id IS 'ID вида работ (ссылка на таблицу work_types)';
COMMENT ON COLUMN work_price_tender.price IS 'Цена работы в рублях';
COMMENT ON COLUMN work_price_tender.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN work_price_tender.updated_at IS 'Дата и время последнего обновления записи';

-- Индексы для оптимизации запросов
CREATE INDEX idx_work_price_tender_object_id ON work_price_tender(object_id);
CREATE INDEX idx_work_price_tender_work_type_id ON work_price_tender(work_type_id);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_work_price_tender_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_work_price_tender_updated_at
  BEFORE UPDATE ON work_price_tender
  FOR EACH ROW
  EXECUTE FUNCTION update_work_price_tender_updated_at();

-- Политики безопасности (Row Level Security)
ALTER TABLE work_price_tender ENABLE ROW LEVEL SECURITY;

-- Разрешаем всем читать
CREATE POLICY "Allow public read access on work_price_tender"
  ON work_price_tender FOR SELECT
  USING (true);

-- Разрешаем всем вставлять
CREATE POLICY "Allow public insert access on work_price_tender"
  ON work_price_tender FOR INSERT
  WITH CHECK (true);

-- Разрешаем всем обновлять
CREATE POLICY "Allow public update access on work_price_tender"
  ON work_price_tender FOR UPDATE
  USING (true);

-- Разрешаем всем удалять
CREATE POLICY "Allow public delete access on work_price_tender"
  ON work_price_tender FOR DELETE
  USING (true);

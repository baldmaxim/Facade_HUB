-- Таблица для хранения цен работ по объектам
CREATE TABLE work_price (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  work_type_id UUID NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  price DECIMAL(15, 2) NOT NULL DEFAULT 0,
  order_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(object_id, work_type_id)
);

-- Комментарий к таблице
COMMENT ON TABLE work_price IS 'Цены работ для конкретных объектов';

-- Комментарии к столбцам
COMMENT ON COLUMN work_price.id IS 'Уникальный идентификатор записи';
COMMENT ON COLUMN work_price.object_id IS 'ID объекта (ссылка на таблицу objects)';
COMMENT ON COLUMN work_price.work_type_id IS 'ID вида работ (ссылка на таблицу work_types)';
COMMENT ON COLUMN work_price.price IS 'Цена работы в рублях';
COMMENT ON COLUMN work_price.order_number IS 'Порядковый номер для сортировки';
COMMENT ON COLUMN work_price.created_at IS 'Дата и время создания записи';
COMMENT ON COLUMN work_price.updated_at IS 'Дата и время последнего обновления записи';

-- Индексы для оптимизации запросов
CREATE INDEX idx_work_price_object_id ON work_price(object_id);
CREATE INDEX idx_work_price_work_type_id ON work_price(work_type_id);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_work_price_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_work_price_updated_at
  BEFORE UPDATE ON work_price
  FOR EACH ROW
  EXECUTE FUNCTION update_work_price_updated_at();

-- Политики безопасности (Row Level Security)
ALTER TABLE work_price ENABLE ROW LEVEL SECURITY;

-- Разрешаем всем читать
CREATE POLICY "Allow public read access on work_price"
  ON work_price FOR SELECT
  USING (true);

-- Разрешаем всем вставлять
CREATE POLICY "Allow public insert access on work_price"
  ON work_price FOR INSERT
  WITH CHECK (true);

-- Разрешаем всем обновлять
CREATE POLICY "Allow public update access on work_price"
  ON work_price FOR UPDATE
  USING (true);

-- Разрешаем всем удалять
CREATE POLICY "Allow public delete access on work_price"
  ON work_price FOR DELETE
  USING (true);

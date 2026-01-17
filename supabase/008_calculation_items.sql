-- Создание таблицы calculation_items
CREATE TABLE calculation_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  cost_type_id INTEGER REFERENCES cost_types(id) ON DELETE SET NULL,
  svor_code TEXT,
  note TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарий к таблице
COMMENT ON TABLE calculation_items IS 'Позиции расчёта для объектов строительства';

-- Комментарии к столбцам
COMMENT ON COLUMN calculation_items.id IS 'Уникальный идентификатор позиции расчёта';
COMMENT ON COLUMN calculation_items.object_id IS 'Ссылка на объект (objects.id)';
COMMENT ON COLUMN calculation_items.cost_type_id IS 'Ссылка на вид затрат (cost_types.id)';
COMMENT ON COLUMN calculation_items.svor_code IS 'Код СВОР';
COMMENT ON COLUMN calculation_items.note IS 'Примечание к позиции';
COMMENT ON COLUMN calculation_items.image_url IS 'URL изображения в Supabase Storage';
COMMENT ON COLUMN calculation_items.created_at IS 'Дата и время создания записи';

-- Индекс для быстрого поиска по объекту
CREATE INDEX idx_calculation_items_object_id ON calculation_items(object_id);

-- RLS политики
ALTER TABLE calculation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON calculation_items
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON calculation_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON calculation_items
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access" ON calculation_items
  FOR DELETE USING (true);

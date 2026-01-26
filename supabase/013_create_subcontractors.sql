-- Таблица субподрядчиков для хранения информации о компаниях, предоставивших цены на работы
CREATE TABLE subcontractors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kp_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарий к таблице
COMMENT ON TABLE subcontractors IS 'Субподрядчики - компании, предоставившие цены на работы для объектов';

-- Комментарии к столбцам
COMMENT ON COLUMN subcontractors.id IS 'Уникальный идентификатор субподрядчика';
COMMENT ON COLUMN subcontractors.object_id IS 'ID объекта, к которому привязан субподрядчик';
COMMENT ON COLUMN subcontractors.name IS 'Название компании субподрядчика';
COMMENT ON COLUMN subcontractors.kp_url IS 'Ссылка на коммерческое предложение (КП) в облачном хранилище';
COMMENT ON COLUMN subcontractors.created_at IS 'Дата и время создания записи';

-- Индекс для быстрого поиска по object_id
CREATE INDEX idx_subcontractors_object_id ON subcontractors(object_id);

-- RLS политики
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;

-- Политика для чтения (все могут читать)
CREATE POLICY "Allow public read access on subcontractors"
  ON subcontractors FOR SELECT
  USING (true);

-- Политика для вставки (все могут добавлять)
CREATE POLICY "Allow public insert access on subcontractors"
  ON subcontractors FOR INSERT
  WITH CHECK (true);

-- Политика для обновления (все могут обновлять)
CREATE POLICY "Allow public update access on subcontractors"
  ON subcontractors FOR UPDATE
  USING (true);

-- Политика для удаления (все могут удалять)
CREATE POLICY "Allow public delete access on subcontractors"
  ON subcontractors FOR DELETE
  USING (true);

-- Таблица чеклистов для объектов
CREATE TABLE IF NOT EXISTS checklists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  status TEXT,
  note TEXT DEFAULT '',
  custom_value TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(object_id, item_id)
);

-- Индекс для быстрого поиска по объекту
CREATE INDEX IF NOT EXISTS idx_checklists_object_id ON checklists(object_id);

-- RLS политики для checklists
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read checklists"
  ON checklists FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert checklists"
  ON checklists FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update checklists"
  ON checklists FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete checklists"
  ON checklists FOR DELETE
  TO public
  USING (true);

-- Добавить колонку image_url в calculation_items если её нет
ALTER TABLE calculation_items
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Создание таблицы статусов объектов
CREATE TABLE IF NOT EXISTS object_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарии к таблице и столбцам
COMMENT ON TABLE object_status IS 'Справочник статусов объектов (Тендер, Объекты СУ-10, Проиграли)';
COMMENT ON COLUMN object_status.id IS 'Уникальный идентификатор статуса';
COMMENT ON COLUMN object_status.name IS 'Название статуса (например: Тендер, Объекты СУ-10, Проиграли)';
COMMENT ON COLUMN object_status.created_at IS 'Дата и время создания записи';

-- Добавление столбца status_id в таблицу objects
ALTER TABLE objects ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES object_status(id);

-- Комментарий к новому столбцу
COMMENT ON COLUMN objects.status_id IS 'Ссылка на статус объекта из справочника object_status';

-- Вставка начальных статусов
INSERT INTO object_status (name) VALUES
  ('Тендер'),
  ('Объекты СУ-10'),
  ('Проиграли')
ON CONFLICT (name) DO NOTHING;

-- Создание индекса для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_objects_status_id ON objects(status_id);

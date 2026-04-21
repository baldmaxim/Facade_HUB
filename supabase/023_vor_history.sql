-- История скачанных заполненных ВОР по объектам.
-- Файл Excel сохраняется в bucket 'object-images' под префиксом 'vor-history/{object_id}/'.
-- Таблица хранит метаданные (ссылка на файл, stats генерации, время).
-- Позволяет откатиться к предыдущей версии ВОРа если новая перегенерация испортила что-то.

CREATE TABLE vor_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  stats JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vor_history IS 'История сгенерированных ВОР файлов по объектам';
COMMENT ON COLUMN vor_history.object_id IS 'Ссылка на объект';
COMMENT ON COLUMN vor_history.file_url IS 'Публичная ссылка на файл в Supabase Storage';
COMMENT ON COLUMN vor_history.file_name IS 'Имя файла для скачивания (для юзера)';
COMMENT ON COLUMN vor_history.file_path IS 'Путь в storage bucket (нужен для удаления)';
COMMENT ON COLUMN vor_history.size_bytes IS 'Размер файла в байтах';
COMMENT ON COLUMN vor_history.stats IS 'JSON со статистикой: totalPositions, matched, works, materials, rows, unmatched';
COMMENT ON COLUMN vor_history.created_at IS 'Когда сгенерирован';

CREATE INDEX idx_vor_history_object_id ON vor_history(object_id, created_at DESC);

ALTER TABLE vor_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all" ON vor_history FOR SELECT USING (true);
CREATE POLICY "Allow insert for all" ON vor_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete for all" ON vor_history FOR DELETE USING (true);

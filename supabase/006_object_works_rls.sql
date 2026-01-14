-- RLS политики для таблицы object_works (редактирование таблицы "Информация об объекте")
-- Выполните этот SQL в Supabase Dashboard → SQL Editor

-- Включаем RLS если ещё не включен
ALTER TABLE object_works ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики (если есть)
DROP POLICY IF EXISTS "Allow public read object_works" ON object_works;
DROP POLICY IF EXISTS "Allow public insert object_works" ON object_works;
DROP POLICY IF EXISTS "Allow public update object_works" ON object_works;
DROP POLICY IF EXISTS "Allow public delete object_works" ON object_works;

-- Создаём новые политики для публичного доступа
CREATE POLICY "Allow public read object_works"
  ON object_works FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert object_works"
  ON object_works FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update object_works"
  ON object_works FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete object_works"
  ON object_works FOR DELETE
  USING (true);

-- Также для work_types (справочник видов работ)
ALTER TABLE work_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read work_types" ON work_types;

CREATE POLICY "Allow public read work_types"
  ON work_types FOR SELECT
  USING (true);

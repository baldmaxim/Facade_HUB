-- =============================================
-- Row Level Security (RLS) policies
-- Разрешает публичный доступ к таблицам
-- =============================================

-- Включаем RLS
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_works ENABLE ROW LEVEL SECURITY;

-- Политики для objects
CREATE POLICY "Allow public read objects" ON objects FOR SELECT USING (true);
CREATE POLICY "Allow public insert objects" ON objects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update objects" ON objects FOR UPDATE USING (true);
CREATE POLICY "Allow public delete objects" ON objects FOR DELETE USING (true);

-- Политики для calculation_items
CREATE POLICY "Allow public read calculation_items" ON calculation_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert calculation_items" ON calculation_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update calculation_items" ON calculation_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete calculation_items" ON calculation_items FOR DELETE USING (true);

-- Политики для work_types (только чтение)
CREATE POLICY "Allow public read work_types" ON work_types FOR SELECT USING (true);

-- Политики для object_works
CREATE POLICY "Allow public read object_works" ON object_works FOR SELECT USING (true);
CREATE POLICY "Allow public insert object_works" ON object_works FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update object_works" ON object_works FOR UPDATE USING (true);
CREATE POLICY "Allow public delete object_works" ON object_works FOR DELETE USING (true);

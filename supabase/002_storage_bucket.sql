-- =============================================
-- Создание bucket для изображений объектов
-- =============================================
-- ВАЖНО: Этот код нужно выполнить в SQL Editor Supabase

INSERT INTO storage.buckets (id, name, public)
VALUES ('object-images', 'object-images', true);

-- =============================================
-- Политика доступа: разрешить публичное чтение
-- =============================================
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'object-images');

-- =============================================
-- Политика доступа: разрешить загрузку всем
-- =============================================
CREATE POLICY "Allow uploads"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'object-images');

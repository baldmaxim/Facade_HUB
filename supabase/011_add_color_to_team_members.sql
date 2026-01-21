-- =============================================
-- Миграция 011: Добавление поля color в team_members
-- =============================================

-- Добавляем колонку color в таблицу team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS color TEXT;

-- Комментарий к новой колонке
COMMENT ON COLUMN team_members.color IS 'Цвет для визуального выделения задач ответственного (hex формат, например #3b82f6)';

-- Устанавливаем цвета по умолчанию для существующих членов команды
-- Вячеслав Зинин - синий
-- Валерий Коваленко - фиолетовый
-- Никита Кузнецов - зеленый

UPDATE team_members SET color = '#3b82f6' WHERE name LIKE '%Вячеслав%' OR name LIKE '%Зинин%';
UPDATE team_members SET color = '#8b5cf6' WHERE name LIKE '%Валерий%' OR name LIKE '%Коваленко%';
UPDATE team_members SET color = '#10b981' WHERE name LIKE '%Никита%' OR name LIKE '%Кузнецов%';

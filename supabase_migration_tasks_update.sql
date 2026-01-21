-- Migration: Update tasks table structure
-- This migration updates the tasks table to support the new task management features

-- First, create team_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE team_members IS 'Члены команды для назначения задач';
COMMENT ON COLUMN team_members.id IS 'Уникальный идентификатор члена команды';
COMMENT ON COLUMN team_members.name IS 'Имя члена команды';
COMMENT ON COLUMN team_members.color IS 'Цвет для визуального отображения (hex формат, например #3b82f6)';
COMMENT ON COLUMN team_members.created_at IS 'Дата и время создания записи';

-- Insert default team members
INSERT INTO team_members (name, color) VALUES
  ('Вячеслав Зинин', '#3b82f6'),
  ('Валерий Коваленко', '#10b981'),
  ('Никита Кузнецов', '#8b5cf6')
ON CONFLICT DO NOTHING;

-- Update tasks table structure
-- Add new columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS order_number INTEGER,
  ADD COLUMN IF NOT EXISTS is_high_priority BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

-- Remove old responsible columns (if they exist)
ALTER TABLE tasks
  DROP COLUMN IF EXISTS responsible_zinin,
  DROP COLUMN IF EXISTS responsible_kovalenko,
  DROP COLUMN IF EXISTS responsible_kuznetsov;

-- Add comments to new columns
COMMENT ON COLUMN tasks.order_number IS 'Порядковый номер задачи';
COMMENT ON COLUMN tasks.is_high_priority IS 'Флаг высокой приоритетности задачи';
COMMENT ON COLUMN tasks.responsible_id IS 'ID ответственного из таблицы team_members';
COMMENT ON COLUMN tasks.deadline IS 'Срок выполнения задачи (дедлайн)';
COMMENT ON COLUMN tasks.is_completed IS 'Флаг выполнения задачи';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_object_order ON tasks(object_id, order_number);
CREATE INDEX IF NOT EXISTS idx_tasks_responsible ON tasks(responsible_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);

-- Update existing tasks to have order numbers (if any exist)
WITH numbered_tasks AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY object_id ORDER BY created_at) as rn
  FROM tasks
  WHERE order_number IS NULL
)
UPDATE tasks
SET order_number = numbered_tasks.rn
FROM numbered_tasks
WHERE tasks.id = numbered_tasks.id;

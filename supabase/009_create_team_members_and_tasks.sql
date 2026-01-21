-- =============================================
-- Миграция 009: Создание таблиц team_members и tasks
-- =============================================

-- Создаём таблицу членов команды
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарии к таблице team_members
COMMENT ON TABLE team_members IS 'Члены команды для назначения на задачи';
COMMENT ON COLUMN team_members.id IS 'Уникальный идентификатор члена команды';
COMMENT ON COLUMN team_members.name IS 'Имя члена команды';
COMMENT ON COLUMN team_members.color IS 'Цвет для визуального отображения в интерфейсе (hex формат, например #3b82f6)';
COMMENT ON COLUMN team_members.created_at IS 'Дата и время создания записи';

-- Добавляем членов команды по умолчанию
INSERT INTO team_members (name, color) VALUES
  ('Вячеслав Зинин', '#3b82f6'),
  ('Валерий Коваленко', '#10b981'),
  ('Никита Кузнецов', '#8b5cf6')
ON CONFLICT DO NOTHING;

-- Создаём таблицу задач
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  responsible_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  order_number INTEGER,
  is_high_priority BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deadline DATE,
  note TEXT,
  is_completed BOOLEAN DEFAULT FALSE
);

-- Комментарии к таблице tasks
COMMENT ON TABLE tasks IS 'Задачи по объектам с назначением ответственных';
COMMENT ON COLUMN tasks.id IS 'Уникальный идентификатор задачи';
COMMENT ON COLUMN tasks.object_id IS 'ID объекта, к которому относится задача (ссылка на objects)';
COMMENT ON COLUMN tasks.title IS 'Название/описание задачи';
COMMENT ON COLUMN tasks.responsible_id IS 'ID ответственного за выполнение задачи (ссылка на team_members)';
COMMENT ON COLUMN tasks.order_number IS 'Порядковый номер задачи в списке задач объекта';
COMMENT ON COLUMN tasks.is_high_priority IS 'Флаг высокой приоритетности задачи (красный флажок)';
COMMENT ON COLUMN tasks.created_at IS 'Дата и время постановки задачи';
COMMENT ON COLUMN tasks.deadline IS 'Срок выполнения задачи (дедлайн)';
COMMENT ON COLUMN tasks.note IS 'Примечание к задаче';
COMMENT ON COLUMN tasks.is_completed IS 'Чекбокс выполнения задачи (true - выполнена, false - в работе)';

-- Создаём индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_tasks_object_id ON tasks(object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_responsible_id ON tasks(responsible_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_object_order ON tasks(object_id, order_number);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);

-- Включаем Row Level Security (RLS)
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Политики для team_members: все могут читать
CREATE POLICY "Enable read access for all users on team_members" ON team_members
  FOR SELECT
  USING (true);

-- Политики для team_members: все могут создавать, обновлять, удалять
CREATE POLICY "Enable insert access for all users on team_members" ON team_members
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update access for all users on team_members" ON team_members
  FOR UPDATE
  USING (true);

CREATE POLICY "Enable delete access for all users on team_members" ON team_members
  FOR DELETE
  USING (true);

-- Политики для tasks: все могут читать
CREATE POLICY "Enable read access for all users on tasks" ON tasks
  FOR SELECT
  USING (true);

-- Политики для tasks: все могут создавать, обновлять, удалять
CREATE POLICY "Enable insert access for all users on tasks" ON tasks
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update access for all users on tasks" ON tasks
  FOR UPDATE
  USING (true);

CREATE POLICY "Enable delete access for all users on tasks" ON tasks
  FOR DELETE
  USING (true);

-- =============================================
-- Миграция 010: Создание таблицы tasks (задачи)
-- =============================================

-- Удаляем таблицу tasks если она существует (для чистой миграции)
DROP TABLE IF EXISTS tasks CASCADE;

-- Создаём таблицу задач
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deadline DATE,
  note TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  is_high_priority BOOLEAN DEFAULT FALSE,
  order_number INTEGER
);

-- Комментарии к таблице
COMMENT ON TABLE tasks IS 'Задачи по объектам с назначением ответственных из команды';

-- Комментарии к столбцам
COMMENT ON COLUMN tasks.id IS 'Уникальный идентификатор задачи';
COMMENT ON COLUMN tasks.name IS 'Название/описание задачи';
COMMENT ON COLUMN tasks.object_id IS 'ID объекта, к которому относится задача (ссылка на objects)';
COMMENT ON COLUMN tasks.team_member_id IS 'ID ответственного за выполнение задачи (ссылка на team_members)';
COMMENT ON COLUMN tasks.created_at IS 'Дата и время постановки задачи';
COMMENT ON COLUMN tasks.deadline IS 'Срок выполнения задачи (дедлайн)';
COMMENT ON COLUMN tasks.note IS 'Примечание к задаче';
COMMENT ON COLUMN tasks.is_completed IS 'Чекбокс выполнения задачи (true - выполнена, false - в работе)';
COMMENT ON COLUMN tasks.is_high_priority IS 'Чекбокс высокой приоритетности задачи (красный флажок)';
COMMENT ON COLUMN tasks.order_number IS 'Порядковый номер задачи в списке задач объекта';

-- Создаём индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_tasks_object_id ON tasks(object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team_member_id ON tasks(team_member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_object_order ON tasks(object_id, order_number);
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_is_high_priority ON tasks(is_high_priority);

-- Включаем Row Level Security (RLS)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Политики для tasks: все могут читать
CREATE POLICY "Enable read access for all users on tasks" ON tasks
  FOR SELECT
  USING (true);

-- Политики для tasks: все могут создавать
CREATE POLICY "Enable insert access for all users on tasks" ON tasks
  FOR INSERT
  WITH CHECK (true);

-- Политики для tasks: все могут обновлять
CREATE POLICY "Enable update access for all users on tasks" ON tasks
  FOR UPDATE
  USING (true);

-- Политики для tasks: все могут удалять
CREATE POLICY "Enable delete access for all users on tasks" ON tasks
  FOR DELETE
  USING (true);

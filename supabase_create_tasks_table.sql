-- Создание таблицы tasks для управления задачами по объектам
-- Эта таблица хранит задачи, назначенные членам команды для каждого объекта

-- Создаём таблицу tasks
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

-- Комментарии к таблице и столбцам
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

-- Политики безопасности Row Level Security (RLS)
-- Включаем RLS для таблицы tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Политика: все могут читать задачи
CREATE POLICY "Enable read access for all users" ON tasks
  FOR SELECT
  USING (true);

-- Политика: все могут создавать задачи
CREATE POLICY "Enable insert access for all users" ON tasks
  FOR INSERT
  WITH CHECK (true);

-- Политика: все могут обновлять задачи
CREATE POLICY "Enable update access for all users" ON tasks
  FOR UPDATE
  USING (true);

-- Политика: все могут удалять задачи
CREATE POLICY "Enable delete access for all users" ON tasks
  FOR DELETE
  USING (true);

-- =============================================
-- Миграция 012: Создание таблицы статусов задач
-- =============================================

-- Создаем таблицу статусов задач
CREATE TABLE IF NOT EXISTS task_statuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарии к таблице и столбцам
COMMENT ON TABLE task_statuses IS 'Статусы задач (Не начата, В процессе, Завершена, и т.д.)';
COMMENT ON COLUMN task_statuses.id IS 'Уникальный идентификатор статуса';
COMMENT ON COLUMN task_statuses.status IS 'Название статуса задачи';
COMMENT ON COLUMN task_statuses.created_at IS 'Дата и время создания записи';

-- Добавляем несколько статусов по умолчанию
INSERT INTO task_statuses (status) VALUES
  ('Не начата'),
  ('В процессе'),
  ('Завершена'),
  ('Отложена')
ON CONFLICT (status) DO NOTHING;

-- Добавляем столбец status_id в таблицу tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES task_statuses(id);

-- Комментарий к новому столбцу
COMMENT ON COLUMN tasks.status_id IS 'ID статуса задачи из таблицы task_statuses';

-- Создаем индекс для быстрого поиска по статусу
CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks(status_id);

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './TasksPreview.css';

function TasksPreview() {
  const [objectsWithTasks, setObjectsWithTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasksData();
  }, []);

  const loadTasksData = async () => {
    try {
      // 1. Загрузить все объекты
      const { data: objects, error: objectsError } = await supabase
        .from('objects')
        .select('id, name');

      if (objectsError) throw objectsError;

      // 2. Загрузить только активные задачи
      const { data: activeTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('object_id')
        .eq('is_completed', false);

      if (tasksError) throw tasksError;

      // 3. Группировка и подсчет на клиенте
      const taskCounts = (activeTasks || []).reduce((acc, task) => {
        acc[task.object_id] = (acc[task.object_id] || 0) + 1;
        return acc;
      }, {});

      // 4. Фильтрация: только объекты с активными задачами, сортировка по убыванию
      const objectsWithTasksData = (objects || [])
        .map(obj => ({
          ...obj,
          activeTasksCount: taskCounts[obj.id] || 0
        }))
        .filter(obj => obj.activeTasksCount > 0)
        .sort((a, b) => b.activeTasksCount - a.activeTasksCount);

      setObjectsWithTasks(objectsWithTasksData);
    } catch (err) {
      console.error('Ошибка загрузки задач:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTaskWord = (count) => {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return 'активных задач';
    }

    if (lastDigit === 1) {
      return 'активная задача';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return 'активные задачи';
    }

    return 'активных задач';
  };

  if (loading) {
    return (
      <section className="tasks-preview">
        <div className="tasks-preview-container">
          <p className="loading-text">Загрузка задач...</p>
        </div>
      </section>
    );
  }

  if (objectsWithTasks.length === 0) {
    return null; // Не показываем блок, если нет объектов с активными задачами
  }

  return (
    <section className="tasks-preview">
      <div className="tasks-preview-container">
        <div className="tasks-preview-header">
          <h2 className="tasks-preview-title">Активные задачи</h2>
          <Link to="/objects" className="tasks-preview-link">
            Перейти к объектам →
          </Link>
        </div>

        <div className="tasks-grid">
          {objectsWithTasks.map(obj => (
            <Link
              key={obj.id}
              to={`/objects/${obj.id}/tasks`}
              className="task-object-card"
            >
              <h3 className="task-object-name">{obj.name}</h3>
              <div className="task-count-wrapper">
                <span className="task-count">{obj.activeTasksCount}</span>
                <span className="task-count-label">
                  {getTaskWord(obj.activeTasksCount)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TasksPreview;

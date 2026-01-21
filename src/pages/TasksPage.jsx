import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './TasksPage.css';

function TasksPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newTask, setNewTask] = useState({
    title: '',
    responsible_zinin: false,
    responsible_kovalenko: false,
    responsible_kuznetsov: false,
    note: ''
  });

  useEffect(() => {
    async function loadData() {
      try {
        const { data: objectData, error: objectError } = await supabase
          .from('objects')
          .select('id, name')
          .eq('id', id)
          .single();

        if (objectError) throw objectError;
        setObject(objectData);

        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('object_id', id)
          .order('created_at', { ascending: true });

        if (tasksError) throw tasksError;
        setTasks(tasksData || []);
      } catch (err) {
        console.error('Ошибка загрузки:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          object_id: id,
          title: newTask.title.trim(),
          responsible_zinin: newTask.responsible_zinin,
          responsible_kovalenko: newTask.responsible_kovalenko,
          responsible_kuznetsov: newTask.responsible_kuznetsov,
          note: newTask.note.trim() || null
        }])
        .select()
        .single();

      if (error) throw error;

      setTasks([...tasks, data]);
      setNewTask({
        title: '',
        responsible_zinin: false,
        responsible_kovalenko: false,
        responsible_kuznetsov: false,
        note: ''
      });
    } catch (err) {
      alert('Ошибка добавления: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async (taskId, field, value) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ [field]: value })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(tasks.map(task =>
        task.id === taskId ? { ...task, [field]: value } : task
      ));
    } catch (err) {
      alert('Ошибка обновления: ' + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Удалить задачу?')) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      setTasks(tasks.filter(task => task.id !== taskId));
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  if (loading) {
    return (
      <main className="tasks-page">
        <div className="tasks-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tasks-page">
      <div className="tasks-container">
        <div className="tasks-header">
          <Link to={`/objects/${id}`} className="back-btn">
            ← Назад к объекту
          </Link>
          <div className="tasks-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Задачи</span>
          </div>
        </div>

        <h1 className="tasks-title">Задачи</h1>

        <div className="tasks-content">
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th className="col-task">Задача</th>
                  <th className="col-responsible" colSpan="3">Ответственный</th>
                  <th className="col-note">Примечание</th>
                  <th className="col-actions"></th>
                </tr>
                <tr className="sub-header">
                  <th></th>
                  <th className="col-person person-zinin">
                    <span className="person-dot"></span>
                    Вячеслав Зинин
                  </th>
                  <th className="col-person person-kovalenko">
                    <span className="person-dot"></span>
                    Валерий Коваленко
                  </th>
                  <th className="col-person person-kuznetsov">
                    <span className="person-dot"></span>
                    Никита Кузнецов
                  </th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {/* Строка добавления новой задачи */}
                <tr className="new-row">
                  <td>
                    <textarea
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      placeholder="Новая задача..."
                      className="task-input"
                      rows={2}
                    />
                  </td>
                  <td className="td-checkbox">
                    <label className="checkbox-label checkbox-zinin">
                      <input
                        type="checkbox"
                        checked={newTask.responsible_zinin}
                        onChange={(e) => setNewTask({ ...newTask, responsible_zinin: e.target.checked })}
                      />
                      <span className="checkmark"></span>
                    </label>
                  </td>
                  <td className="td-checkbox">
                    <label className="checkbox-label checkbox-kovalenko">
                      <input
                        type="checkbox"
                        checked={newTask.responsible_kovalenko}
                        onChange={(e) => setNewTask({ ...newTask, responsible_kovalenko: e.target.checked })}
                      />
                      <span className="checkmark"></span>
                    </label>
                  </td>
                  <td className="td-checkbox">
                    <label className="checkbox-label checkbox-kuznetsov">
                      <input
                        type="checkbox"
                        checked={newTask.responsible_kuznetsov}
                        onChange={(e) => setNewTask({ ...newTask, responsible_kuznetsov: e.target.checked })}
                      />
                      <span className="checkmark"></span>
                    </label>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={newTask.note}
                      onChange={(e) => setNewTask({ ...newTask, note: e.target.value })}
                      placeholder="Примечание..."
                      className="note-input"
                    />
                  </td>
                  <td className="td-actions">
                    <button
                      className="add-btn"
                      onClick={handleAddTask}
                      disabled={!newTask.title.trim() || saving}
                    >
                      {saving ? '...' : '+'}
                    </button>
                  </td>
                </tr>

                {/* Существующие задачи */}
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td>
                      <textarea
                        value={task.title}
                        onChange={(e) => handleUpdateTask(task.id, 'title', e.target.value)}
                        className="task-input"
                        rows={2}
                      />
                    </td>
                    <td className="td-checkbox">
                      <label className="checkbox-label checkbox-zinin">
                        <input
                          type="checkbox"
                          checked={task.responsible_zinin || false}
                          onChange={(e) => handleUpdateTask(task.id, 'responsible_zinin', e.target.checked)}
                        />
                        <span className="checkmark"></span>
                      </label>
                    </td>
                    <td className="td-checkbox">
                      <label className="checkbox-label checkbox-kovalenko">
                        <input
                          type="checkbox"
                          checked={task.responsible_kovalenko || false}
                          onChange={(e) => handleUpdateTask(task.id, 'responsible_kovalenko', e.target.checked)}
                        />
                        <span className="checkmark"></span>
                      </label>
                    </td>
                    <td className="td-checkbox">
                      <label className="checkbox-label checkbox-kuznetsov">
                        <input
                          type="checkbox"
                          checked={task.responsible_kuznetsov || false}
                          onChange={(e) => handleUpdateTask(task.id, 'responsible_kuznetsov', e.target.checked)}
                        />
                        <span className="checkmark"></span>
                      </label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={task.note || ''}
                        onChange={(e) => handleUpdateTask(task.id, 'note', e.target.value)}
                        placeholder="—"
                        className="note-input"
                      />
                    </td>
                    <td className="td-actions">
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteTask(task.id)}
                        title="Удалить"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}

                {tasks.length === 0 && (
                  <tr>
                    <td colSpan="6" className="empty-row">
                      Нет задач. Добавьте первую задачу выше.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export default TasksPage;

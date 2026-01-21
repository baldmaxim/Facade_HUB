import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './TasksPage.css';

function TasksPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newTask, setNewTask] = useState({
    name: '',
    team_member_id: '',
    is_high_priority: false,
    deadline: '',
    note: '',
    status_id: ''
  });

  // Ref для хранения таймеров дебаунса
  const updateTimersRef = useRef({});

  useEffect(() => {
    async function loadData() {
      try {
        const [objectData, tasksData, teamData, statusesData] = await Promise.all([
          supabase
            .from('objects')
            .select('id, name')
            .eq('id', id)
            .single(),
          supabase
            .from('tasks')
            .select('*, team_member:team_member_id(id, name, role, color), task_status:status_id(id, status)')
            .eq('object_id', id)
            .order('order_number', { ascending: true }),
          supabase
            .from('team_members')
            .select('id, name, role, color')
            .order('sort_order', { ascending: true }),
          supabase
            .from('task_statuses')
            .select('id, status')
            .order('created_at', { ascending: true })
        ]);

        if (objectData.error) throw objectData.error;
        if (tasksData.error) throw tasksData.error;
        if (teamData.error) throw teamData.error;
        if (statusesData.error) throw statusesData.error;

        setObject(objectData.data);
        setTasks(tasksData.data || []);
        setTeamMembers(teamData.data || []);
        setTaskStatuses(statusesData.data || []);

        // Устанавливаем статус "В процессе" по умолчанию для новой задачи
        const inProgressStatus = statusesData.data?.find(s => s.status.toLowerCase().includes('процесс'));
        if (inProgressStatus) {
          setNewTask(prev => ({ ...prev, status_id: inProgressStatus.id }));
        }
      } catch (err) {
        console.error('Ошибка загрузки:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  // Автоматически подстраиваем высоту textarea только при первой загрузке
  useEffect(() => {
    if (!loading && tasks.length > 0) {
      setTimeout(() => {
        const textareas = document.querySelectorAll('.task-input, .note-input');
        textareas.forEach(textarea => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
        });
      }, 0);
    }
  }, [loading]);

  const handleAddTask = async () => {
    if (!newTask.name.trim()) return;

    setSaving(true);
    try {
      // Вычисляем следующий order_number
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order_number || 0)) : 0;

      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          object_id: id,
          name: newTask.name.trim(),
          team_member_id: newTask.team_member_id || null,
          is_high_priority: newTask.is_high_priority,
          deadline: newTask.deadline || null,
          note: newTask.note.trim() || null,
          status_id: newTask.status_id || null,
          order_number: maxOrder + 1,
          is_completed: false
        }])
        .select('*, team_member:team_member_id(id, name, role, color), task_status:status_id(id, status)')
        .single();

      if (error) throw error;

      setTasks([...tasks, data]);
      // Сохраняем статус "В процессе" при сбросе формы
      const inProgressStatus = taskStatuses.find(s => s.status.toLowerCase().includes('процесс'));
      setNewTask({
        name: '',
        team_member_id: '',
        is_high_priority: false,
        deadline: '',
        note: '',
        status_id: inProgressStatus?.id || ''
      });
    } catch (err) {
      alert('Ошибка добавления: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async (taskId, field, value) => {
    // Определяем, нужно ли обновить статус на "Завершена"
    const completedStatus = taskStatuses.find(s => s.status.toLowerCase().includes('завершен'));
    const shouldUpdateStatus = field === 'is_completed' && value === true && completedStatus;

    // Сначала обновляем локальное состояние для мгновенного отклика
    setTasks(tasks.map(task => {
      if (task.id === taskId) {
        const updatedTask = { ...task, [field]: value };
        // Если обновляется team_member_id, обновляем и team_member
        if (field === 'team_member_id') {
          updatedTask.team_member = teamMembers.find(m => m.id === value) || null;
        }
        // Если обновляется status_id, обновляем и task_status
        if (field === 'status_id') {
          updatedTask.task_status = taskStatuses.find(s => s.id === value) || null;
        }
        // Если задача отмечается как выполненная, автоматически меняем статус на "Завершена"
        if (shouldUpdateStatus) {
          updatedTask.status_id = completedStatus.id;
          updatedTask.task_status = completedStatus;
        }
        return updatedTask;
      }
      return task;
    }));

    // Создаем ключ для таймера на основе taskId и field
    const timerKey = `${taskId}-${field}`;

    // Отменяем предыдущий таймер, если он существует
    if (updateTimersRef.current[timerKey]) {
      clearTimeout(updateTimersRef.current[timerKey]);
    }

    // Создаем новый таймер для дебаунса (500мс после последнего изменения)
    updateTimersRef.current[timerKey] = setTimeout(async () => {
      try {
        // Подготавливаем данные для обновления
        const updateData = { [field]: value };

        // Если задача отмечается как выполненная, также обновляем статус
        if (shouldUpdateStatus) {
          updateData.status_id = completedStatus.id;
        }

        const { error } = await supabase
          .from('tasks')
          .update(updateData)
          .eq('id', taskId);

        if (error) throw error;
      } catch (err) {
        alert('Ошибка обновления: ' + err.message);
        // При ошибке перезагружаем данные
        const { data } = await supabase
          .from('tasks')
          .select('*, team_member:team_member_id(id, name, role, color), task_status:status_id(id, status)')
          .eq('object_id', id)
          .order('order_number', { ascending: true });
        setTasks(data || []);
      } finally {
        delete updateTimersRef.current[timerKey];
      }
    }, 500);
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

  // Функция автоматического изменения высоты textarea
  const handleAutoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // Функция для получения цвета статуса
  const getStatusColor = (statusText) => {
    if (!statusText) return 'transparent';
    const lowerStatus = statusText.toLowerCase();
    if (lowerStatus.includes('процесс')) return '#3b82f6'; // синий
    if (lowerStatus.includes('отложен')) return '#eab308'; // желтый
    if (lowerStatus.includes('завершен')) return '#10b981'; // зеленый
    return '#6b7280'; // серый по умолчанию
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

        <h1 className="tasks-name">Задачи</h1>

        <div className="tasks-content">
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th className="col-number">№</th>
                  <th className="col-priority">Приоритет</th>
                  <th className="col-task">Задача</th>
                  <th className="col-responsible">Ответственный</th>
                  <th className="col-created">
                    <div>Дата</div>
                    <div>постановки</div>
                  </th>
                  <th className="col-deadline">Дедлайн</th>
                  <th className="col-note">Примечание к выполнению</th>
                  <th className="col-status">Статус</th>
                  <th className="col-completed">Выполнено</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {/* Существующие задачи */}
                {tasks.map((task, index) => (
                  <tr
                    key={task.id}
                    className={task.is_completed ? 'completed-task' : ''}
                    style={{
                      backgroundColor: task.team_member?.color ? `${task.team_member.color}20` : 'transparent'
                    }}
                  >
                    <td className="td-number">{task.order_number || index + 1}</td>
                    <td className="td-priority">
                      <label className="priority-flag">
                        <input
                          type="checkbox"
                          checked={task.is_high_priority || false}
                          onChange={(e) => handleUpdateTask(task.id, 'is_high_priority', e.target.checked)}
                        />
                        <span className="flag-icon">🚩</span>
                      </label>
                    </td>
                    <td>
                      <textarea
                        value={task.name}
                        onChange={(e) => {
                          handleUpdateTask(task.id, 'name', e.target.value);
                          handleAutoResize(e);
                        }}
                        onInput={handleAutoResize}
                        className="task-input"
                        rows={1}
                        style={{ overflow: 'hidden', resize: 'none' }}
                      />
                    </td>
                    <td>
                      <select
                        value={task.team_member_id || ''}
                        onChange={(e) => handleUpdateTask(task.id, 'team_member_id', e.target.value)}
                        className="responsible-select"
                      >
                        <option value="">Не назначен</option>
                        {teamMembers.map(member => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td-date">
                      {task.created_at ? new Date(task.created_at).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={task.deadline || ''}
                        onChange={(e) => handleUpdateTask(task.id, 'deadline', e.target.value)}
                        onClick={(e) => e.target.showPicker?.()}
                        onKeyDown={(e) => e.preventDefault()}
                        onKeyPress={(e) => e.preventDefault()}
                        onInput={(e) => {
                          if (e.nativeEvent.inputType === 'insertText' || e.nativeEvent.inputType === 'deleteContentBackward') {
                            e.preventDefault();
                          }
                        }}
                        className="date-input"
                      />
                    </td>
                    <td>
                      <textarea
                        value={task.note || ''}
                        onChange={(e) => {
                          handleUpdateTask(task.id, 'note', e.target.value);
                          handleAutoResize(e);
                        }}
                        onInput={handleAutoResize}
                        placeholder="—"
                        className="note-input"
                        rows={1}
                        style={{ overflow: 'hidden', resize: 'none' }}
                      />
                    </td>
                    <td>
                      <select
                        value={task.status_id || ''}
                        onChange={(e) => handleUpdateTask(task.id, 'status_id', e.target.value)}
                        className="status-select"
                        style={{
                          backgroundColor: task.task_status ? `${getStatusColor(task.task_status.status)}20` : 'transparent',
                          borderColor: task.task_status ? getStatusColor(task.task_status.status) : 'var(--color-border)'
                        }}
                      >
                        {taskStatuses.map(status => (
                          <option key={status.id} value={status.id}>
                            {status.status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td-checkbox">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={task.is_completed || false}
                          onChange={(e) => handleUpdateTask(task.id, 'is_completed', e.target.checked)}
                        />
                        <span className="checkmark"></span>
                      </label>
                    </td>
                    <td className="td-actions">
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteTask(task.id)}
                        name="Удалить"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}

                {tasks.length === 0 && (
                  <tr>
                    <td colSpan="10" className="empty-row">
                      Нет задач. Добавьте первую задачу ниже.
                    </td>
                  </tr>
                )}

                {/* Строка добавления новой задачи */}
                <tr className="new-row">
                  <td className="td-number">—</td>
                  <td className="td-priority">
                    <label className="priority-flag">
                      <input
                        type="checkbox"
                        checked={newTask.is_high_priority}
                        onChange={(e) => setNewTask({ ...newTask, is_high_priority: e.target.checked })}
                      />
                      <span className="flag-icon">🚩</span>
                    </label>
                  </td>
                  <td>
                    <textarea
                      value={newTask.name}
                      onChange={(e) => {
                        setNewTask({ ...newTask, name: e.target.value });
                        handleAutoResize(e);
                      }}
                      onInput={handleAutoResize}
                      placeholder="Новая задача..."
                      className="task-input"
                      rows={1}
                      style={{ overflow: 'hidden', resize: 'none' }}
                    />
                  </td>
                  <td>
                    <select
                      value={newTask.team_member_id}
                      onChange={(e) => setNewTask({ ...newTask, team_member_id: e.target.value })}
                      className="responsible-select"
                    >
                      <option value="">Не назначен</option>
                      {teamMembers.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td-date">—</td>
                  <td>
                    <input
                      type="date"
                      value={newTask.deadline}
                      onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      onClick={(e) => e.target.showPicker?.()}
                      onKeyDown={(e) => e.preventDefault()}
                      onKeyPress={(e) => e.preventDefault()}
                      onInput={(e) => {
                        if (e.nativeEvent.inputType === 'insertText' || e.nativeEvent.inputType === 'deleteContentBackward') {
                          e.preventDefault();
                        }
                      }}
                      className="date-input"
                    />
                  </td>
                  <td>
                    <textarea
                      value={newTask.note}
                      onChange={(e) => {
                        setNewTask({ ...newTask, note: e.target.value });
                        handleAutoResize(e);
                      }}
                      onInput={handleAutoResize}
                      placeholder="Примечание..."
                      className="note-input"
                      rows={1}
                      style={{ overflow: 'hidden', resize: 'none' }}
                    />
                  </td>
                  <td>
                    <select
                      value={newTask.status_id}
                      onChange={(e) => setNewTask({ ...newTask, status_id: e.target.value })}
                      className="status-select"
                      style={{
                        backgroundColor: newTask.status_id ? `${getStatusColor(taskStatuses.find(s => s.id === newTask.status_id)?.status)}20` : 'transparent',
                        borderColor: newTask.status_id ? getStatusColor(taskStatuses.find(s => s.id === newTask.status_id)?.status) : 'var(--color-border)'
                      }}
                    >
                      {taskStatuses.map(status => (
                        <option key={status.id} value={status.id}>
                          {status.status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td-checkbox">—</td>
                  <td className="td-actions">
                    <button
                      className="add-btn"
                      onClick={handleAddTask}
                      disabled={!newTask.name.trim() || saving}
                    >
                      {saving ? '...' : '+'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export default TasksPage;

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CHECKLIST_STATUS,
  STATUS_CONFIG,
  DEFAULT_CHECKLIST_ITEMS,
  createInitialChecklist
} from '../data/checklistItems';
import './SubPage.css';
import './ChecklistPage.css';

function ChecklistPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Загрузка данных объекта и чек-листа
  useEffect(() => {
    async function fetchData() {
      // Загружаем объект
      const { data: objectData } = await supabase
        .from('objects')
        .select('name')
        .eq('id', id)
        .single();
      setObject(objectData);

      // Загружаем чек-лист из Supabase
      const { data: checklistData } = await supabase
        .from('checklists')
        .select('*')
        .eq('object_id', id)
        .order('item_id', { ascending: true });

      if (checklistData && checklistData.length > 0) {
        // Маппим данные из БД на структуру чек-листа
        const mappedChecklist = DEFAULT_CHECKLIST_ITEMS.map(item => {
          const dbItem = checklistData.find(d => d.item_id === item.id);
          return {
            ...item,
            status: dbItem?.status || null,
            note: dbItem?.note || '',
            customValue: dbItem?.custom_value || ''
          };
        });
        setChecklist(mappedChecklist);
      } else {
        // Создаём начальный чек-лист
        setChecklist(createInitialChecklist(id));
      }

      setLoading(false);
    }
    fetchData();
  }, [id]);

  // Автосохранение с дебаунсом
  const saveChecklist = useCallback(async (items) => {
    setSaving(true);
    setSaved(false);

    const upsertData = items
      .filter(item => item.status || item.note || item.customValue)
      .map(item => ({
        object_id: id,
        item_id: item.id,
        status: item.status,
        note: item.note,
        custom_value: item.customValue
      }));

    if (upsertData.length > 0) {
      await supabase
        .from('checklists')
        .upsert(upsertData, { onConflict: 'object_id,item_id' });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [id]);

  // Обновление статуса элемента
  const handleStatusChange = (itemId, newStatus) => {
    const updated = checklist.map(item =>
      item.id === itemId ? { ...item, status: newStatus || null } : item
    );
    setChecklist(updated);
    saveChecklist(updated);
  };

  // Обновление примечания с дебаунсом
  const handleNoteChange = (itemId, newNote) => {
    const updated = checklist.map(item =>
      item.id === itemId ? { ...item, note: newNote } : item
    );
    setChecklist(updated);
  };

  // Сохранение при потере фокуса
  const handleNoteBlur = () => {
    saveChecklist(checklist);
  };

  // Получение CSS класса для статуса
  const getStatusClass = (status) => {
    if (!status) return '';
    const classMap = {
      [CHECKLIST_STATUS.ACCOUNTED]: 'status-accounted',
      [CHECKLIST_STATUS.NOT_ACCOUNTED]: 'status-not-accounted',
      [CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED]: 'status-missing-not-accounted',
      [CHECKLIST_STATUS.MISSING_BUT_ACCOUNTED]: 'status-missing-but-accounted',
      [CHECKLIST_STATUS.INSUFFICIENT_INFO]: 'status-insufficient-info'
    };
    return classMap[status] || '';
  };

  // Подсчёт статистики
  const stats = {
    total: checklist.length,
    accounted: checklist.filter(i => i.status === CHECKLIST_STATUS.ACCOUNTED).length,
    notAccounted: checklist.filter(i => i.status === CHECKLIST_STATUS.NOT_ACCOUNTED).length,
    pending: checklist.filter(i => !i.status).length
  };

  if (loading) {
    return (
      <main className="sub-page">
        <div className="sub-page-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="sub-page">
      <div className="sub-page-container">
        <div className="sub-page-header">
          <Link to={`/objects/${id}`} className="back-btn">
            &larr; Назад к объекту
          </Link>
          <div className="sub-page-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Чеклист</span>
          </div>
        </div>

        <h1 className="sub-page-title">Чеклист фасадного расчёта</h1>

        {/* Статистика */}
        <div className="checklist-stats">
          <div className="stat-card accounted">
            <div className="stat-value">{stats.accounted}</div>
            <div className="stat-label">Учтено</div>
          </div>
          <div className="stat-card not-accounted">
            <div className="stat-value">{stats.notAccounted}</div>
            <div className="stat-label">Не учтено</div>
          </div>
          <div className="stat-card pending">
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">Не заполнено</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Всего</div>
          </div>
        </div>

        <div className="sub-page-content">
          {/* Панель инструментов */}
          <div className="checklist-toolbar">
            <div className="toolbar-right">
              {saving && (
                <span className="saving-indicator">Сохранение...</span>
              )}
              {saved && (
                <span className="saving-indicator saved">Сохранено</span>
              )}
            </div>
          </div>

          {/* Легенда статусов */}
          <div className="status-legend">
            <div className="legend-item">
              <span className="legend-dot accounted"></span>
              <span>Учтено</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot not-accounted"></span>
              <span>Не учтено</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot missing-not-accounted"></span>
              <span>Отсутствует в проекте</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot missing-but-accounted"></span>
              <span>Отсутствует, но учтено</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot insufficient-info"></span>
              <span>Недостаточно информации</span>
            </div>
          </div>

          {/* Таблица чек-листа */}
          <div className="checklist-table-wrapper">
            <table className="checklist-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Элемент фасада</th>
                  <th>Статус</th>
                  <th>Примечание</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>
                      <span className="item-name">{item.name}</span>
                      {item.hint && (
                        <span className="item-hint">{item.hint}</span>
                      )}
                    </td>
                    <td>
                      <select
                        className={`status-select ${getStatusClass(item.status)}`}
                        value={item.status || ''}
                        onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      >
                        <option value="">Выберите...</option>
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <option key={key} value={key}>
                            {config.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="note-input"
                        placeholder="Добавить примечание..."
                        value={item.note}
                        onChange={(e) => handleNoteChange(item.id, e.target.value)}
                        onBlur={handleNoteBlur}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </main>
  );
}

export default ChecklistPage;

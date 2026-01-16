import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './SubPage.css';
import './ChecklistPage.css';

function ChecklistPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [facadeElements, setFacadeElements] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch object info
        const { data: objectData } = await supabase
          .from('objects')
          .select('id, name')
          .eq('id', id)
          .single();
        setObject(objectData);

        // Fetch facade elements
        const { data: elementsData } = await supabase
          .from('facade_element')
          .select('*')
          .order('name');
        setFacadeElements(elementsData || []);

        // Fetch statuses
        const { data: statusesData } = await supabase
          .from('status')
          .select('*')
          .order('name');
        setStatuses(statusesData || []);

        // Fetch existing checklist entries for this object
        const { data: existingData } = await supabase
          .from('checklist')
          .select('*')
          .eq('object_id', id);

        // Convert to map by facade_element_id
        const dataMap = {};
        (existingData || []).forEach(item => {
          dataMap[item.facade_element_id] = item;
        });
        setChecklistData(dataMap);

      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  // Get value for a facade element
  const getValue = (elementId, field) => {
    return checklistData[elementId]?.[field] || '';
  };

  // Handle status change
  const handleStatusChange = (elementId, statusId) => {
    setChecklistData(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        facade_element_id: elementId,
        status_id: statusId || null
      }
    }));
    setHasChanges(true);
  };

  // Handle note change
  const handleNoteChange = (elementId, note) => {
    setChecklistData(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        facade_element_id: elementId,
        note: note
      }
    }));
    setHasChanges(true);
  };

  // Save all changes
  const handleSave = async () => {
    setSaving(true);

    try {
      for (const elementId of Object.keys(checklistData)) {
        const data = checklistData[elementId];

        // Skip if no status and no note
        if (!data.status_id && !data.note) {
          continue;
        }

        const saveData = {
          object_id: id,
          facade_element_id: elementId,
          status_id: data.status_id || null,
          note: data.note || ''
        };

        if (data.id) {
          // Update existing
          await supabase
            .from('checklist')
            .update(saveData)
            .eq('id', data.id);
        } else {
          // Insert new
          const { data: newData } = await supabase
            .from('checklist')
            .insert(saveData)
            .select()
            .single();

          if (newData) {
            setChecklistData(prev => ({
              ...prev,
              [elementId]: { ...prev[elementId], id: newData.id }
            }));
          }
        }
      }

      setHasChanges(false);
      alert('Сохранено!');
    } catch (error) {
      alert('Ошибка сохранения: ' + error.message);
    }

    setSaving(false);
  };

  // Get status color class
  const getStatusClass = (statusId) => {
    if (!statusId) return '';
    const status = statuses.find(s => s.id === statusId);
    if (!status) return '';

    const name = status.name.toLowerCase();
    if (name.includes('учтено') && !name.includes('не')) return 'status-accounted';
    if (name.includes('не учтено')) return 'status-not-accounted';
    if (name.includes('отсутствует')) return 'status-missing';
    return '';
  };

  // Stats
  const stats = {
    total: facadeElements.length,
    withStatus: facadeElements.filter(el => checklistData[el.id]?.status_id).length,
    withoutStatus: facadeElements.filter(el => !checklistData[el.id]?.status_id).length
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

        <div className="checklist-title-row">
          <h1 className="sub-page-title">Чеклист фасадного расчёта</h1>
          <button
            className={`save-btn ${hasChanges ? 'has-changes' : ''}`}
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        <div className="checklist-stats">
          <div className="stat-card accounted">
            <div className="stat-value">{stats.withStatus}</div>
            <div className="stat-label">Заполнено</div>
          </div>
          <div className="stat-card pending">
            <div className="stat-value">{stats.withoutStatus}</div>
            <div className="stat-label">Не заполнено</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Всего</div>
          </div>
        </div>

        <div className="sub-page-content">
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
                {facadeElements.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="empty-row">
                      Нет элементов фасада. Добавьте их в разделе Управление.
                    </td>
                  </tr>
                ) : (
                  facadeElements.map((element, index) => (
                    <tr key={element.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="item-name">{element.name}</span>
                      </td>
                      <td>
                        <select
                          className={`status-select ${getStatusClass(getValue(element.id, 'status_id'))}`}
                          value={getValue(element.id, 'status_id')}
                          onChange={(e) => handleStatusChange(element.id, e.target.value)}
                        >
                          <option value="">Выберите...</option>
                          {statuses.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="note-input"
                          placeholder="Добавить примечание..."
                          value={getValue(element.id, 'note')}
                          onChange={(e) => handleNoteChange(element.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ChecklistPage;

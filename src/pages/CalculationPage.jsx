import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectName } from '../api/objects';
import {
  fetchCalculationItems,
  createCalculationItem,
  updateCalculationItem,
  deleteCalculationItem
} from '../api/calculations';
import './CalculationPage.css';

const WORK_TYPES = [
  '11.01. Устройство мокрого фасада',
  '11.02. Облицовка НВФ',
  '11.03. Подсистема НВФ + утеплитель',
  '11.04. Светопрозрачные конструкции',
  '11.05. Фурнитура',
  '11.06. Профиль алюминиевый',
  '11.07. Профиль ПВХ',
  '11.08. Тамбура (1-ые этажи и БКФН)',
  '11.09. Двери наружные по фасаду (входные и БКФН, тамбурные двери)',
  '11.10. Защита светопрозрачных конструкций',
  '11.11. СОФ',
  '11.12. Леса и люльки',
  '11.13. Ограждения, козырьки, маркизы',
  '1.1.11. Финишный клининг (фасада, светопрозрачки, отделки, покрытий благоустройства)',
  '12.09.06. МОКАП',
  '19.1. Разработка РД (включая КМД на фасады) и авторский надзор',
  '19.6. Научно-техническое сопровождение строительства'
];

function CalculationPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newItem, setNewItem] = useState({
    svor_code: '',
    work_type: '',
    note: ''
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [objectData, itemsData] = await Promise.all([
          fetchObjectName(id),
          fetchCalculationItems(id)
        ]);
        setObject(objectData);
        setItems(itemsData);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleAddItem = async () => {
    if (!newItem.work_type) return;

    setSaving(true);
    try {
      const data = await createCalculationItem({
        object_id: id,
        svor_code: newItem.svor_code,
        work_type: newItem.work_type,
        note: newItem.note
      });
      setItems([...items, data]);
      setNewItem({ svor_code: '', work_type: '', note: '' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    const confirmed = window.confirm('Вы уверены, что хотите удалить эту запись?');
    if (!confirmed) return;

    try {
      await deleteCalculationItem(itemId);
      setItems(items.filter(item => item.id !== itemId));
    } catch (error) {
      alert('Ошибка удаления: ' + error.message);
    }
  };

  const handleUpdateItem = async (itemId, field, value) => {
    try {
      await updateCalculationItem(itemId, field, value);
      setItems(items.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      ));
    } catch (error) {
      alert('Ошибка сохранения: ' + error.message);
    }
  };

  if (loading) {
    return (
      <main className="calculation-page">
        <div className="calculation-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="calculation-page">
      <div className="calculation-container">
        <div className="calculation-header">
          <Link to={`/objects/${id}`} className="back-btn">
            ← Назад к объекту
          </Link>
          <div className="calculation-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Нюансы расчёта</span>
          </div>
        </div>

        <h1 className="calculation-title">Нюансы расчёта</h1>

        <div className="calculation-content">
          <div className="table-wrapper">
            <table className="calculation-table">
              <thead>
                <tr>
                  <th className="col-code">Код СВОР</th>
                  <th className="col-work">Вид работ</th>
                  <th className="col-note">Примечание</th>
                  <th className="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="td-code">
                      <textarea
                        value={item.svor_code || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'svor_code', e.target.value)}
                        className="table-textarea table-textarea-code"
                        placeholder="—"
                        rows={1}
                      />
                    </td>
                    <td className="td-work">
                      <select
                        value={item.work_type}
                        onChange={(e) => handleUpdateItem(item.id, 'work_type', e.target.value)}
                        className="table-select"
                      >
                        {WORK_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-note">
                      <textarea
                        value={item.note || ''}
                        onChange={(e) => handleUpdateItem(item.id, 'note', e.target.value)}
                        className="table-textarea table-textarea-note"
                        placeholder="Введите примечание"
                        rows={3}
                      />
                    </td>
                    <td className="td-actions">
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteItem(item.id)}
                        title="Удалить"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="new-row">
                  <td className="td-code">
                    <textarea
                      value={newItem.svor_code}
                      onChange={(e) => setNewItem({ ...newItem, svor_code: e.target.value })}
                      className="table-textarea table-textarea-code"
                      placeholder="Код"
                      rows={1}
                    />
                  </td>
                  <td className="td-work">
                    <select
                      value={newItem.work_type}
                      onChange={(e) => setNewItem({ ...newItem, work_type: e.target.value })}
                      className="table-select"
                    >
                      <option value="">Выберите вид работ...</option>
                      {WORK_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td-note">
                    <textarea
                      value={newItem.note}
                      onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
                      className="table-textarea table-textarea-note"
                      placeholder="Примечание"
                      rows={3}
                    />
                  </td>
                  <td className="td-actions">
                    <button
                      className="add-btn"
                      onClick={handleAddItem}
                      disabled={!newItem.work_type || saving}
                    >
                      +
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {items.length === 0 && (
            <p className="empty-text">
              Нет записей. Добавьте первую запись, выбрав вид работ.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default CalculationPage;

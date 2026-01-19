import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAllWorkTypes, fetchWorkPrices, upsertWorkPrice } from '../api/workPrices';
import { fetchObjectById } from '../api/objects';
import './WorkPricesPage.css';

function WorkPricesPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [workTypes, setWorkTypes] = useState([]);
  const [workPrices, setWorkPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [objectData, workTypesData, workPricesData] = await Promise.all([
        fetchObjectById(id),
        fetchAllWorkTypes(),
        fetchWorkPrices(id)
      ]);

      setObject(objectData);
      setWorkTypes(workTypesData);

      // Преобразуем массив цен в объект для удобного доступа
      const pricesMap = {};
      workPricesData.forEach(item => {
        pricesMap[item.work_type_id] = item.price;
      });
      setWorkPrices(pricesMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handlePriceChange = async (workTypeId, value) => {
    // Обновляем локальное состояние сразу для отзывчивости UI
    setWorkPrices(prev => ({
      ...prev,
      [workTypeId]: value
    }));

    // Сохраняем в базу данных
    try {
      const price = parseFloat(value) || 0;
      await upsertWorkPrice(id, workTypeId, price);
    } catch (err) {
      console.error('Ошибка сохранения цены:', err);
      setError('Ошибка сохранения цены');
    }
  };

  if (loading) {
    return (
      <main className="work-prices-page">
        <div className="work-prices-container">
          <p className="loading-text">Загрузка...</p>
        </div>
      </main>
    );
  }

  if (error || !object) {
    return (
      <main className="work-prices-page">
        <div className="work-prices-container">
          <p className="error-text">{error || 'Объект не найден'}</p>
          <Link to={`/objects/${id}`} className="back-link">Вернуться к объекту</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="work-prices-page">
      <div className="work-prices-container">
        <div className="work-prices-header">
          <div className="header-content">
            <Link to={`/objects/${id}`} className="back-link-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </Link>
            <div className="header-text">
              <h1 className="page-title">Цены работ</h1>
              <p className="page-subtitle">{object.name}</p>
            </div>
          </div>
        </div>

        <div className="work-prices-table-wrapper">
          <table className="work-prices-table">
            <thead>
              <tr>
                <th className="col-number">№</th>
                <th className="col-name">Вид работ</th>
                <th className="col-unit">Единица измерения</th>
                <th className="col-price">Цена, ₽</th>
              </tr>
            </thead>
            <tbody>
              {workTypes.map((workType, index) => (
                <tr key={workType.id}>
                  <td className="work-number">{index + 1}</td>
                  <td className="work-name">{workType.name}</td>
                  <td className="work-unit">{workType.unit?.name || '—'}</td>
                  <td className="work-price-cell">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={workPrices[workType.id] || ''}
                      onChange={(e) => handlePriceChange(workType.id, e.target.value)}
                      placeholder="0.00"
                      className="price-input"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {workTypes.length === 0 && (
          <div className="empty-state">
            <p>Нет доступных видов работ</p>
            <p className="empty-hint">Добавьте виды работ в панели администратора</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default WorkPricesPage;

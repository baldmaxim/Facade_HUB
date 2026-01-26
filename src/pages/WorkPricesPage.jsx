import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchAllWorkTypes, fetchWorkPrices, upsertWorkPrice } from '../api/workPrices';
import { fetchObjectById } from '../api/objects';
import { fetchSubcontractor, upsertSubcontractor } from '../api/subcontractors';
import './WorkPricesPage.css';

function WorkPricesPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [workTypes, setWorkTypes] = useState([]);
  const [workPrices, setWorkPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showOnlyFilled, setShowOnlyFilled] = useState(false);
  const [subcontractor, setSubcontractor] = useState({ name: '', kp_url: '' });
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [objectData, workTypesData, workPricesData, subcontractorData] = await Promise.all([
        fetchObjectById(id),
        fetchAllWorkTypes(),
        fetchWorkPrices(id),
        fetchSubcontractor(id)
      ]);

      setObject(objectData);
      setWorkTypes(workTypesData);

      // Преобразуем массив цен в объект для удобного доступа
      const pricesMap = {};
      workPricesData.forEach(item => {
        pricesMap[item.work_type_id] = item.price;
      });
      setWorkPrices(pricesMap);

      // Устанавливаем данные субподрядчика
      if (subcontractorData) {
        setSubcontractor({
          name: subcontractorData.name || '',
          kp_url: subcontractorData.kp_url || ''
        });
      }
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

  const handleSubcontractorChange = (field, value) => {
    setSubcontractor(prev => ({
      ...prev,
      [field]: value
    }));

    // Debounced сохранение
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const newData = { ...subcontractor, [field]: value };
        await upsertSubcontractor(id, newData.name, newData.kp_url);
      } catch (err) {
        console.error('Ошибка сохранения подрядчика:', err);
      }
    }, 500);
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

  // Фильтруем работы если включен режим "только заполненные"
  const filteredWorkTypes = showOnlyFilled
    ? workTypes.filter(wt => workPrices[wt.id] && parseFloat(workPrices[wt.id]) > 0)
    : workTypes;

  // Группируем работы по категориям
  const groupedWorkTypes = filteredWorkTypes.reduce((acc, workType) => {
    const category = workType.category || 'Прочие работы';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(workType);
    return acc;
  }, {});

  // Определяем порядок категорий
  const categoryOrder = [
    'Подсистема',
    'Остекление',
    'СОФ',
    'Облицовка',
    'Утепление и изоляция',
    'Профили и элементы',
    'Доборные элементы',
    'Прочие работы'
  ];

  // Сортируем категории по заданному порядку
  const sortedCategories = Object.keys(groupedWorkTypes).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  let rowNumber = 0;

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
              <h1 className="page-title">Цены работ на тендере</h1>
              <p className="page-subtitle">{object.name}</p>
            </div>
          </div>
        </div>

        <div className="subcontractor-section">
          <div className="subcontractor-fields">
            <div className="subcontractor-field">
              <label>Подрядчик</label>
              <input
                type="text"
                value={subcontractor.name}
                onChange={(e) => handleSubcontractorChange('name', e.target.value)}
                placeholder="Название компании"
                className="subcontractor-input"
              />
            </div>
            <div className="subcontractor-field">
              <label>Ссылка на КП</label>
              <div className="kp-url-wrapper">
                <input
                  type="url"
                  value={subcontractor.kp_url}
                  onChange={(e) => handleSubcontractorChange('kp_url', e.target.value)}
                  placeholder="https://..."
                  className="subcontractor-input"
                />
                {subcontractor.kp_url && (
                  <a
                    href={subcontractor.kp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kp-url-link"
                    title="Открыть КП"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-actions">
          <button
            className={`filter-btn ${!showOnlyFilled ? 'active' : ''}`}
            onClick={() => setShowOnlyFilled(!showOnlyFilled)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            {showOnlyFilled ? 'Показать все' : 'Только заполненные'}
          </button>
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
              {sortedCategories.map((category) => (
                <React.Fragment key={`category-${category}`}>
                  <tr className="category-row">
                    <td colSpan="4" className="category-cell">
                      {category}
                    </td>
                  </tr>
                  {groupedWorkTypes[category].map((workType) => {
                    rowNumber++;
                    return (
                      <tr key={workType.id} className="work-row">
                        <td className="work-number">{rowNumber}</td>
                        <td className="work-name">{workType.name}</td>
                        <td className="work-unit">{workType.unit?.name || '—'}</td>
                        <td className="work-price-cell">
                          <input
                            type="number"
                            min="0"
                            value={workPrices[workType.id] || ''}
                            onChange={(e) => handlePriceChange(workType.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                              }
                            }}
                            placeholder="0"
                            className="price-input"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
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

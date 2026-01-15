import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './ObjectInfoPage.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function ObjectInfoPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [costTypes, setCostTypes] = useState([]);
  const [costsData, setCostsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: objectData } = await supabase
        .from('objects')
        .select('*')
        .eq('id', id)
        .single();

      setObject(objectData);

      const { data: costTypesData } = await supabase
        .from('cost_types')
        .select('*')
        .order('id');

      setCostTypes(costTypesData || []);

      const { data: objectCostsData } = await supabase
        .from('object_costs')
        .select('*')
        .eq('object_id', id);

      // Преобразуем в объект для удобства
      const costsMap = {};
      (objectCostsData || []).forEach(cost => {
        costsMap[cost.cost_type_id] = cost;
      });
      setCostsData(costsMap);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const getCostValue = (costTypeId, field) => {
    return costsData[costTypeId]?.[field] || '';
  };

  const handleInputChange = (costTypeId, field, value) => {
    const numValue = value === '' ? null : parseFloat(value);

    setCostsData(prev => {
      const existing = prev[costTypeId] || {};
      const updated = { ...existing, [field]: numValue };

      // Пересчитываем итоги
      const volume = field === 'volume' ? numValue : (existing.volume || 0);
      const worksPerUnit = field === 'works_per_unit' ? numValue : (existing.works_per_unit || 0);
      const materialsPerUnit = field === 'materials_per_unit' ? numValue : (existing.materials_per_unit || 0);

      const v = parseFloat(volume) || 0;
      const w = parseFloat(worksPerUnit) || 0;
      const m = parseFloat(materialsPerUnit) || 0;

      updated.summ_per_unit = w + m;
      updated.works_summ = v * w;
      updated.materials_summ = v * m;
      updated.summ_works_and_materials = v * (w + m);

      return { ...prev, [costTypeId]: updated };
    });

    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    let hasError = false;

    try {
      for (const costTypeId of Object.keys(costsData)) {
        const data = costsData[costTypeId];

        // Пропускаем если нет данных
        if (!data.volume && !data.works_per_unit && !data.materials_per_unit) {
          continue;
        }

        const saveData = {
          object_id: id,
          cost_type_id: parseInt(costTypeId),
          volume: data.volume || 0,
          works_per_unit: data.works_per_unit || 0,
          materials_per_unit: data.materials_per_unit || 0,
          summ_per_unit: data.summ_per_unit || 0,
          works_summ: data.works_summ || 0,
          materials_summ: data.materials_summ || 0,
          summ_works_and_materials: data.summ_works_and_materials || 0
        };

        if (data.id) {
          // Обновляем существующую запись
          const { error } = await supabase
            .from('object_costs')
            .update(saveData)
            .eq('id', data.id);

          if (error) {
            console.error('Ошибка обновления:', error);
            hasError = true;
          }
        } else {
          // Создаем новую запись
          const { data: newData, error } = await supabase
            .from('object_costs')
            .insert(saveData)
            .select()
            .single();

          if (error) {
            console.error('Ошибка создания:', error);
            hasError = true;
          } else if (newData) {
            setCostsData(prev => ({
              ...prev,
              [costTypeId]: { ...prev[costTypeId], id: newData.id }
            }));
          }
        }
      }

      if (hasError) {
        alert('Произошла ошибка при сохранении. Проверьте консоль.');
      } else {
        alert('Данные сохранены!');
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Ошибка:', err);
      alert('Произошла ошибка: ' + err.message);
    }

    setSaving(false);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === 0) return '—';
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  if (loading) {
    return (
      <main className="object-info-page">
        <div className="object-info-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="object-info-page">
      <div className="object-info-container">
        <div className="object-info-header">
          <Link to={`/objects/${id}`} className="back-btn">
            &larr; Назад к объекту
          </Link>
          <div className="object-info-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Информация об объекте</span>
          </div>
        </div>

        <div className="object-info-title-row">
          <h1 className="object-info-title">Анализ цен материалов и работ</h1>
          <button
            className={`save-btn ${hasChanges ? 'has-changes' : ''}`}
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        <div className="object-info-content">
          <div className="costs-table-wrapper">
            <table className="costs-table">
              <thead>
                <tr>
                  <th>Вид затрат</th>
                  <th>Объем</th>
                  <th>Работы за ед.</th>
                  <th>Материалы за ед.</th>
                  <th>Итого за ед.</th>
                  <th>Итого работы</th>
                  <th>Итого материалы</th>
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                {costTypes.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-row">Нет видов затрат</td>
                  </tr>
                ) : (
                  costTypes.map((costType) => {
                    const data = costsData[costType.id] || {};

                    return (
                      <tr key={costType.id}>
                        <td className="name-cell">{costType.name}</td>
                        <td>
                          <input
                            type="number"
                            className="cost-input"
                            value={getCostValue(costType.id, 'volume')}
                            onChange={(e) => handleInputChange(costType.id, 'volume', e.target.value)}
                            placeholder="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="cost-input"
                            value={getCostValue(costType.id, 'works_per_unit')}
                            onChange={(e) => handleInputChange(costType.id, 'works_per_unit', e.target.value)}
                            placeholder="0"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="cost-input"
                            value={getCostValue(costType.id, 'materials_per_unit')}
                            onChange={(e) => handleInputChange(costType.id, 'materials_per_unit', e.target.value)}
                            placeholder="0"
                            step="0.01"
                          />
                        </td>
                        <td className="calc-cell">{formatNumber(data.summ_per_unit)}</td>
                        <td className="calc-cell">{formatNumber(data.works_summ)}</td>
                        <td className="calc-cell">{formatNumber(data.materials_summ)}</td>
                        <td className="total-cell">{formatNumber(data.summ_works_and_materials)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* График затрат */}
          <div className="costs-chart-wrapper">
            <h2 className="costs-chart-title">График затрат</h2>
            <div className="costs-chart">
              <Bar
                data={{
                  labels: costTypes
                    .filter(ct => costsData[ct.id]?.summ_works_and_materials > 0)
                    .map(ct => ct.name),
                  datasets: [
                    {
                      label: 'Итого стоимость',
                      data: costTypes
                        .filter(ct => costsData[ct.id]?.summ_works_and_materials > 0)
                        .map(ct => costsData[ct.id]?.summ_works_and_materials || 0),
                      backgroundColor: 'rgba(102, 126, 234, 0.7)',
                      borderColor: 'rgba(102, 126, 234, 1)',
                      borderWidth: 1,
                      borderRadius: 4,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: {
                    padding: {
                      bottom: 60,
                      left: 20,
                      right: 20,
                      top: 20
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    },
                    title: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const value = context.parsed.y;
                          return new Intl.NumberFormat('ru-RU', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          }).format(value) + ' ₽';
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      grid: {
                        display: false
                      },
                      ticks: {
                        color: '#6b7280',
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 10
                      }
                    },
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      },
                      ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                          return new Intl.NumberFormat('ru-RU', {
                            notation: 'compact',
                            compactDisplay: 'short'
                          }).format(value);
                        }
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ObjectInfoPage;

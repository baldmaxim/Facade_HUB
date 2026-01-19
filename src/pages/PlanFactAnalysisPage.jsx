import { useState, useEffect } from 'react';
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
import './PlanFactAnalysisPage.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function PlanFactAnalysisPage() {
  const [objects, setObjects] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparisonData, setComparisonData] = useState(null);
  const [isObjectDropdownOpen, setIsObjectDropdownOpen] = useState(false);
  const [isWorkTypeDropdownOpen, setIsWorkTypeDropdownOpen] = useState(false);
  const [volumeTender, setVolumeTender] = useState('');
  const [volumeFact, setVolumeFact] = useState('');

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [objectsData, workTypesData] = await Promise.all([
          supabase
            .from('objects')
            .select('id, name, object_status(id, name)')
            .order('name'),
          supabase.from('work_types').select('id, name, unit:unit_id(id, name)').order('name')
        ]);

        if (objectsData.error) throw objectsData.error;
        if (workTypesData.error) throw workTypesData.error;

        // Фильтруем только объекты со статусом "Объекты СУ-10"
        const filteredObjects = (objectsData.data || []).filter(
          obj => obj.object_status?.name === 'Объекты СУ-10'
        );

        setObjects(filteredObjects);
        setWorkTypes(workTypesData.data || []);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedObjectId && selectedWorkTypeId) {
      loadComparisonData();
    } else {
      setComparisonData(null);
    }
  }, [selectedObjectId, selectedWorkTypeId]);

  async function loadComparisonData() {
    try {
      setLoading(true);

      // Получаем тендерную цену
      const { data: tenderData, error: tenderError } = await supabase
        .from('work_price_tender')
        .select('price')
        .eq('object_id', selectedObjectId)
        .eq('work_type_id', selectedWorkTypeId)
        .maybeSingle();

      if (tenderError) throw tenderError;

      // Получаем фактическую цену
      const { data: factData, error: factError } = await supabase
        .from('work_price_fact')
        .select('price')
        .eq('object_id', selectedObjectId)
        .eq('work_type_id', selectedWorkTypeId)
        .maybeSingle();

      if (factError) throw factError;

      const tenderPrice = tenderData?.price || 0;
      const factPrice = factData?.price || 0;
      const difference = factPrice - tenderPrice;
      const percentDifference = tenderPrice > 0 ? ((difference / tenderPrice) * 100) : 0;

      setComparisonData({
        tenderPrice,
        factPrice,
        difference,
        percentDifference
      });
    } catch (error) {
      console.error('Ошибка загрузки данных сравнения:', error);
    } finally {
      setLoading(false);
    }
  }

  const selectedObject = objects.find(obj => obj.id === selectedObjectId);
  const selectedWorkType = workTypes.find(wt => wt.id === selectedWorkTypeId);

  const chartData = comparisonData ? {
    labels: ['Тендерная цена', 'Фактическая цена'],
    datasets: [{
      label: 'Цена, ₽',
      data: [comparisonData.tenderPrice, comparisonData.factPrice],
      backgroundColor: [
        'rgba(102, 126, 234, 0.8)',
        'rgba(16, 185, 129, 0.8)'
      ],
      borderColor: [
        'rgba(102, 126, 234, 1)',
        'rgba(16, 185, 129, 1)'
      ],
      borderWidth: 2,
      borderRadius: 8
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 13 },
        callbacks: {
          label: function(context) {
            return `${context.parsed.y.toLocaleString('ru-RU')} ₽`;
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
          font: { size: 12 },
          color: '#666'
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: { size: 11 },
          color: '#666',
          callback: function(value) {
            return value.toLocaleString('ru-RU') + ' ₽';
          }
        }
      }
    }
  };

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isObjectDropdownOpen && !event.target.closest('.custom-select.object-select')) {
        setIsObjectDropdownOpen(false);
      }
      if (isWorkTypeDropdownOpen && !event.target.closest('.custom-select.work-type-select')) {
        setIsWorkTypeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isObjectDropdownOpen, isWorkTypeDropdownOpen]);

  return (
    <div className="plan-fact-analysis-page">
      <h1 className="page-title">Анализ тендерной и фактической стоимости фасадных работ</h1>
      <p className="page-subtitle">Сравнение плановых и фактических цен работ по объектам</p>

      <div className="analysis-controls">
        <div className="custom-select object-select">
          <div
            className="custom-select-trigger"
            onClick={() => !loading && setIsObjectDropdownOpen(!isObjectDropdownOpen)}
          >
            <span className="custom-select-value">
              {selectedObject?.name || 'Выберите объект'}
            </span>
            <svg
              className={`custom-select-arrow ${isObjectDropdownOpen ? 'open' : ''}`}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          {isObjectDropdownOpen && (
            <div className="custom-select-dropdown">
              <div
                className="custom-select-option"
                onClick={() => {
                  setSelectedObjectId('');
                  setIsObjectDropdownOpen(false);
                }}
              >
                Выберите объект
              </div>
              {objects.map((obj) => (
                <div
                  key={obj.id}
                  className={`custom-select-option ${obj.id === selectedObjectId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedObjectId(obj.id);
                    setIsObjectDropdownOpen(false);
                  }}
                >
                  {obj.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="custom-select work-type-select">
          <div
            className="custom-select-trigger"
            onClick={() => !loading && setIsWorkTypeDropdownOpen(!isWorkTypeDropdownOpen)}
          >
            <span className="custom-select-value">
              {selectedWorkType?.name || 'Выберите вид работ'}
            </span>
            <svg
              className={`custom-select-arrow ${isWorkTypeDropdownOpen ? 'open' : ''}`}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          {isWorkTypeDropdownOpen && (
            <div className="custom-select-dropdown">
              <div
                className="custom-select-option"
                onClick={() => {
                  setSelectedWorkTypeId('');
                  setIsWorkTypeDropdownOpen(false);
                }}
              >
                Выберите вид работ
              </div>
              {workTypes.map((wt) => (
                <div
                  key={wt.id}
                  className={`custom-select-option ${wt.id === selectedWorkTypeId ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedWorkTypeId(wt.id);
                    setIsWorkTypeDropdownOpen(false);
                  }}
                >
                  {wt.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {comparisonData && (
        <div className="comparison-results">
          <div className="comparison-table">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th>Тендерная цена</th>
                  <th>Фактическая цена</th>
                  <th>Отклонение</th>
                  <th>Отклонение, %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="metric-name">{selectedWorkType?.name}</td>
                  <td className="price-cell tender">
                    {comparisonData.tenderPrice.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className="price-cell fact">
                    {comparisonData.factPrice.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className={`difference-cell ${comparisonData.difference >= 0 ? 'positive' : 'negative'}`}>
                    {comparisonData.difference >= 0 ? '+' : ''}
                    {comparisonData.difference.toLocaleString('ru-RU')} ₽
                  </td>
                  <td className={`difference-cell ${comparisonData.percentDifference >= 0 ? 'positive' : 'negative'}`}>
                    {comparisonData.percentDifference >= 0 ? '+' : ''}
                    {comparisonData.percentDifference.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="comparison-chart">
            <h2 className="chart-title">Сравнение цен</h2>
            <div className="chart-wrapper">
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Блок ввода объемов */}
          <div className="volume-inputs">
            <h2 className="section-title">Объемы работ</h2>
            <div className="volume-fields">
              <div className="volume-field">
                <label htmlFor="volume-tender">Объем тендер ({selectedWorkType?.unit?.name || 'ед.'})</label>
                <input
                  id="volume-tender"
                  type="number"
                  min="0"
                  step="0.01"
                  value={volumeTender}
                  onChange={(e) => setVolumeTender(e.target.value)}
                  placeholder="0.00"
                  className="volume-input"
                />
              </div>
              <div className="volume-field">
                <label htmlFor="volume-fact">Объем факт ({selectedWorkType?.unit?.name || 'ед.'})</label>
                <input
                  id="volume-fact"
                  type="number"
                  min="0"
                  step="0.01"
                  value={volumeFact}
                  onChange={(e) => setVolumeFact(e.target.value)}
                  placeholder="0.00"
                  className="volume-input"
                />
              </div>
            </div>
          </div>

          {/* Блок сравнения общей стоимости */}
          {(volumeTender || volumeFact) && (
            <>
              <div className="total-cost-comparison">
                <h2 className="section-title">Сравнение общей стоимости</h2>
                <div className="comparison-table">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Показатель</th>
                        <th>Тендерная стоимость</th>
                        <th>Фактическая стоимость</th>
                        <th>Отклонение</th>
                        <th>Отклонение, %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="metric-name">Общая стоимость</td>
                        <td className="price-cell tender">
                          {((parseFloat(volumeTender) || 0) * comparisonData.tenderPrice).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                        </td>
                        <td className="price-cell fact">
                          {((parseFloat(volumeFact) || 0) * comparisonData.factPrice).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                        </td>
                        <td className={`difference-cell ${
                          ((parseFloat(volumeFact) || 0) * comparisonData.factPrice) -
                          ((parseFloat(volumeTender) || 0) * comparisonData.tenderPrice) >= 0
                          ? 'positive' : 'negative'
                        }`}>
                          {((parseFloat(volumeFact) || 0) * comparisonData.factPrice) -
                           ((parseFloat(volumeTender) || 0) * comparisonData.tenderPrice) >= 0 ? '+' : ''}
                          {(((parseFloat(volumeFact) || 0) * comparisonData.factPrice) -
                            ((parseFloat(volumeTender) || 0) * comparisonData.tenderPrice)).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                        </td>
                        <td className={`difference-cell ${
                          ((parseFloat(volumeFact) || 0) * comparisonData.factPrice) -
                          ((parseFloat(volumeTender) || 0) * comparisonData.tenderPrice) >= 0
                          ? 'positive' : 'negative'
                        }`}>
                          {(() => {
                            const tenderTotal = (parseFloat(volumeTender) || 0) * comparisonData.tenderPrice;
                            const factTotal = (parseFloat(volumeFact) || 0) * comparisonData.factPrice;
                            const percentDiff = tenderTotal > 0 ? ((factTotal - tenderTotal) / tenderTotal * 100) : 0;
                            return (percentDiff >= 0 ? '+' : '') + percentDiff.toFixed(2) + '%';
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="total-cost-chart">
                <h2 className="chart-title">Сравнение общей стоимости</h2>
                <div className="chart-wrapper">
                  <Bar
                    data={{
                      labels: ['Тендерная стоимость', 'Фактическая стоимость'],
                      datasets: [{
                        label: 'Общая стоимость, ₽',
                        data: [
                          (parseFloat(volumeTender) || 0) * comparisonData.tenderPrice,
                          (parseFloat(volumeFact) || 0) * comparisonData.factPrice
                        ],
                        backgroundColor: [
                          'rgba(102, 126, 234, 0.8)',
                          'rgba(16, 185, 129, 0.8)'
                        ],
                        borderColor: [
                          'rgba(102, 126, 234, 1)',
                          'rgba(16, 185, 129, 1)'
                        ],
                        borderWidth: 2,
                        borderRadius: 8
                      }]
                    }}
                    options={chartOptions}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!comparisonData && selectedObjectId && selectedWorkTypeId && !loading && (
        <div className="no-data-message">
          <p>Нет данных для выбранной комбинации объекта и вида работ</p>
        </div>
      )}

      {!selectedObjectId || !selectedWorkTypeId ? (
        <div className="no-data-message">
          <p>Выберите объект и вид работ для отображения анализа</p>
        </div>
      ) : null}
    </div>
  );
}

export default PlanFactAnalysisPage;

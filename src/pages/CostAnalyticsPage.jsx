import { useState, useEffect } from 'react';
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
import { supabase } from '../lib/supabase';
import './CostAnalyticsPage.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function CostAnalyticsPage() {
  const [costTypes, setCostTypes] = useState([]);
  const [selectedCostType, setSelectedCostType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    async function fetchCostTypes() {
      try {
        const { data, error } = await supabase
          .from('cost_types')
          .select('id, name')
          .order('id');

        if (error) throw error;
        setCostTypes(data || []);
      } catch (error) {
        console.error('Ошибка загрузки видов затрат:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCostTypes();
  }, []);

  const handleGenerate = async () => {
    if (!selectedCostType) return;

    setIsGenerating(true);
    try {
      // Получаем данные из object_costs с именами объектов
      const { data, error } = await supabase
        .from('object_costs')
        .select('*, objects(name)')
        .eq('cost_type_id', selectedCostType)
        .order('object_id');

      if (error) throw error;

      if (!data || data.length === 0) {
        setChartData(null);
        return;
      }

      // Подготавливаем данные для графиков
      const labels = data.map(item => item.objects?.name || 'Без названия');
      const workPerUnit = data.map(item => item.works_per_unit || 0);
      const materialsPerUnit = data.map(item => item.materials_per_unit || 0);
      const totalPerUnit = data.map(item => (item.works_per_unit || 0) + (item.materials_per_unit || 0));
      const worksSumm = data.map(item => item.works_summ || 0);
      const materialsSumm = data.map(item => item.materials_summ || 0);
      const totalSumm = data.map(item => item.summ_works_and_materials || 0);

      setChartData({
        labels,
        workPerUnit,
        materialsPerUnit,
        totalPerUnit,
        worksSumm,
        materialsSumm,
        totalSumm
      });
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const createChartData = (data, label, color) => ({
    labels: chartData.labels,
    datasets: [{
      label,
      data,
      backgroundColor: color,
      borderRadius: 4
    }]
  });

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
        callbacks: {
          label: function(context) {
            const value = context.parsed.y;
            if (value >= 1000000) {
              return `${(value / 1000000).toFixed(2)} млн руб.`;
            } else if (value >= 1000) {
              return `${(value / 1000).toFixed(2)} тыс. руб.`;
            }
            return `${value.toFixed(2)} руб.`;
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
          font: { size: 11 },
          color: '#888'
        }
      },
      y: {
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: { size: 11 },
          color: '#888',
          callback: function(value) {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + ' млн';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(0) + ' тыс';
            }
            return value;
          }
        }
      }
    }
  };

  const charts = chartData ? [
    { title: 'Работа за ед.', data: chartData.workPerUnit, color: 'rgba(102, 126, 234, 0.8)' },
    { title: 'Материалы за ед.', data: chartData.materialsPerUnit, color: 'rgba(245, 158, 11, 0.8)' },
    { title: 'Итого за ед.', data: chartData.totalPerUnit, color: 'rgba(16, 185, 129, 0.8)' },
    { title: 'Итого работы', data: chartData.worksSumm, color: 'rgba(102, 126, 234, 0.8)' },
    { title: 'Итого материалы', data: chartData.materialsSumm, color: 'rgba(245, 158, 11, 0.8)' },
    { title: 'Итого', data: chartData.totalSumm, color: 'rgba(16, 185, 129, 0.8)' }
  ] : [];

  const selectedCostTypeName = costTypes.find(ct => ct.id === Number(selectedCostType))?.name;

  const handleSelectCostType = (costTypeId) => {
    setSelectedCostType(costTypeId);
    setIsDropdownOpen(false);
  };

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isDropdownOpen && !event.target.closest('.custom-select')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  return (
    <div className="cost-analytics-page">
      <h1 className="cost-analytics-title">Анализ по затратам</h1>
      <p className="cost-analytics-subtitle">Детальный анализ затрат по объектам</p>

      <div className="cost-analytics-controls">
        <div className="custom-select">
          <div
            className="custom-select-trigger"
            onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className="custom-select-value">
              {selectedCostTypeName || 'Выберите вид затрат'}
            </span>
            <svg
              className={`custom-select-arrow ${isDropdownOpen ? 'open' : ''}`}
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
          {isDropdownOpen && (
            <div className="custom-select-dropdown">
              <div
                className="custom-select-option"
                onClick={() => handleSelectCostType('')}
              >
                Выберите вид затрат
              </div>
              {costTypes.map((type) => (
                <div
                  key={type.id}
                  className={`custom-select-option ${type.id === Number(selectedCostType) ? 'selected' : ''}`}
                  onClick={() => handleSelectCostType(String(type.id))}
                >
                  {type.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={!selectedCostType || isGenerating}
        >
          {isGenerating ? 'Загрузка...' : 'Сгенерировать'}
        </button>
      </div>

      {chartData && (
        <>
          {/* Сводная таблица */}
          <div className="summary-table-container">
            <h2 className="summary-table-title">Сводная таблица</h2>
            <div className="summary-table-wrapper">
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Объект</th>
                    <th>Работа за ед., ₽</th>
                    <th>Материалы за ед., ₽</th>
                    <th>Итого за ед., ₽</th>
                    <th>Итого работы, млн ₽</th>
                    <th>Итого материалы, млн ₽</th>
                    <th>Итого, млн ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.labels.map((label, index) => (
                    <tr key={index}>
                      <td className="summary-table-number">{index + 1}</td>
                      <td className="summary-table-object">{label}</td>
                      <td className="summary-table-value">
                        {chartData.workPerUnit[index].toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="summary-table-value">
                        {chartData.materialsPerUnit[index].toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="summary-table-value summary-table-total">
                        {chartData.totalPerUnit[index].toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="summary-table-value">
                        {(chartData.worksSumm[index] / 1000000).toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="summary-table-value">
                        {(chartData.materialsSumm[index] / 1000000).toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                      <td className="summary-table-value summary-table-total">
                        {(chartData.totalSumm[index] / 1000000).toLocaleString('ru-RU', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                  ))}
                  <tr className="summary-table-average">
                    <td colSpan="2" className="summary-table-avg-label">Среднее</td>
                    <td className="summary-table-value">
                      {(chartData.workPerUnit.reduce((a, b) => a + b, 0) / chartData.workPerUnit.length).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="summary-table-value">
                      {(chartData.materialsPerUnit.reduce((a, b) => a + b, 0) / chartData.materialsPerUnit.length).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="summary-table-value summary-table-total">
                      {(chartData.totalPerUnit.reduce((a, b) => a + b, 0) / chartData.totalPerUnit.length).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="summary-table-value">
                      {(chartData.worksSumm.reduce((a, b) => a + b, 0) / chartData.worksSumm.length / 1000000).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="summary-table-value">
                      {(chartData.materialsSumm.reduce((a, b) => a + b, 0) / chartData.materialsSumm.length / 1000000).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="summary-table-value summary-table-total">
                      {(chartData.totalSumm.reduce((a, b) => a + b, 0) / chartData.totalSumm.length / 1000000).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Графики */}
          <div className="charts-grid">
            {charts.map((chart, index) => (
              <div key={index} className="chart-card">
                <h3 className="chart-card-title">{chart.title}</h3>
                <div className="chart-card-wrapper">
                  <Bar
                    data={createChartData(chart.data, chart.title, chart.color)}
                    options={chartOptions}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {chartData === null && !isGenerating && selectedCostType && (
        <p className="no-data-message">Нет данных для выбранного вида затрат</p>
      )}
    </div>
  );
}

export default CostAnalyticsPage;

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './WorkTypeAnalyticsPage.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function WorkTypeAnalyticsPage() {
  const [workTypes, setWorkTypes] = useState([]);
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [stats, setStats] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Загрузка списка видов работ
  useEffect(() => {
    async function loadWorkTypes() {
      try {
        const { data, error } = await supabase
          .from('work_types')
          .select('id, name, unit(id, name)')
          .order('name');

        if (error) throw error;
        setWorkTypes(data || []);
      } catch (error) {
        console.error('Ошибка загрузки видов работ:', error);
      } finally {
        setLoading(false);
      }
    }

    loadWorkTypes();
  }, []);

  // Загрузка данных при выборе вида работ
  useEffect(() => {
    if (!selectedWorkTypeId) return;

    async function loadWorkPriceData() {
      try {
        setLoading(true);

        // Получаем все цены для выбранного вида работ
        const { data: prices, error: pricesError } = await supabase
          .from('work_price_tender')
          .select(`
            id,
            price,
            object_id,
            objects(id, name)
          `)
          .eq('work_type_id', selectedWorkTypeId)
          .order('object_id');

        if (pricesError) throw pricesError;

        if (!prices || prices.length === 0) {
          setChartData(null);
          setStats(null);
          return;
        }

        // Подготовка данных для графика
        const objectNames = prices.map(p => p.objects?.name || 'Без названия');
        const priceValues = prices.map(p => p.price || 0);

        // Вычисление среднего значения
        const avgPrice = priceValues.reduce((sum, price) => sum + price, 0) / priceValues.length;

        // Данные для графика
        const data = {
          labels: objectNames,
          datasets: [
            {
              label: 'Цена работы',
              data: priceValues,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 3,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: '#3b82f6',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              pointRadius: 6,
              pointHoverRadius: 8
            },
            {
              label: 'Среднее значение',
              data: Array(priceValues.length).fill(avgPrice),
              borderColor: '#ef4444',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              pointHoverRadius: 0
            }
          ]
        };

        setChartData(data);

        // Вычисление статистики
        const maxPrice = Math.max(...priceValues);
        const minPrice = Math.min(...priceValues);
        const totalSum = priceValues.reduce((sum, price) => sum + price, 0);

        setStats({
          max: maxPrice,
          min: minPrice,
          avg: avgPrice,
          total: totalSum,
          count: priceValues.length
        });
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      } finally {
        setLoading(false);
      }
    }

    loadWorkPriceData();
  }, [selectedWorkTypeId]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 13 },
        callbacks: {
          label: function(context) {
            const value = context.parsed.y.toLocaleString('ru-RU');
            return `${context.dataset.label}: ${value} руб.`;
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
          color: '#888',
          maxRotation: 45,
          minRotation: 0
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
            return value.toLocaleString('ru-RU') + ' ₽';
          }
        }
      }
    }
  };

  const selectedWorkType = workTypes.find(wt => wt.id === selectedWorkTypeId);

  const handleSelectWorkType = (workTypeId) => {
    setSelectedWorkTypeId(workTypeId);
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

  if (loading && workTypes.length === 0) {
    return (
      <main className="work-type-analytics-page">
        <div className="analytics-container">
          <p className="loading-text">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="work-type-analytics-page">
      <div className="analytics-container">
        <div className="analytics-header">
          <div>
            <h1 className="analytics-title">Анализ тендерных цен по видам работ</h1>
            <p className="analytics-subtitle">Сравнение цен на работы между объектами</p>
          </div>
        </div>

        <div className="work-type-selector">
          <label className="selector-label">Выберите вид работ:</label>
          <div className="custom-select">
            <div
              className="custom-select-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span className="custom-select-value">
                {selectedWorkType
                  ? `${selectedWorkType.name} ${selectedWorkType.unit?.name ? `(${selectedWorkType.unit.name})` : ''}`
                  : 'Выберите вид работ'
                }
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
                  onClick={() => handleSelectWorkType('')}
                >
                  Выберите вид работ
                </div>
                {workTypes.map(wt => (
                  <div
                    key={wt.id}
                    className={`custom-select-option ${wt.id === selectedWorkTypeId ? 'selected' : ''}`}
                    onClick={() => handleSelectWorkType(wt.id)}
                  >
                    <span className="option-name">{wt.name}</span>
                    {wt.unit?.name && (
                      <span className="option-unit">({wt.unit.name})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {!selectedWorkTypeId ? (
          <div className="empty-state">
            <p>Выберите вид работ для отображения графика</p>
            <p className="empty-state-hint">
              Используйте выпадающий список выше для выбора вида работ
            </p>
          </div>
        ) : chartData ? (
          <>
            <div className="chart-section">
              <div className="chart-card">
                <h2 className="chart-card-title">
                  График цен: {selectedWorkType?.name}
                  {selectedWorkType?.unit?.name && ` (${selectedWorkType.unit.name})`}
                </h2>
                <div className="chart-wrapper">
                  <Line data={chartData} options={chartOptions} />
                </div>
              </div>
            </div>

            {stats && (
              <div className="stats-section">
                <div className="stat-card">
                  <span className="stat-value blue">{stats.max.toLocaleString('ru-RU')} ₽</span>
                  <span className="stat-label">Максимум</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value red">{stats.avg.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
                  <span className="stat-label">Среднее</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value blue">{stats.min.toLocaleString('ru-RU')} ₽</span>
                  <span className="stat-label">Минимум</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value green">{stats.count}</span>
                  <span className="stat-label">Объектов</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>Нет данных по выбранному виду работ</p>
            <p className="empty-state-hint">
              Добавьте цены на странице объектов в разделе "Цены работ"
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default WorkTypeAnalyticsPage;

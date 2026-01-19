import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { supabase } from '../lib/supabase';
import './LandingCharts.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Демо-данные для графиков
const DEMO_OBJECTS = ['ЖК Солнечный', 'ЖК Парковый', 'ЖК Центральный', 'ЖК Речной', 'ЖК Лесной', 'ЖК Городской'];
const DEMO_TOTAL_COSTS = [45.2, 52.8, 38.5, 61.3, 42.1, 55.7];
const DEMO_WORK_COSTS = [18.5, 22.3, 15.2, 25.8, 17.4, 23.1];
const DEMO_MATERIAL_COSTS = [26.7, 30.5, 23.3, 35.5, 24.7, 32.6];

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
          return `${context.parsed.y} млн руб.`;
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
          return value + ' млн';
        }
      }
    }
  }
};

// Настройки для графиков в миллиардах (общая стоимость, работы, материалы)
const billionChartOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    tooltip: {
      ...chartOptions.plugins.tooltip,
      callbacks: {
        label: function(context) {
          return `${(context.parsed.y / 1000).toFixed(2)} млрд руб.`;
        }
      }
    }
  },
  scales: {
    ...chartOptions.scales,
    y: {
      ...chartOptions.scales.y,
      ticks: {
        ...chartOptions.scales.y.ticks,
        callback: function(value) {
          return (value / 1000).toFixed(1) + ' млрд';
        }
      }
    }
  }
};

function LandingCharts() {
  const [objectNames, setObjectNames] = useState([]);
  const [totalCosts, setTotalCosts] = useState([]);
  const [workCosts, setWorkCosts] = useState([]);
  const [materialCosts, setMaterialCosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchChartData() {
      try {
        // Получаем все объекты
        const { data: objects, error: objectsError } = await supabase
          .from('objects')
          .select('id, name')
          .order('created_at', { ascending: false });

        if (objectsError) throw objectsError;

        if (!objects || objects.length === 0) {
          setIsLoading(false);
          return;
        }

        // Получаем ID вида затрат "Общая стоимость"
        const { data: costTypes, error: costTypesError } = await supabase
          .from('cost_types')
          .select('id, name')
          .eq('name', 'Общая стоимость')
          .single();

        if (costTypesError) throw costTypesError;

        const totalCostTypeId = costTypes?.id;

        // Получаем данные по затратам для каждого объекта
        const names = [];
        const totals = [];
        const works = [];
        const materials = [];

        for (const obj of objects) {
          // Получаем общую стоимость для объекта
          const { data: costData, error: costError } = await supabase
            .from('object_costs')
            .select('summ_works_and_materials, works_summ, materials_summ')
            .eq('object_id', obj.id)
            .eq('cost_type_id', totalCostTypeId)
            .maybeSingle();

          if (costError) {
            console.error('Ошибка получения затрат для объекта:', obj.name, costError);
            continue;
          }

          // Добавляем только объекты с данными
          if (costData && costData.summ_works_and_materials > 0) {
            names.push(obj.name);
            // Конвертируем в миллионы
            totals.push(Number((costData.summ_works_and_materials / 1000000).toFixed(2)));
            works.push(Number((costData.works_summ / 1000000).toFixed(2)));
            materials.push(Number((costData.materials_summ / 1000000).toFixed(2)));
          }
        }

        setObjectNames(names);
        setTotalCosts(totals);
        setWorkCosts(works);
        setMaterialCosts(materials);
      } catch (error) {
        console.error('Ошибка загрузки данных для графиков:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchChartData();
  }, []);

  // Используем реальные данные или демо-данные если загрузка
  const displayObjectNames = isLoading || objectNames.length === 0 ? DEMO_OBJECTS : objectNames;
  const displayTotalCosts = isLoading || totalCosts.length === 0 ? DEMO_TOTAL_COSTS : totalCosts;
  const displayWorkCosts = isLoading || workCosts.length === 0 ? DEMO_WORK_COSTS : workCosts;
  const displayMaterialCosts = isLoading || materialCosts.length === 0 ? DEMO_MATERIAL_COSTS : materialCosts;

  // Вычисляем статистику
  const maxTotalCost = displayTotalCosts.length > 0 ? Math.max(...displayTotalCosts) : 0;
  const avgTotalCost = displayTotalCosts.length > 0
    ? displayTotalCosts.reduce((a, b) => a + b, 0) / displayTotalCosts.length
    : 0;
  const minTotalCost = displayTotalCosts.length > 0 ? Math.min(...displayTotalCosts) : 0;

  const maxWorkCost = displayWorkCosts.length > 0 ? Math.max(...displayWorkCosts) : 0;
  const avgWorkCost = displayWorkCosts.length > 0
    ? displayWorkCosts.reduce((a, b) => a + b, 0) / displayWorkCosts.length
    : 0;
  const minWorkCost = displayWorkCosts.length > 0 ? Math.min(...displayWorkCosts) : 0;

  const maxMaterialCost = displayMaterialCosts.length > 0 ? Math.max(...displayMaterialCosts) : 0;
  const avgMaterialCost = displayMaterialCosts.length > 0
    ? displayMaterialCosts.reduce((a, b) => a + b, 0) / displayMaterialCosts.length
    : 0;
  const minMaterialCost = displayMaterialCosts.length > 0 ? Math.min(...displayMaterialCosts) : 0;

  const totalCostData = {
    labels: displayObjectNames,
    datasets: [{
      label: 'Общая стоимость',
      data: displayTotalCosts,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#10b981',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8
    }]
  };

  const workCostData = {
    labels: displayObjectNames,
    datasets: [{
      label: 'Стоимость работ',
      data: displayWorkCosts,
      borderColor: '#667eea',
      backgroundColor: 'rgba(102, 126, 234, 0.1)',
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#667eea',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8
    }]
  };

  const materialCostData = {
    labels: displayObjectNames,
    datasets: [{
      label: 'Стоимость материалов',
      data: displayMaterialCosts,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#f59e0b',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8
    }]
  };

  const comparisonData = {
    labels: displayObjectNames,
    datasets: [
      {
        label: 'Работы',
        data: displayWorkCosts,
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderRadius: 4
      },
      {
        label: 'Материалы',
        data: displayMaterialCosts,
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderRadius: 4
      }
    ]
  };

  const comparisonOptions = {
    ...billionChartOptions,
    plugins: {
      ...billionChartOptions.plugins,
      legend: {
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: { size: 12 }
        }
      }
    }
  };

  return (
    <div className="landing-charts">
      {/* Блок общей стоимости */}
      <section className="chart-section">
        <div className="chart-container">
          <div className="chart-header">
            <div className="chart-info">
              <h2 className="chart-title">Общая стоимость фасадов по затратам</h2>
              <p className="chart-subtitle">Сравнение стоимости по объектам</p>
            </div>
            <Link to="/analytics/total" className="chart-link">
              Анализ по затратам
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={totalCostData} options={billionChartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value green">{(maxTotalCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value green">{(avgTotalCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value green">{(minTotalCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Минимум</span>
            </div>
          </div>
        </div>
      </section>

      {/* Блок стоимости работ */}
      <section className="chart-section alt">
        <div className="chart-container">
          <div className="chart-header">
            <div className="chart-info">
              <h2 className="chart-title">Стоимость работ</h2>
              <p className="chart-subtitle">Затраты на монтаж и установку</p>
            </div>
            <Link to="/work-analysis" className="chart-link">
              Подробнее
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={workCostData} options={billionChartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value purple">{(maxWorkCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value purple">{(avgWorkCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value purple">{(minWorkCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Минимум</span>
            </div>
          </div>
        </div>
      </section>

      {/* Блок стоимости материалов */}
      <section className="chart-section">
        <div className="chart-container">
          <div className="chart-header">
            <div className="chart-info">
              <h2 className="chart-title">Стоимость материалов</h2>
              <p className="chart-subtitle">Затраты на фасадные материалы</p>
            </div>
            <Link to="/materials-analysis" className="chart-link">
              Подробнее
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={materialCostData} options={billionChartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value orange">{(maxMaterialCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value orange">{(avgMaterialCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value orange">{(minMaterialCost / 1000).toFixed(2)} млрд</span>
              <span className="chart-stat-label">Минимум</span>
            </div>
          </div>
        </div>
      </section>

      {/* Блок сравнения */}
      <section className="chart-section alt">
        <div className="chart-container">
          <div className="chart-header">
            <div className="chart-info">
              <h2 className="chart-title">Сравнение затрат</h2>
              <p className="chart-subtitle">Работы vs Материалы по объектам</p>
            </div>
          </div>
          <div className="chart-wrapper tall">
            <Bar data={comparisonData} options={comparisonOptions} />
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingCharts;

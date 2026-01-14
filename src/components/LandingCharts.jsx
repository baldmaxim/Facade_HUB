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

function LandingCharts() {
  const totalCostData = {
    labels: DEMO_OBJECTS,
    datasets: [{
      label: 'Общая стоимость',
      data: DEMO_TOTAL_COSTS,
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
    labels: DEMO_OBJECTS,
    datasets: [{
      label: 'Стоимость работ',
      data: DEMO_WORK_COSTS,
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
    labels: DEMO_OBJECTS,
    datasets: [{
      label: 'Стоимость материалов',
      data: DEMO_MATERIAL_COSTS,
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
    labels: DEMO_OBJECTS,
    datasets: [
      {
        label: 'Работы',
        data: DEMO_WORK_COSTS,
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderRadius: 4
      },
      {
        label: 'Материалы',
        data: DEMO_MATERIAL_COSTS,
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderRadius: 4
      }
    ]
  };

  const comparisonOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
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
              <h2 className="chart-title">Общая стоимость фасадов</h2>
              <p className="chart-subtitle">Сравнение стоимости по объектам</p>
            </div>
            <Link to="/analytics/total" className="chart-link">
              Подробнее
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={totalCostData} options={chartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value green">55.7 млн</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value green">49.3 млн</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value green">38.5 млн</span>
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
            <Link to="/analytics/work" className="chart-link">
              Подробнее
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={workCostData} options={chartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value purple">25.8 млн</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value purple">20.4 млн</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value purple">15.2 млн</span>
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
            <Link to="/analytics/materials" className="chart-link">
              Подробнее
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          <div className="chart-wrapper">
            <Line data={materialCostData} options={chartOptions} />
          </div>
          <div className="chart-stats">
            <div className="chart-stat">
              <span className="chart-stat-value orange">35.5 млн</span>
              <span className="chart-stat-label">Максимум</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value orange">28.9 млн</span>
              <span className="chart-stat-label">Среднее</span>
            </div>
            <div className="chart-stat">
              <span className="chart-stat-value orange">23.3 млн</span>
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

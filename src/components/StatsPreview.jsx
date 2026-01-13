import './StatsPreview.css';

function StatsPreview() {
  return (
    <section className="stats-preview">
      <div className="stats-preview-container">
        <div className="stats-preview-header">
          <h2 className="stats-preview-title">Общая статистика</h2>
          <p className="stats-preview-subtitle">
            Аналитика по всем объектам платформы
          </p>
        </div>

        <div className="stats-preview-grid">
          <div className="preview-card">
            <div className="preview-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18"></path>
                <path d="M18 17V9"></path>
                <path d="M13 17V5"></path>
                <path d="M8 17v-3"></path>
              </svg>
            </div>
            <h3 className="preview-card-title">Графики и диаграммы</h3>
            <p className="preview-card-text">
              Визуализация данных по стоимости фасадов
            </p>
            <span className="preview-card-badge">Скоро</span>
          </div>

          <div className="preview-card">
            <div className="preview-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
            </div>
            <h3 className="preview-card-title">История изменений</h3>
            <p className="preview-card-text">
              Отслеживание динамики цен во времени
            </p>
            <span className="preview-card-badge">Скоро</span>
          </div>

          <div className="preview-card">
            <div className="preview-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <h3 className="preview-card-title">Отчёты</h3>
            <p className="preview-card-text">
              Экспорт данных в различных форматах
            </p>
            <span className="preview-card-badge">Скоро</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StatsPreview;

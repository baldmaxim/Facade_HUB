import { Link } from 'react-router-dom';
import './Hero.css';

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <div className="hero-gradient"></div>
        <div className="hero-pattern"></div>
      </div>
      <div className="hero-container">
        <div className="hero-badge">FacadeHub Platform</div>
        <h1 className="hero-title">
          Анализ стоимости<br />
          <span className="hero-title-accent">фасадных решений</span>
        </h1>
        <p className="hero-subtitle">
          Единая платформа для управления проектами, анализа стоимости
          и сравнения фасадных решений жилых комплексов
        </p>

        <div className="hero-actions">
          <Link to="/objects" className="hero-btn primary">
            <span>Перейти к объектам</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-value">—</span>
            <span className="stat-label">Объектов</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-card">
            <span className="stat-value">—</span>
            <span className="stat-label">Застройщиков</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-card">
            <span className="stat-value">—</span>
            <span className="stat-label">Типов фасадов</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;

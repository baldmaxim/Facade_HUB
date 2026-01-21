import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './Header.css';

function Header() {
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isAnalyticsOpen && !event.target.closest('.nav-dropdown')) {
        setIsAnalyticsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAnalyticsOpen]);

  return (
    <header className="header">
      <div className="header-top">
        <Link to="/" className="header-logo">
          <div className="header-logo-main">
            <div className="header-logo-icon">
              <span className="logo-cube"></span>
              <span className="logo-cube"></span>
              <span className="logo-cube"></span>
            </div>
            <span className="header-logo-text">
              Facade<span className="logo-accent">HUB</span>
            </span>
          </div>
          <span className="logo-by">by SU_10</span>
        </Link>
        <p className="header-subtitle">Профессиональная среда для управления проектами фасадного отдела</p>
      </div>
      <nav className="header-nav">
        <div className="header-nav-container">
          <Link to="/objects" className="nav-btn">Объекты</Link>
          <Link to="/questions" className="nav-btn">Типовые вопросы заказчику</Link>
          <Link to="/prompts" className="nav-btn">Промты</Link>
          <Link to="/contractors" className="nav-btn">База подрядчиков</Link>
          <Link to="/admin" className="nav-btn">Панель управления</Link>

          <div className="nav-dropdown">
            <button
              className="nav-btn dropdown-trigger"
              onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
            >
              Аналитика
              <svg
                className={`dropdown-arrow ${isAnalyticsOpen ? 'open' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {isAnalyticsOpen && (
              <div className="dropdown-menu">
                <Link to="/work-analysis" className="dropdown-item">
                  Анализ тендерных цен по видам работ
                </Link>
                <Link to="/analytics/total" className="dropdown-item">
                  Анализ по затратам
                </Link>
                <Link to="/analytics/plan-fact" className="dropdown-item">
                  Анализ план/факт
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Header;

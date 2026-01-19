import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-top">
        <Link to="/" className="header-logo">
          <div className="header-logo-icon">
            <span className="logo-cube"></span>
            <span className="logo-cube"></span>
            <span className="logo-cube"></span>
          </div>
          <span className="header-logo-text">Facade<span className="logo-accent">HUB</span></span>
        </Link>
        <p className="header-subtitle">Профессиональная среда для управления проектами фасадного отдела</p>
      </div>
      <nav className="header-nav">
        <div className="header-nav-container">
          <Link to="/objects" className="nav-btn">Объекты</Link>
          <Link to="/questions" className="nav-btn">Типовые вопросы заказчику</Link>
          <Link to="/prompts" className="nav-btn">Промты</Link>
          <Link to="/contractors" className="nav-btn">База подрядчиков</Link>
          <Link to="/work-analysis" className="nav-btn">Анализ работ</Link>
          <Link to="/materials-analysis" className="nav-btn">Анализ материалов</Link>
          <Link to="/analytics/total" className="nav-btn">Анализ по затратам</Link>
          <Link to="/admin" className="nav-btn">Панель управления</Link>
        </div>
      </nav>
    </header>
  );
}

export default Header;

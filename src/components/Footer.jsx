import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-main">
          <Link to="/" className="footer-logo">
            <span className="footer-brand">FacadeHub</span>
          </Link>
          <p className="footer-description">
            Платформа для анализа стоимости фасадных решений
          </p>
        </div>

        <nav className="footer-nav">
          <Link to="/objects" className="footer-link">Объекты</Link>
          <a href="#analytics" className="footer-link">Аналитика</a>
          <Link to="/about" className="footer-link">Наша команда</Link>
        </nav>

        <div className="footer-bottom">
          <span className="footer-copyright">© 2024 FacadeHub</span>
          <Link to="/admin" className="footer-admin-link">Управление</Link>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

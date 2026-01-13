import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <span className="logo-text">FacadeHub</span>
        </Link>
        <nav className="nav">
          <Link to="/objects" className="nav-link">Объекты</Link>
          <a href="#analytics" className="nav-link">Аналитика</a>
          <a href="#about" className="nav-link">О сервисе</a>
        </nav>
      </div>
    </header>
  );
}

export default Header;

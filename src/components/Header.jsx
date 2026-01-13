import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <span className="logo-text">FacadeHub</span>
        </div>
        <nav className="nav">
          <a href="#projects" className="nav-link">Объекты</a>
          <a href="#analytics" className="nav-link">Аналитика</a>
          <a href="#about" className="nav-link">О сервисе</a>
        </nav>
      </div>
    </header>
  );
}

export default Header;

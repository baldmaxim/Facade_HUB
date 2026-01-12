import './Hero.css';

function Hero() {
  return (
    <section className="hero">
      <div className="hero-container">
        <h1 className="hero-title">
          Анализ стоимости фасадов
        </h1>
        <p className="hero-subtitle">
          База данных фасадных решений жилых комплексов бизнес и премиум класса.
          Сравнивайте материалы, технологии и стоимость за квадратный метр.
        </p>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-value">24</span>
            <span className="stat-label">Проекта</span>
          </div>
          <div className="stat">
            <span className="stat-value">12</span>
            <span className="stat-label">Застройщиков</span>
          </div>
          <div className="stat">
            <span className="stat-value">8</span>
            <span className="stat-label">Типов фасадов</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;

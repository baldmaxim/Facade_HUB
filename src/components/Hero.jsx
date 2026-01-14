import './Hero.css';

function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <div className="hero-gradient"></div>
        <div className="hero-pattern"></div>
      </div>
      <div className="hero-container">
        <h1 className="hero-title">FacadeHUB</h1>
        <p className="hero-subtitle">
          Профессиональная среда для управления проектами фасадного отдела
        </p>
      </div>
    </section>
  );
}

export default Hero;

import './AboutPage.css';

const TEAM_MEMBERS = [
  {
    name: 'Никита',
    role: 'Руководитель отдела',
    description: 'Руководит фасадным отделом, координирует работу команды и взаимодействие с подрядчиками. Обеспечивает соблюдение сроков и стандартов качества на всех этапах проекта.',
    photo: '/team/nikita.jpg'
  },
  {
    name: 'Валерий',
    role: 'Ведущий инженер',
    description: 'Специалист по навесным вентилируемым фасадам с многолетним опытом. Отвечает за техническую экспертизу и контроль качества проектных решений.',
    photo: '/team/valera.jpg'
  },
  {
    name: 'Вячеслав',
    role: 'Ведущий инженер',
    description: 'Эксперт по расчёту стоимости фасадных систем и анализу сметной документации. Занимается оптимизацией бюджетов и технических решений.',
    photo: '/team/slava.jpg'
  }
];

function AboutPage() {
  return (
    <main className="about-page">
      <div className="about-container">
        <section className="about-hero">
          <h1 className="about-title">О сервисе</h1>
          <p className="about-subtitle">
            FacadeHub — платформа для управления фасадными проектами и анализа стоимости решений
          </p>
        </section>

        <section className="about-mission">
          <h2 className="section-title">Наша миссия</h2>
          <p className="mission-text">
            Мы создаём инструменты, которые упрощают работу с фасадными проектами:
            от расчёта стоимости до контроля качества выполнения работ.
            Наша цель — сделать процесс прозрачным и эффективным для всех участников проекта.
          </p>
        </section>

        <section className="about-team">
          <h2 className="section-title">Наша команда</h2>
          <p className="team-intro">
            Фасадный отдел — это профессионалы с многолетним опытом в строительстве и проектировании
          </p>

          <div className="team-grid">
            {TEAM_MEMBERS.map((member, index) => (
              <div key={index} className="team-card">
                <div className="team-photo-wrapper">
                  <img
                    src={member.photo}
                    alt={member.name}
                    className="team-photo"
                  />
                </div>
                <div className="team-info">
                  <h3 className="team-name">{member.name}</h3>
                  <span className="team-role">{member.role}</span>
                  <p className="team-description">{member.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="about-contact">
          <h2 className="section-title">Связаться с нами</h2>
          <p className="contact-text">
            Есть вопросы или предложения? Мы всегда открыты для сотрудничества.
          </p>
        </section>
      </div>
    </main>
  );
}

export default AboutPage;

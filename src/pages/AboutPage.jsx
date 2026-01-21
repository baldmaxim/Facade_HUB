import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './AboutPage.css';

function AboutPage() {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTeamMembers() {
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('*')
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setTeamMembers(data || []);
      } catch (err) {
        console.error('Ошибка загрузки команды:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTeamMembers();
  }, []);
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

          {loading ? (
            <p className="team-loading">Загрузка...</p>
          ) : teamMembers.length === 0 ? (
            <p className="team-empty">Информация о команде появится позже</p>
          ) : (
            <div className="team-grid">
              {teamMembers.map((member) => (
                <div key={member.id} className="team-card">
                  {member.photo_url && (
                    <div className="team-photo-wrapper">
                      <img
                        src={member.photo_url}
                        alt={member.name}
                        className="team-photo"
                      />
                    </div>
                  )}
                  <div className="team-info">
                    <h3 className="team-name">{member.name}</h3>
                    <span className="team-role">{member.role}</span>
                    {member.description && (
                      <p className="team-description">{member.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

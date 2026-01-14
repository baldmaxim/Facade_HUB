import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './StatsPreview.css';

function StatsPreview() {
  const [stats, setStats] = useState({
    objects: 0,
    developers: 0,
    facadeTypes: 0
  });

  useEffect(() => {
    async function fetchStats() {
      const { data: objects } = await supabase.from('objects').select('developer');
      if (objects) {
        const uniqueDevelopers = new Set(objects.map(o => o.developer)).size;
        setStats({
          objects: objects.length,
          developers: uniqueDevelopers,
          facadeTypes: 5
        });
      }
    }
    fetchStats();
  }, []);

  return (
    <section className="stats-preview">
      <div className="stats-preview-container">
        <div className="stats-preview-header">
          <h2 className="stats-preview-title">Общая статистика</h2>
          <p className="stats-preview-subtitle">
            Аналитика по всем объектам платформы
          </p>
        </div>

        <div className="stats-numbers">
          <div className="stats-number-card">
            <span className="stats-number-value">{stats.objects}</span>
            <span className="stats-number-label">Объектов</span>
          </div>
          <div className="stats-number-divider"></div>
          <div className="stats-number-card">
            <span className="stats-number-value">{stats.developers}</span>
            <span className="stats-number-label">Застройщиков</span>
          </div>
          <div className="stats-number-divider"></div>
          <div className="stats-number-card">
            <span className="stats-number-value">{stats.facadeTypes}</span>
            <span className="stats-number-label">Общая стоимость</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StatsPreview;

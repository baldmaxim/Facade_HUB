import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './ProjectsTable.css';

function ProjectsTable() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    async function fetchProjects() {
      const { data, error } = await supabase
        .from('projects')
        .select('*');

      if (error) {
        setError(error.message);
      } else {
        setProjects(data || []);
      }
      setLoading(false);
    }

    fetchProjects();
  }, []);

  const filteredProjects = projects
    .filter(p => filter === 'all' || p.class === filter)
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'price') return (b.price_per_sqm || 0) - (a.price_per_sqm || 0);
      if (sortBy === 'year') return (b.year || 0) - (a.year || 0);
      return 0;
    });

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price || 0);
  };

  if (loading) {
    return (
      <section className="projects" id="projects">
        <div className="projects-container">
          <p>Загрузка данных...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="projects" id="projects">
        <div className="projects-container">
          <p>Ошибка загрузки: {error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="projects" id="projects">
      <div className="projects-container">
        <div className="projects-header">
          <h2 className="projects-title">База проектов</h2>
          <div className="projects-controls">
            <div className="filter-group">
              <label className="filter-label">Класс:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">Все</option>
                <option value="business">Бизнес</option>
                <option value="premium">Премиум</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="filter-label">Сортировка:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="filter-select"
              >
                <option value="name">По названию</option>
                <option value="price">По стоимости</option>
                <option value="year">По году</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Объекты</th>
                <th>Застройщик</th>
                <th>Класс</th>
                <th>Площадь</th>
                <th>Цена общая</th>
                <th>Год</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(project => (
                <tr key={project.id}>
                  <td>
                    <div className="project-name">{project.name}</div>
                    <div className="project-location">{project.location}</div>
                  </td>
                  <td>{project.developer}</td>
                  <td>
                    <span className={`class-badge ${project.class}`}>
                      {project.class === 'business' ? 'Бизнес' : 'Премиум'}
                    </span>
                  </td>
                  <td>{formatPrice(project.total_area)} м²</td>
                  <td className="price-cell">{formatPrice(project.price_per_sqm * project.total_area)} ₽</td>
                  <td>{project.year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default ProjectsTable;

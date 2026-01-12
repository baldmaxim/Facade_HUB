import { useState } from 'react';
import { projects } from '../data/projects';
import './ProjectsTable.css';

function ProjectsTable() {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const filteredProjects = projects
    .filter(p => filter === 'all' || p.class === filter)
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price') return b.pricePerSqm - a.pricePerSqm;
      if (sortBy === 'year') return b.year - a.year;
      return 0;
    });

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

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
                <th>Название</th>
                <th>Застройщик</th>
                <th>Класс</th>
                <th>Тип фасада</th>
                <th>Материал</th>
                <th>Цена за м²</th>
                <th>Площадь</th>
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
                  <td>{project.facadeType}</td>
                  <td>{project.material}</td>
                  <td className="price-cell">{formatPrice(project.pricePerSqm)} ₽</td>
                  <td>{formatPrice(project.totalArea)} м²</td>
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

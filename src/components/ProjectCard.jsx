import { Link } from 'react-router-dom';
import './ProjectCard.css';

function ProjectCard({ project }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price || 0);
  };

  return (
    <Link to={`/objects/${project.id}`} className="project-card">
      <div className="project-card-header">
        <span className={`class-badge ${project.class}`}>
          {project.class === 'business' ? 'Бизнес' : 'Премиум'}
        </span>
        <span className="project-year">{project.year}</span>
      </div>
      <h3 className="project-card-title">{project.name}</h3>
      <p className="project-card-location">{project.location}</p>
      <div className="project-card-info">
        <div className="info-item">
          <span className="info-label">Застройщик</span>
          <span className="info-value">{project.developer}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Площадь</span>
          <span className="info-value">{formatPrice(project.total_area)} м²</span>
        </div>
        <div className="info-item">
          <span className="info-label">Стоимость</span>
          <span className="info-value price">{formatPrice(project.price_per_sqm * project.total_area)} ₽</span>
        </div>
      </div>
    </Link>
  );
}

export default ProjectCard;

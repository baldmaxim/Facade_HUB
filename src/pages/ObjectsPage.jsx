import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchObjects as fetchObjectsApi } from '../api/objects';
import CreateObjectModal from '../components/CreateObjectModal';
import './ObjectsPage.css';

function ObjectsPage() {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadObjects = async () => {
    try {
      const data = await fetchObjectsApi();
      setObjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadObjects();
  }, []);

  const filterByStatus = (statusName) => {
    return objects.filter(obj => obj.object_status?.name === statusName);
  };

  if (loading) {
    return (
      <main className="objects-page">
        <div className="objects-container">
          <p className="loading-text">Загрузка объектов...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="objects-page">
        <div className="objects-container">
          <p className="error-text">Ошибка загрузки: {error}</p>
        </div>
      </main>
    );
  }

  const ObjectCard = ({ obj }) => (
    <Link to={`/objects/${obj.id}`} className="object-card">
      <div className="object-card-image">
        {obj.image_url ? (
          <img src={obj.image_url} alt={obj.name} />
        ) : (
          <div className="image-placeholder">
            <span>{obj.name.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="object-card-content">
        <h3 className="object-card-title">{obj.name}</h3>
        <p className="object-card-address">{obj.address}</p>
        <p className="object-card-developer">{obj.developer}</p>
      </div>
    </Link>
  );

  return (
    <main className="objects-page">
      {/* Блок Тендер */}
      <section className="objects-section">
        <div className="objects-section-container">
          <div className="objects-section-header">
            <h2 className="objects-section-title">Текущие тендеры</h2>
            <button
              className="add-object-btn"
              onClick={() => setIsModalOpen(true)}
            >
              + Добавить объект
            </button>
          </div>
          {filterByStatus('Тендер').length > 0 ? (
            <div className="objects-row">
              {filterByStatus('Тендер').map(obj => (
                <ObjectCard key={obj.id} obj={obj} />
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p>Нет объектов в этой категории</p>
            </div>
          )}
        </div>
      </section>

      {/* Блок СУ-10 */}
      <section className="objects-section">
        <div className="objects-section-container">
          <div className="objects-section-header">
            <h2 className="objects-section-title">Объекты СУ-10</h2>
            <button
              className="add-object-btn"
              onClick={() => setIsModalOpen(true)}
            >
              + Добавить объект
            </button>
          </div>
          {filterByStatus('Объекты СУ-10').length > 0 ? (
            <div className="objects-row">
              {filterByStatus('Объекты СУ-10').map(obj => (
                <ObjectCard key={obj.id} obj={obj} />
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p>Нет объектов в этой категории</p>
            </div>
          )}
        </div>
      </section>

      {/* Блок Проиграли */}
      <section className="objects-section lost">
        <div className="objects-section-container">
          <div className="objects-section-header">
            <h2 className="objects-section-title">Проиграли</h2>
          </div>
          {filterByStatus('Проиграли').length > 0 ? (
            <div className="objects-row">
              {filterByStatus('Проиграли').map(obj => (
                <ObjectCard key={obj.id} obj={obj} />
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p>Нет объектов в этой категории</p>
            </div>
          )}
        </div>
      </section>

      <CreateObjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadObjects}
      />
    </main>
  );
}

export default ObjectsPage;

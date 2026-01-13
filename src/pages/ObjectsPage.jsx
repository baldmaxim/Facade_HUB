import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CreateObjectModal from '../components/CreateObjectModal';
import './ObjectsPage.css';

function ObjectsPage() {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchObjects = async () => {
    const { data, error } = await supabase
      .from('objects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setObjects(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchObjects();
  }, []);

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

  return (
    <main className="objects-page">
      <div className="objects-container">
        <div className="objects-header">
          <h1 className="objects-title">Объекты</h1>
          <button
            className="add-object-btn"
            onClick={() => setIsModalOpen(true)}
          >
            + Добавить объект
          </button>
        </div>
        <div className="objects-grid">
          {objects.map(obj => (
            <Link to={`/objects/${obj.id}`} key={obj.id} className="object-card">
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
          ))}
        </div>
        {objects.length === 0 && (
          <div className="empty-state">
            <p className="empty-text">Объекты пока не добавлены</p>
            <button
              className="add-first-btn"
              onClick={() => setIsModalOpen(true)}
            >
              Добавить первый объект
            </button>
          </div>
        )}
      </div>

      <CreateObjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchObjects}
      />
    </main>
  );
}

export default ObjectsPage;

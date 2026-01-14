import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CreateObjectModal from '../components/CreateObjectModal';
import './ObjectsPage.css';

const CATEGORIES = {
  SU10: 'su10',
  TENDER: 'tender',
  LOST: 'lost'
};

function ObjectsPage() {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState(CATEGORIES.SU10);
  const [objectCategories, setObjectCategories] = useState({});

  // Загрузка категорий из localStorage
  useEffect(() => {
    const saved = localStorage.getItem('objectCategories');
    if (saved) {
      setObjectCategories(JSON.parse(saved));
    }
  }, []);

  // Сохранение категорий в localStorage
  useEffect(() => {
    if (Object.keys(objectCategories).length > 0) {
      localStorage.setItem('objectCategories', JSON.stringify(objectCategories));
    }
  }, [objectCategories]);

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

  const getObjectCategory = (objectId) => {
    return objectCategories[objectId] || CATEGORIES.SU10;
  };

  const moveObject = (objectId, newCategory) => {
    setObjectCategories(prev => ({
      ...prev,
      [objectId]: newCategory
    }));
  };

  const openModalForCategory = (category) => {
    setModalCategory(category);
    setIsModalOpen(true);
  };

  const handleObjectCreated = async () => {
    await fetchObjects();
    // Новый объект получит категорию из modalCategory
    const { data } = await supabase
      .from('objects')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data[0]) {
      setObjectCategories(prev => ({
        ...prev,
        [data[0].id]: modalCategory
      }));
    }
  };

  const filterByCategory = (category) => {
    return objects.filter(obj => getObjectCategory(obj.id) === category);
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

  const ObjectCard = ({ obj, currentCategory }) => (
    <div className="object-card-wrapper">
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
      <div className="object-card-actions">
        {currentCategory !== CATEGORIES.SU10 && (
          <button
            className="move-btn"
            onClick={() => moveObject(obj.id, CATEGORIES.SU10)}
            title="В СУ-10"
          >
            СУ-10
          </button>
        )}
        {currentCategory !== CATEGORIES.TENDER && (
          <button
            className="move-btn"
            onClick={() => moveObject(obj.id, CATEGORIES.TENDER)}
            title="В Тендер"
          >
            Тендер
          </button>
        )}
        {currentCategory !== CATEGORIES.LOST && (
          <button
            className="move-btn"
            onClick={() => moveObject(obj.id, CATEGORIES.LOST)}
            title="В Проиграли"
          >
            Проиграли
          </button>
        )}
      </div>
    </div>
  );

  return (
    <main className="objects-page">
      {/* Блок СУ-10 */}
      <section className="objects-section">
        <div className="objects-section-container">
          <div className="objects-section-header">
            <h2 className="objects-section-title">Объекты СУ-10</h2>
            <button
              className="add-object-btn"
              onClick={() => openModalForCategory(CATEGORIES.SU10)}
            >
              + Добавить объект
            </button>
          </div>
          {filterByCategory(CATEGORIES.SU10).length > 0 ? (
            <div className="objects-row">
              {filterByCategory(CATEGORIES.SU10).map(obj => (
                <ObjectCard key={obj.id} obj={obj} currentCategory={CATEGORIES.SU10} />
              ))}
            </div>
          ) : (
            <div className="empty-section">
              <p>Нет объектов в этой категории</p>
            </div>
          )}
        </div>
      </section>

      {/* Блок Тендер */}
      <section className="objects-section">
        <div className="objects-section-container">
          <div className="objects-section-header">
            <h2 className="objects-section-title">Тендер</h2>
            <button
              className="add-object-btn"
              onClick={() => openModalForCategory(CATEGORIES.TENDER)}
            >
              + Добавить объект
            </button>
          </div>
          {filterByCategory(CATEGORIES.TENDER).length > 0 ? (
            <div className="objects-row">
              {filterByCategory(CATEGORIES.TENDER).map(obj => (
                <ObjectCard key={obj.id} obj={obj} currentCategory={CATEGORIES.TENDER} />
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
          {filterByCategory(CATEGORIES.LOST).length > 0 ? (
            <div className="objects-row">
              {filterByCategory(CATEGORIES.LOST).map(obj => (
                <ObjectCard key={obj.id} obj={obj} currentCategory={CATEGORIES.LOST} />
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
        onSuccess={handleObjectCreated}
      />
    </main>
  );
}

export default ObjectsPage;

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './ObjectsPreview.css';

function ObjectsPreview() {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef(null);

  useEffect(() => {
    async function fetchObjects() {
      const { data } = await supabase
        .from('objects')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setObjects(data);
      }
      setLoading(false);
    }
    fetchObjects();
  }, []);

  const scroll = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = 350;
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <section className="objects-preview">
        <div className="objects-preview-container">
          <p className="objects-loading">Загрузка объектов...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="objects-preview">
      <div className="objects-preview-container">
        <div className="objects-preview-header">
          <h2 className="objects-preview-title">Объекты</h2>
          <Link to="/objects" className="objects-view-all">
            Перейти ко всем
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

        {objects.length === 0 ? (
          <div className="objects-empty">
            <p>Объекты пока не добавлены</p>
            <Link to="/objects" className="objects-add-btn">
              Добавить первый объект
            </Link>
          </div>
        ) : (
          <div className="objects-carousel-wrapper">
            <button className="carousel-arrow carousel-arrow-left" onClick={() => scroll('left')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>

            <div className="objects-carousel" ref={carouselRef}>
              {objects.map(obj => (
                <Link key={obj.id} to={`/objects/${obj.id}`} className="object-card">
                  <div className="object-card-image">
                    {obj.image_url ? (
                      <img src={obj.image_url} alt={obj.name} />
                    ) : (
                      <div className="object-card-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="object-card-info">
                    <h3 className="object-card-name">{obj.name}</h3>
                    <p className="object-card-address">{obj.address}</p>
                    <span className="object-card-developer">{obj.developer}</span>
                  </div>
                </Link>
              ))}
            </div>

            <button className="carousel-arrow carousel-arrow-right" onClick={() => scroll('right')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default ObjectsPreview;

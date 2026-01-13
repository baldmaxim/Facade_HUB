import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './ObjectPage.css';

function ObjectPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchObject() {
      const { data, error } = await supabase
        .from('objects')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setObject(data);
      }
      setLoading(false);
    }

    fetchObject();
  }, [id]);

  if (loading) {
    return (
      <main className="object-page">
        <div className="object-container">
          <p className="loading-text">Загрузка...</p>
        </div>
      </main>
    );
  }

  if (error || !object) {
    return (
      <main className="object-page">
        <div className="object-container">
          <p className="error-text">Объект не найден</p>
          <Link to="/objects" className="back-link">Вернуться к списку</Link>
        </div>
      </main>
    );
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <main className="object-page">
      <div className="object-profile">
        <div className="profile-cover">
          {object.image_url ? (
            <img src={object.image_url} alt={object.name} className="cover-image" />
          ) : (
            <div className="cover-placeholder">
              <span>Нет изображения</span>
            </div>
          )}
        </div>

        <div className="profile-content">
          <div className="profile-header">
            <div className="profile-avatar">
              {object.image_url ? (
                <img src={object.image_url} alt={object.name} />
              ) : (
                <span className="avatar-placeholder">
                  {object.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="profile-info">
              <h1 className="profile-name">{object.name}</h1>
              <p className="profile-meta">
                Добавлен {formatDate(object.created_at)}
              </p>
            </div>
          </div>

          <div className="profile-details">
            <div className="detail-card">
              <div className="detail-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Адрес</span>
                <span className="detail-value">{object.address}</span>
              </div>
            </div>

            <div className="detail-card">
              <div className="detail-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Застройщик</span>
                <span className="detail-value">{object.developer}</span>
              </div>
            </div>
          </div>

          <div className="profile-tabs">
            <Link to={`/objects/${id}/checklist`} className="tab-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>Чеклист</span>
            </Link>
            <Link to={`/objects/${id}/info`} className="tab-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>Информация об объекте</span>
            </Link>
            <Link to={`/objects/${id}/calculation`} className="tab-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                <line x1="8" y1="6" x2="16" y2="6"></line>
                <line x1="8" y1="10" x2="16" y2="10"></line>
                <line x1="8" y1="14" x2="12" y2="14"></line>
              </svg>
              <span>Нюансы расчёта</span>
            </Link>
          </div>

          <div className="profile-actions">
            <Link to="/objects" className="action-btn secondary">
              Назад к объектам
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ObjectPage;

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectName } from '../api/objects';
import './SubPage.css';

function ChecklistPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadObject() {
      try {
        const data = await fetchObjectName(id);
        setObject(data);
      } finally {
        setLoading(false);
      }
    }
    loadObject();
  }, [id]);

  if (loading) {
    return (
      <main className="sub-page">
        <div className="sub-page-container">
          <p>Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="sub-page">
      <div className="sub-page-container">
        <div className="sub-page-header">
          <Link to={`/objects/${id}`} className="back-btn">
            &larr; Назад к объекту
          </Link>
          <div className="sub-page-breadcrumb">
            <span className="breadcrumb-object">{object?.name}</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Чеклист</span>
          </div>
        </div>

        <h1 className="sub-page-title">Чеклист</h1>

        <div className="sub-page-content">
          <p className="placeholder-text">
            Здесь будет чеклист для объекта
          </p>
        </div>
      </div>
    </main>
  );
}

export default ChecklistPage;

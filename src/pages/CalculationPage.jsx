import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './SubPage.css';

function CalculationPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchObject() {
      const { data } = await supabase
        .from('objects')
        .select('name')
        .eq('id', id)
        .single();
      setObject(data);
      setLoading(false);
    }
    fetchObject();
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
            <span className="breadcrumb-current">Нюансы расчёта</span>
          </div>
        </div>

        <h1 className="sub-page-title">Нюансы расчёта</h1>

        <div className="sub-page-content">
          <p className="placeholder-text">
            Здесь будут нюансы расчёта для объекта
          </p>
        </div>
      </div>
    </main>
  );
}

export default CalculationPage;

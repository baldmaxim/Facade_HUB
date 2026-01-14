import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectById } from '../api/objects';
import { fetchObjectWorks } from '../api/works';
import { WORK_TYPES } from '../data/workTypes';
import './SubPage.css';

function ObjectInfoPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [worksData, setWorksData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [objectData, works] = await Promise.all([
          fetchObjectById(id),
          fetchObjectWorks(id)
        ]);
        setObject(objectData);
        setWorksData(works);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const formatPrice = (value) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('ru-RU').format(value);
  };

  const getWorkData = (workTypeId) => {
    return worksData.find(w => w.work_type_id === workTypeId) || {};
  };

  const calcTotal = (works, materials) => {
    const w = parseFloat(works) || 0;
    const m = parseFloat(materials) || 0;
    return w + m;
  };

  const calcDiff = (fact, tender) => {
    const f = parseFloat(fact) || 0;
    const t = parseFloat(tender) || 0;
    return f - t;
  };

  const getDiffClass = (value) => {
    if (value > 0) return 'diff-negative';
    if (value < 0) return 'diff-positive';
    return '';
  };

  const formatDiff = (value) => {
    if (value === 0) return '0';
    const formatted = formatPrice(Math.abs(value));
    return value > 0 ? `+${formatted}` : `-${formatted}`;
  };

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
            <span className="breadcrumb-current">Информация об объекте</span>
          </div>
        </div>

        <h1 className="sub-page-title">Информация об объекте</h1>

        <div className="sub-page-content">
          <div className="info-table-wrapper">
            <table className="info-table">
              <thead>
                <tr>
                  <th rowSpan="2">Вид работ</th>
                  <th rowSpan="2">Объем</th>
                  <th rowSpan="2">Ед. изм.</th>
                  <th colSpan="3" className="group-header tender">Тендер</th>
                  <th colSpan="3" className="group-header fact">Факт</th>
                  <th colSpan="3" className="group-header difference">Разница</th>
                </tr>
                <tr>
                  <th className="sub-header">Работы</th>
                  <th className="sub-header">Материалы</th>
                  <th className="sub-header">Итого</th>
                  <th className="sub-header">Работы</th>
                  <th className="sub-header">Материалы</th>
                  <th className="sub-header">Итого</th>
                  <th className="sub-header">Работы</th>
                  <th className="sub-header">Материалы</th>
                  <th className="sub-header">Итого</th>
                </tr>
              </thead>
              <tbody>
                {WORK_TYPES.map((workType) => {
                  const data = getWorkData(workType.id);
                  const tenderTotal = calcTotal(data.tender_works, data.tender_materials);
                  const factTotal = calcTotal(data.fact_works, data.fact_materials);
                  const diffWorks = calcDiff(data.fact_works, data.tender_works);
                  const diffMaterials = calcDiff(data.fact_materials, data.tender_materials);
                  const diffTotal = calcDiff(factTotal, tenderTotal);

                  return (
                    <tr key={workType.id}>
                      <td>{workType.id}. {workType.name}</td>
                      <td>{data.volume ? formatPrice(data.volume) : '—'}</td>
                      <td>{workType.unit}</td>
                      <td>{data.tender_works ? formatPrice(data.tender_works) : '—'}</td>
                      <td>{data.tender_materials ? formatPrice(data.tender_materials) : '—'}</td>
                      <td>{tenderTotal ? formatPrice(tenderTotal) : '—'}</td>
                      <td>{data.fact_works ? formatPrice(data.fact_works) : '—'}</td>
                      <td>{data.fact_materials ? formatPrice(data.fact_materials) : '—'}</td>
                      <td>{factTotal ? formatPrice(factTotal) : '—'}</td>
                      <td className={getDiffClass(diffWorks)}>{diffWorks !== 0 ? formatDiff(diffWorks) : '—'}</td>
                      <td className={getDiffClass(diffMaterials)}>{diffMaterials !== 0 ? formatDiff(diffMaterials) : '—'}</td>
                      <td className={getDiffClass(diffTotal)}>{diffTotal !== 0 ? formatDiff(diffTotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ObjectInfoPage;

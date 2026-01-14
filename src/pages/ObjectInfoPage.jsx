import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectById } from '../api/objects';
import { fetchObjectWorks, upsertObjectWork } from '../api/works';
import { WORK_TYPES } from '../data/workTypes';
import './SubPage.css';

const EDITABLE_FIELDS = ['volume', 'tender_works', 'tender_materials', 'fact_works', 'fact_materials'];

function ObjectInfoPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [worksData, setWorksData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [objectData, works] = await Promise.all([
          fetchObjectById(id),
          fetchObjectWorks(id)
        ]);
        setObject(objectData);

        const worksMap = {};
        works.forEach(w => {
          worksMap[w.work_type_id] = w;
        });
        setWorksData(worksMap);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const formatPrice = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    return new Intl.NumberFormat('ru-RU').format(value);
  };

  const getWorkData = (workTypeId) => {
    return worksData[workTypeId] || {};
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

  const handleCellChange = useCallback((workTypeId, field, value) => {
    setWorksData(prev => ({
      ...prev,
      [workTypeId]: {
        ...prev[workTypeId],
        [field]: value
      }
    }));
  }, []);

  const handleCellBlur = useCallback(async (workTypeId, field, value) => {
    const numValue = value === '' ? null : parseFloat(value);
    try {
      await upsertObjectWork({
        object_id: id,
        work_type_id: workTypeId,
        field,
        value: numValue
      });
    } catch (error) {
      alert('Ошибка сохранения: ' + error.message);
    }
  }, [id]);

  const handleKeyDown = useCallback((e, rowIndex, field) => {
    const fieldIndex = EDITABLE_FIELDS.indexOf(field);
    let nextRowIndex = rowIndex;
    let nextFieldIndex = fieldIndex;

    switch (e.key) {
      case 'Enter':
      case 'ArrowDown':
        e.preventDefault();
        nextRowIndex = rowIndex + 1;
        break;
      case 'ArrowUp':
        e.preventDefault();
        nextRowIndex = rowIndex - 1;
        break;
      case 'ArrowRight':
        if (e.target.selectionStart === e.target.value.length) {
          e.preventDefault();
          nextFieldIndex = fieldIndex + 1;
          if (nextFieldIndex >= EDITABLE_FIELDS.length) {
            nextFieldIndex = 0;
            nextRowIndex = rowIndex + 1;
          }
        }
        break;
      case 'ArrowLeft':
        if (e.target.selectionStart === 0) {
          e.preventDefault();
          nextFieldIndex = fieldIndex - 1;
          if (nextFieldIndex < 0) {
            nextFieldIndex = EDITABLE_FIELDS.length - 1;
            nextRowIndex = rowIndex - 1;
          }
        }
        break;
      case 'Tab':
        return;
      default:
        return;
    }

    if (nextRowIndex >= 0 && nextRowIndex < WORK_TYPES.length) {
      const nextField = EDITABLE_FIELDS[nextFieldIndex];
      const nextWorkTypeId = WORK_TYPES[nextRowIndex].id;
      const nextInput = document.querySelector(
        `input[data-row="${nextWorkTypeId}"][data-field="${nextField}"]`
      );
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  }, []);

  const getValue = (data, field) => {
    const val = data[field];
    if (val === null || val === undefined) return '';
    return val;
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
                {WORK_TYPES.map((workType, rowIndex) => {
                  const data = getWorkData(workType.id);
                  const tenderTotal = calcTotal(data.tender_works, data.tender_materials);
                  const factTotal = calcTotal(data.fact_works, data.fact_materials);
                  const diffWorks = calcDiff(data.fact_works, data.tender_works);
                  const diffMaterials = calcDiff(data.fact_materials, data.tender_materials);
                  const diffTotal = calcDiff(factTotal, tenderTotal);

                  return (
                    <tr key={workType.id}>
                      <td className="cell-readonly">{workType.id}. {workType.name}</td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="volume"
                          value={getValue(data, 'volume')}
                          onChange={(e) => handleCellChange(workType.id, 'volume', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'volume', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'volume')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-readonly">{workType.unit}</td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="tender_works"
                          value={getValue(data, 'tender_works')}
                          onChange={(e) => handleCellChange(workType.id, 'tender_works', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'tender_works', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'tender_works')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="tender_materials"
                          value={getValue(data, 'tender_materials')}
                          onChange={(e) => handleCellChange(workType.id, 'tender_materials', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'tender_materials', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'tender_materials')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-calculated">{tenderTotal ? formatPrice(tenderTotal) : '—'}</td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="fact_works"
                          value={getValue(data, 'fact_works')}
                          onChange={(e) => handleCellChange(workType.id, 'fact_works', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'fact_works', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'fact_works')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="fact_materials"
                          value={getValue(data, 'fact_materials')}
                          onChange={(e) => handleCellChange(workType.id, 'fact_materials', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'fact_materials', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'fact_materials')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-calculated">{factTotal ? formatPrice(factTotal) : '—'}</td>
                      <td className={`cell-calculated ${getDiffClass(diffWorks)}`}>
                        {diffWorks !== 0 ? formatDiff(diffWorks) : '—'}
                      </td>
                      <td className={`cell-calculated ${getDiffClass(diffMaterials)}`}>
                        {diffMaterials !== 0 ? formatDiff(diffMaterials) : '—'}
                      </td>
                      <td className={`cell-calculated ${getDiffClass(diffTotal)}`}>
                        {diffTotal !== 0 ? formatDiff(diffTotal) : '—'}
                      </td>
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

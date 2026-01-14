import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchObjectById } from '../api/objects';
import { fetchObjectWorks, upsertObjectWork } from '../api/works';
import { WORK_TYPES } from '../data/workTypes';
import './SubPage.css';

const EDITABLE_FIELDS = ['volume', 'work_per_unit', 'materials_per_unit'];

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

  const calcWorkTotal = (volume, workPerUnit) => {
    const v = parseFloat(volume) || 0;
    const w = parseFloat(workPerUnit) || 0;
    return v * w;
  };

  const calcMaterialsTotal = (volume, materialsPerUnit) => {
    const v = parseFloat(volume) || 0;
    const m = parseFloat(materialsPerUnit) || 0;
    return v * m;
  };

  const calcTotal = (workTotal, materialsTotal) => {
    return workTotal + materialsTotal;
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
                  <th>Вид работ</th>
                  <th>Объем</th>
                  <th>Ед. изм.</th>
                  <th>Работы за ед.</th>
                  <th>Материалы за ед.</th>
                  <th>Работы всего</th>
                  <th>Материалы всего</th>
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                {WORK_TYPES.map((workType, rowIndex) => {
                  const data = getWorkData(workType.id);
                  const workTotal = calcWorkTotal(data.volume, data.work_per_unit);
                  const materialsTotal = calcMaterialsTotal(data.volume, data.materials_per_unit);
                  const total = calcTotal(workTotal, materialsTotal);

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
                          data-field="work_per_unit"
                          value={getValue(data, 'work_per_unit')}
                          onChange={(e) => handleCellChange(workType.id, 'work_per_unit', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'work_per_unit', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'work_per_unit')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-editable">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="editable-cell"
                          data-row={workType.id}
                          data-field="materials_per_unit"
                          value={getValue(data, 'materials_per_unit')}
                          onChange={(e) => handleCellChange(workType.id, 'materials_per_unit', e.target.value)}
                          onBlur={(e) => handleCellBlur(workType.id, 'materials_per_unit', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, 'materials_per_unit')}
                          placeholder="—"
                        />
                      </td>
                      <td className="cell-calculated">{workTotal ? formatPrice(workTotal) : '—'}</td>
                      <td className="cell-calculated">{materialsTotal ? formatPrice(materialsTotal) : '—'}</td>
                      <td className="cell-calculated">{total ? formatPrice(total) : '—'}</td>
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

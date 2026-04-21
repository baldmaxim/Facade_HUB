import { useState } from 'react';
import './VorCustomTemplateEditor.css';

const CATEGORIES = ['СПК', 'Двери', 'НВФ', 'Мокрый фасад', 'Ограждения и козырьки', 'Откосы и отсечки', 'Прочее'];
const SECONDARY_OPTIONS = [
  { key: 'scaffolding', label: 'Леса и люльки' },
  { key: 'kmd_spk', label: 'КМД СПК' },
  { key: 'kmd_nvf', label: 'КМД НВФ' },
];
const KIND_OPTIONS = ['основн.', 'вспомогат.'];

function emptyWorkGroup() {
  return {
    work: { name: '', unit: 'м2', noteGp: '' },
    materials: [],
  };
}
function emptyMaterial() {
  return { name: '', unit: 'м2', kind: 'основн.', j: 1, k: 1 };
}

export default function VorCustomTemplateEditor({ initial, onSave, onClose }) {
  const isEdit = !!initial;

  const [key, setKey] = useState(initial?.key || '');
  const [label, setLabel] = useState(initial?.label || '');
  const [category, setCategory] = useState(initial?.category || 'Прочее');
  const [costPath, setCostPath] = useState(initial?.cost_path || 'ФАСАДНЫЕ РАБОТЫ / ');
  const [keywords, setKeywords] = useState((initial?.keywords || []).join(', '));
  const [secondary, setSecondary] = useState(new Set(initial?.secondary || []));
  const [workMaterials, setWorkMaterials] = useState(() => {
    const data = initial?.data;
    if (data?.workMaterials) return data.workMaterials;
    if (data?.works || data?.materials) {
      const works = data.works || [];
      const mats = data.materials || [];
      if (!works.length) return [{ work: null, materials: mats }];
      return [
        ...works.slice(0, -1).map(w => ({ work: w, materials: [] })),
        { work: works[works.length - 1], materials: mats },
      ];
    }
    return [emptyWorkGroup()];
  });
  const [validationError, setValidationError] = useState(null);

  function toggleSecondary(k) {
    setSecondary(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function updateWork(wgIdx, field, value) {
    setWorkMaterials(prev => prev.map((wg, i) => i !== wgIdx ? wg : {
      ...wg,
      work: { ...(wg.work || {}), [field]: value },
    }));
  }
  function addWorkGroup() {
    setWorkMaterials(prev => [...prev, emptyWorkGroup()]);
  }
  function removeWorkGroup(wgIdx) {
    setWorkMaterials(prev => prev.filter((_, i) => i !== wgIdx));
  }

  function addMaterial(wgIdx) {
    setWorkMaterials(prev => prev.map((wg, i) => i !== wgIdx ? wg : {
      ...wg,
      materials: [...wg.materials, emptyMaterial()],
    }));
  }
  function removeMaterial(wgIdx, mIdx) {
    setWorkMaterials(prev => prev.map((wg, i) => i !== wgIdx ? wg : {
      ...wg,
      materials: wg.materials.filter((_, j) => j !== mIdx),
    }));
  }
  function updateMaterial(wgIdx, mIdx, field, value) {
    setWorkMaterials(prev => prev.map((wg, i) => i !== wgIdx ? wg : {
      ...wg,
      materials: wg.materials.map((m, j) => j !== mIdx ? m : { ...m, [field]: value }),
    }));
  }

  function handleSave() {
    // Валидация
    const kw = keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (!key.trim()) return setValidationError('Ключ обязателен');
    if (!/^[a-z][a-z0-9_]*$/.test(key.trim())) return setValidationError('Ключ — только латиница, цифры и _ (начинается с буквы)');
    if (!label.trim()) return setValidationError('Название обязательно');
    if (!costPath.trim()) return setValidationError('Путь затрат обязателен');
    if (kw.length === 0) return setValidationError('Нужно хотя бы одно ключевое слово для матчинга');

    // Чистим пустые work/material строки
    const cleanedWM = workMaterials
      .map(wg => ({
        work: wg.work && wg.work.name ? {
          name: wg.work.name,
          unit: wg.work.unit || '',
          ...(wg.work.noteGp ? { noteGp: wg.work.noteGp } : {}),
        } : null,
        materials: (wg.materials || [])
          .filter(m => m.name && m.name.trim())
          .map(m => {
            const clean = { name: m.name, unit: m.unit || '', kind: m.kind };
            if (m.j !== '' && m.j !== null && m.j !== undefined) clean.j = parseFloat(m.j) || 0;
            if (m.k !== '' && m.k !== null && m.k !== undefined) clean.k = parseFloat(m.k) || 0;
            if (m.price !== '' && m.price !== null && m.price !== undefined && m.price !== 0) clean.price = parseFloat(m.price) || 0;
            return clean;
          }),
      }))
      .filter(wg => wg.work || wg.materials.length > 0);

    if (cleanedWM.length === 0) {
      return setValidationError('Нужна хотя бы одна работа или материал');
    }

    setValidationError(null);
    onSave({
      key: key.trim(),
      label: label.trim(),
      category,
      cost_path: costPath.trim(),
      data: { workMaterials: cleanedWM },
      keywords: kw,
      secondary: [...secondary],
      sort_order: 0,
    });
  }

  return (
    <div className="vcte-backdrop" onClick={onClose}>
      <div className="vcte-dialog" onClick={e => e.stopPropagation()}>
        <div className="vcte-header">
          <h3>{isEdit ? 'Редактировать шаблон' : 'Создать custom-шаблон'}</h3>
          <button className="vcte-close" onClick={onClose}>×</button>
        </div>

        <div className="vcte-body">
          <div className="vcte-grid">
            <div className="vcte-field">
              <label>Ключ <span className="vcte-req">*</span></label>
              <input
                type="text"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="my_custom_template"
                disabled={isEdit}
              />
              <small>{isEdit ? 'Ключ нельзя менять' : 'Латиница, цифры, _. Пример: custom_loggia_pvh'}</small>
            </div>
            <div className="vcte-field">
              <label>Категория</label>
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="vcte-field">
            <label>Название (для UI) <span className="vcte-req">*</span></label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Остекление лоджии ПВХ с усилением"
            />
          </div>

          <div className="vcte-field">
            <label>Путь затрат (costPath) <span className="vcte-req">*</span></label>
            <input
              type="text"
              value={costPath}
              onChange={e => setCostPath(e.target.value)}
              placeholder="ФАСАДНЫЕ РАБОТЫ / Профиль ПВХ / Здание"
            />
          </div>

          <div className="vcte-field">
            <label>Ключевые слова для матчинга <span className="vcte-req">*</span></label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="усиленный.*пвх, пвх.*усилен, плато"
            />
            <small>Через запятую. Поддерживается regex (например <code>остеклени.*балкон</code>). Матчинг нечувствителен к регистру.</small>
          </div>

          <div className="vcte-field">
            <label>Авто-добавлять вторичные шаблоны</label>
            <div className="vcte-checks">
              {SECONDARY_OPTIONS.map(opt => (
                <label key={opt.key} className="vcte-check">
                  <input
                    type="checkbox"
                    checked={secondary.has(opt.key)}
                    onChange={() => toggleSecondary(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="vcte-section">
            <div className="vcte-section-head">
              <h4>Работы и материалы</h4>
              <button className="vcte-btn-add" onClick={addWorkGroup}>+ Работа</button>
            </div>
            {workMaterials.map((wg, wi) => (
              <div key={wi} className="vcte-wg">
                <div className="vcte-wg-head">
                  <span className="vcte-wg-label">Работа {wi + 1}</span>
                  <button className="vcte-btn-remove" onClick={() => removeWorkGroup(wi)}>Удалить работу</button>
                </div>
                <div className="vcte-wg-fields">
                  <div className="vcte-field vcte-field-grow">
                    <label>Наименование работы</label>
                    <input
                      type="text"
                      value={wg.work?.name || ''}
                      onChange={e => updateWork(wi, 'name', e.target.value)}
                      placeholder="Монтаж стеклопакета"
                    />
                  </div>
                  <div className="vcte-field vcte-field-narrow">
                    <label>Ед.</label>
                    <input
                      type="text"
                      value={wg.work?.unit || ''}
                      onChange={e => updateWork(wi, 'unit', e.target.value)}
                      placeholder="м2"
                    />
                  </div>
                  <div className="vcte-field">
                    <label>Примечание ГП</label>
                    <input
                      type="text"
                      value={wg.work?.noteGp || ''}
                      onChange={e => updateWork(wi, 'noteGp', e.target.value)}
                      placeholder="не обязательно"
                    />
                  </div>
                </div>
                <div className="vcte-mats">
                  <div className="vcte-mats-head">
                    <strong>Материалы</strong>
                    <button className="vcte-btn-add-small" onClick={() => addMaterial(wi)}>+ Материал</button>
                  </div>
                  {wg.materials.length === 0 ? (
                    <div className="vcte-mats-empty">Нет материалов</div>
                  ) : (
                    <table className="vcte-mat-table">
                      <thead>
                        <tr>
                          <th>Наименование</th>
                          <th>Ед.</th>
                          <th>Тип</th>
                          <th title="Коэфф. перевода">Коэф. пер.</th>
                          <th title="Коэфф. расхода">Коэф. расх.</th>
                          <th>Цена ₽</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {wg.materials.map((m, mi) => (
                          <tr key={mi}>
                            <td>
                              <input type="text" value={m.name || ''} onChange={e => updateMaterial(wi, mi, 'name', e.target.value)} />
                            </td>
                            <td>
                              <input type="text" className="vcte-inp-narrow" value={m.unit || ''} onChange={e => updateMaterial(wi, mi, 'unit', e.target.value)} />
                            </td>
                            <td>
                              <select value={m.kind || 'основн.'} onChange={e => updateMaterial(wi, mi, 'kind', e.target.value)}>
                                {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                              </select>
                            </td>
                            <td>
                              <input type="number" step="any" className="vcte-inp-narrow" value={m.j ?? ''} onChange={e => updateMaterial(wi, mi, 'j', e.target.value)} />
                            </td>
                            <td>
                              <input type="number" step="any" className="vcte-inp-narrow" value={m.k ?? ''} onChange={e => updateMaterial(wi, mi, 'k', e.target.value)} />
                            </td>
                            <td>
                              <input type="number" step="any" className="vcte-inp-narrow" value={m.price ?? ''} onChange={e => updateMaterial(wi, mi, 'price', e.target.value)} />
                            </td>
                            <td>
                              <button className="vcte-btn-x" onClick={() => removeMaterial(wi, mi)}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}
          </div>

          {validationError && <div className="vcte-error">{validationError}</div>}
        </div>

        <div className="vcte-footer">
          <button className="vcte-btn-secondary" onClick={onClose}>Отмена</button>
          <button className="vcte-btn-primary" onClick={handleSave}>{isEdit ? 'Сохранить изменения' : 'Создать шаблон'}</button>
        </div>
      </div>
    </div>
  );
}

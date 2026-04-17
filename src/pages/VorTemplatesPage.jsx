import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  fetchVorTemplates,
  createVorTemplate,
  updateVorTemplate,
  deleteVorTemplate,
  deleteAllVorTemplates,
  insertVorTemplates
} from '../api/vorTemplates';
import './VorTemplatesPage.css';

const EMPTY_FORM = {
  section_name: '',
  point_number: '',
  category: '',
  work_binding: '',
  row_type: 'work',
  row_kind: '',
  name: '',
  unit: '',
  norm: '',
  coefficient_translate: '',
  coefficient: 1,
  quantity_gp: '',
  currency: 'RUB',
  delivery_type: '',
  price_ref: '',
  price_per: '',
  total_price: '',
  link_kp: '',
  note_customer: '',
  note_gp: '',
  in_price: true,
  sort_order: 0
};

function parseTemplatesExcel(rows) {
  const result = [];
  let currentSection = '';
  let sortOrder = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => !cell)) continue;

    const e = String(row[4] || '').trim().toLowerCase();
    const isWork = e.includes('суб-раб');
    const isMaterial = e.includes('суб-мат');

    if (!isWork && !isMaterial) {
      // Пропускаем строку заголовков таблицы
      const rowStr = row.map(v => String(v || '')).join(' ').toLowerCase();
      if (rowStr.includes('тип элемент') || rowStr.includes('ед. изм')) continue;
      // Ищем название раздела во всех колонках (объединённые ячейки хранят значение в первой)
      const sectionText = row.find(v => v && String(v).trim().length > 3);
      if (sectionText) currentSection = String(sectionText).trim();
      continue;
    }

    const name = (row[6] ? String(row[6]).trim() : '') || (row[7] ? String(row[7]).trim() : '');
    if (!name) continue;

    // Ищем "не в цене" в колонках M-P (индексы 12-15)
    const inPriceSearch = [row[12], row[13], row[14], row[15]].map(v => String(v || '').toLowerCase()).join(' ');
    const currencyRaw = row[12] ? String(row[12]).trim() : '';
    result.push({
      section_name: currentSection || 'Без раздела',
      point_number: row[1] ? String(row[1]).trim() : '',
      category: row[2] ? String(row[2]).trim() : '',
      work_binding: row[3] ? String(row[3]).trim() : '',
      row_type: isWork ? 'work' : 'material',
      row_kind: row[5] ? String(row[5]).trim() : '',
      name,
      unit: row[7] ? String(row[7]).trim() : '',
      norm: parseFloat(row[8]) || null,
      coefficient_translate: parseFloat(row[9]) || null,
      coefficient: parseFloat(row[10]) || 1,
      quantity_gp: parseFloat(row[11]) || null,
      currency: currencyRaw && !currencyRaw.toLowerCase().includes('цен') ? currencyRaw : 'RUB',
      delivery_type: row[13] ? String(row[13]).trim() : '',
      in_price: !inPriceSearch.includes('не в цене'),
      price_ref: parseFloat(row[14]) || null,
      price_per: row[15] ? String(row[15]).trim() : '',
      total_price: parseFloat(row[16]) || null,
      link_kp: row[17] ? String(row[17]).trim() : '',
      note_customer: row[18] ? String(row[18]).trim() : '',
      note_gp: row[19] ? String(row[19]).trim() : '',
      sort_order: sortOrder++
    });
  }
  return result;
}

function VorTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filterSection, setFilterSection] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const data = await fetchVorTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(tmpl) {
    setForm({
      section_name: tmpl.section_name,
      point_number: tmpl.point_number || '',
      category: tmpl.category || '',
      work_binding: tmpl.work_binding || '',
      row_type: tmpl.row_type,
      row_kind: tmpl.row_kind || '',
      name: tmpl.name,
      unit: tmpl.unit || '',
      norm: tmpl.norm ?? '',
      coefficient: tmpl.coefficient ?? 1,
      coefficient_translate: tmpl.coefficient_translate ?? '',
      quantity_gp: tmpl.quantity_gp ?? '',
      currency: tmpl.currency || 'RUB',
      delivery_type: tmpl.delivery_type || '',
      price_ref: tmpl.price_ref ?? '',
      price_per: tmpl.price_per || '',
      total_price: tmpl.total_price ?? '',
      link_kp: tmpl.link_kp || '',
      note_customer: tmpl.note_customer || '',
      note_gp: tmpl.note_gp || '',
      in_price: tmpl.in_price,
      sort_order: tmpl.sort_order ?? 0
    });
    setEditingId(tmpl.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.section_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        norm: form.norm === '' ? null : parseFloat(form.norm) || null,
        coefficient: parseFloat(form.coefficient) || 1,
        coefficient_translate: form.coefficient_translate === '' ? null : parseFloat(form.coefficient_translate) || null,
        quantity_gp: form.quantity_gp === '' ? null : parseFloat(form.quantity_gp) || null,
        price_ref: form.price_ref === '' ? null : parseFloat(form.price_ref) || null,
        total_price: form.total_price === '' ? null : parseFloat(form.total_price) || null,
        sort_order: parseInt(form.sort_order) || 0
      };
      if (editingId) {
        const updated = await updateVorTemplate(editingId, payload);
        setTemplates(prev => prev.map(t => t.id === editingId ? updated : t));
      } else {
        const created = await createVorTemplate(payload);
        setTemplates(prev => [...prev, created]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tmplId) {
    if (!confirm('Удалить шаблон?')) return;
    try {
      await deleteVorTemplate(tmplId);
      setTemplates(prev => prev.filter(t => t.id !== tmplId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteAll() {
    if (!confirm('Удалить ВСЕ шаблоны? Это действие необратимо.')) return;
    try {
      await deleteAllVorTemplates();
      setTemplates([]);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        setImportPreview(parseTemplatesExcel(rawRows));
      } catch (err) {
        setError('Ошибка чтения файла: ' + err.message);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function handleConfirmImport() {
    if (!importPreview) return;
    setSaving(true);
    try {
      const saved = await insertVorTemplates(importPreview);
      setTemplates(prev => [...prev, ...saved]);
      setImportPreview(null);
    } catch (err) {
      setError('Ошибка импорта: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const sections = [...new Set(templates.map(t => t.section_name))].sort();
  const filtered = filterSection
    ? templates.filter(t => t.section_name === filterSection)
    : templates;

  const grouped = {};
  filtered.forEach(t => {
    const s = t.section_name;
    if (!grouped[s]) grouped[s] = [];
    grouped[s].push(t);
  });

  return (
    <main className="vort-page">
      <div className="vort-container">
        <h1 className="vort-title">База шаблонов ВОР</h1>
        <p className="vort-subtitle">
          Шаблоны используются при заполнении ВОРа по объектам.
          Здесь хранится структура компании: работы, материалы, нормы расхода.
        </p>

        {error && <div className="vort-error">{error}</div>}

        <div className="vort-toolbar">
          <select
            className="vort-filter"
            value={filterSection}
            onChange={e => setFilterSection(e.target.value)}
          >
            <option value="">Все разделы</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="vort-toolbar-actions">
            <button className="vort-btn-danger" onClick={handleDeleteAll} disabled={templates.length === 0}>
              Удалить все
            </button>
            <button
              className="vort-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? 'Чтение...' : 'Импорт из Excel'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} hidden />
            <button className="vort-btn-primary" onClick={openAddForm}>+ Добавить шаблон</button>
          </div>
        </div>

        {importPreview && (
          <div className="vort-import-notice">
            <span>Найдено {importPreview.length} шаблонов. Будут добавлены к существующим.</span>
            <div className="vort-import-actions">
              <button className="vort-btn-danger" onClick={() => setImportPreview(null)}>Отмена</button>
              <button className="vort-btn-primary" onClick={handleConfirmImport} disabled={saving}>
                {saving ? 'Сохранение...' : 'Добавить'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="vort-loading">Загрузка...</p>
        ) : templates.length === 0 ? (
          <div className="vort-empty">
            <p>Шаблонов пока нет. Добавьте вручную или импортируйте из Excel.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="vort-section">
              <div className="vort-section-header">{section}</div>
              <table className="vort-table">
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>№ п/п</th>
                    <th>Затрата на строительство</th>
                    <th>Привязка к работе</th>
                    <th>Тип элемента</th>
                    <th>Тип материала</th>
                    <th>Наименование</th>
                    <th>Ед. изм.</th>
                    <th>Количество</th>
                    <th>Коэфф. перевода</th>
                    <th>Коэфф. расхода</th>
                    <th>Количество ГП</th>
                    <th>Валюта</th>
                    <th>Тип доставки</th>
                    <th>Стоимость</th>
                    <th>Цена за</th>
                    <th>Итоговая</th>
                    <th>Ссылка на КП</th>
                    <th>Примечание заказчика</th>
                    <th>Примечание ГП</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(t => (
                    <tr key={t.id} className={`vort-row vort-row-${t.row_type}`}>
                      <td className="vort-cell-muted"></td>
                      <td className="vort-cell-muted">{t.point_number || '—'}</td>
                      <td className="vort-cell-muted vort-cell-category" title={t.category || ''}>{t.category || '—'}</td>
                      <td className="vort-cell-muted">{t.work_binding || '—'}</td>
                      <td>
                        <span className={`vort-type-badge vort-type-${t.row_type}`}>
                          {t.row_type === 'work' ? 'суб-раб' : 'суб-мат'}
                        </span>
                      </td>
                      <td className="vort-cell-muted">{t.row_kind || '—'}</td>
                      <td>{t.name}</td>
                      <td className="vort-cell-muted">{t.unit || '—'}</td>
                      <td className="vort-cell-muted">{t.norm ?? '—'}</td>
                      <td className="vort-cell-muted">{t.coefficient_translate ?? '—'}</td>
                      <td className="vort-cell-muted">{t.coefficient ?? '—'}</td>
                      <td className="vort-cell-muted">{t.quantity_gp ?? '—'}</td>
                      <td className="vort-cell-muted">{t.currency || '—'}</td>
                      <td className="vort-cell-muted">{t.delivery_type || '—'}</td>
                      <td className="vort-cell-muted">{t.price_ref ?? '—'}</td>
                      <td className="vort-cell-muted">{t.price_per || '—'}</td>
                      <td className="vort-cell-muted">{t.total_price ?? '—'}</td>
                      <td className="vort-cell-muted vort-cell-link">
                        {t.link_kp ? <a href={t.link_kp} target="_blank" rel="noreferrer">КП</a> : '—'}
                      </td>
                      <td className="vort-cell-muted vort-cell-note" title={t.note_customer || ''}>{t.note_customer || '—'}</td>
                      <td className="vort-cell-muted vort-cell-note" title={t.note_gp || ''}>{t.note_gp || '—'}</td>
                      <td className="vort-actions">
                        <button className="vort-action-edit" onClick={() => openEditForm(t)}>Ред.</button>
                        <button className="vort-action-delete" onClick={() => handleDelete(t.id)}>Удалить</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="vort-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="vort-modal" onClick={e => e.stopPropagation()}>
            <h3 className="vort-modal-title">
              {editingId ? 'Редактировать шаблон' : 'Новый шаблон'}
            </h3>

            <div className="vort-form">
              <div className="vort-field">
                <label>Раздел *</label>
                <input value={form.section_name} onChange={e => setForm({ ...form, section_name: e.target.value })} placeholder="Монтаж витражей" />
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>№ п/п</label>
                  <input value={form.point_number} onChange={e => setForm({ ...form, point_number: e.target.value })} placeholder="№ пункта" />
                </div>
                <div className="vort-field">
                  <label>Привязка к работе</label>
                  <input value={form.work_binding} onChange={e => setForm({ ...form, work_binding: e.target.value })} placeholder="..." />
                </div>
              </div>
              <div className="vort-field">
                <label>Затрата на строительство</label>
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="ФАСАДНЫЕ РАБОТЫ / ..." />
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>Тип *</label>
                  <select value={form.row_type} onChange={e => setForm({ ...form, row_type: e.target.value })}>
                    <option value="work">суб-раб (работа)</option>
                    <option value="material">суб-мат (материал)</option>
                  </select>
                </div>
                <div className="vort-field">
                  <label>Вид</label>
                  <select value={form.row_kind} onChange={e => setForm({ ...form, row_kind: e.target.value })}>
                    <option value="">—</option>
                    <option value="основн.">основн.</option>
                    <option value="вспомогат.">вспомогат.</option>
                  </select>
                </div>
              </div>
              <div className="vort-field">
                <label>Наименование *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Сборка и монтаж алюминиевых витражей" />
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>Ед. изм.</label>
                  <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="М2" />
                </div>
                <div className="vort-field">
                  <label>Количество</label>
                  <input type="number" value={form.norm} onChange={e => setForm({ ...form, norm: e.target.value })} placeholder="1.0" />
                </div>
                <div className="vort-field">
                  <label>Коэфф. перевода</label>
                  <input type="number" value={form.coefficient_translate} onChange={e => setForm({ ...form, coefficient_translate: e.target.value })} placeholder="1.0" />
                </div>
                <div className="vort-field">
                  <label>Коэфф. расхода</label>
                  <input type="number" value={form.coefficient} onChange={e => setForm({ ...form, coefficient: e.target.value })} placeholder="1.0" />
                </div>
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>Количество ГП</label>
                  <input type="number" value={form.quantity_gp} onChange={e => setForm({ ...form, quantity_gp: e.target.value })} placeholder="0" />
                </div>
                <div className="vort-field">
                  <label>Валюта</label>
                  <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="RUB" />
                </div>
                <div className="vort-field">
                  <label>Тип доставки</label>
                  <input value={form.delivery_type} onChange={e => setForm({ ...form, delivery_type: e.target.value })} placeholder="включено" />
                </div>
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>Стоимость</label>
                  <input type="number" value={form.price_ref} onChange={e => setForm({ ...form, price_ref: e.target.value })} placeholder="0" />
                </div>
                <div className="vort-field">
                  <label>Цена за</label>
                  <input value={form.price_per} onChange={e => setForm({ ...form, price_per: e.target.value })} placeholder="м2" />
                </div>
                <div className="vort-field">
                  <label>Итоговая</label>
                  <input type="number" value={form.total_price} onChange={e => setForm({ ...form, total_price: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="vort-field">
                <label>Ссылка на КП</label>
                <input value={form.link_kp} onChange={e => setForm({ ...form, link_kp: e.target.value })} placeholder="https://..." />
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>Примечание заказчика</label>
                  <input value={form.note_customer} onChange={e => setForm({ ...form, note_customer: e.target.value })} />
                </div>
                <div className="vort-field">
                  <label>Примечание ГП</label>
                  <input value={form.note_gp} onChange={e => setForm({ ...form, note_gp: e.target.value })} />
                </div>
              </div>
              <div className="vort-field-row">
                <div className="vort-field">
                  <label>В цене</label>
                  <select value={form.in_price ? 'yes' : 'no'} onChange={e => setForm({ ...form, in_price: e.target.value === 'yes' })}>
                    <option value="yes">в цене</option>
                    <option value="no">не в цене</option>
                  </select>
                </div>
                <div className="vort-field">
                  <label>Порядок</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="vort-modal-actions">
              <button className="vort-btn-cancel" onClick={() => setShowForm(false)} disabled={saving}>Отмена</button>
              <button className="vort-btn-primary" onClick={handleSave} disabled={saving || !form.name.trim() || !form.section_name.trim()}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default VorTemplatesPage;

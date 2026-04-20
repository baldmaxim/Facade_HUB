import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { fetchObjectById } from '../api/objects';
import { fetchVorRows, insertVorRows, deleteVorRows, updateVorRowField } from '../api/vor';
import { fetchVorTemplates } from '../api/vorTemplates';
import VorFillModal from '../components/VorFillModal';
import './VorPage.css';

// ─── Парсер пустого ВОР заказчика ───────────────────────────────────
// Парсит ВСЕ типы строк: разделы, позиции, и (если есть) суб-раб/суб-мат
function parseVorExcel(rows) {
  const result = [];
  let currentSection = '';
  let sortOrder = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === undefined || c === '')) continue;

    const colA = row[0]; // Номер позиции
    const colE = String(row[4] || '').trim().toLowerCase();
    const colG = row[6] ? String(row[6]).trim() : '';
    const colH = row[7] ? String(row[7]).trim() : '';
    const colI = row[8]; // Количество заказчика
    const colL = row[11]; // Количество ГП

    const isWork = colE.includes('суб-раб') || colE.includes('sub-rab');
    const isMaterial = colE.includes('суб-мат') || colE.includes('sub-mat');

    if (isWork || isMaterial) {
      // Строки суб-раб/суб-мат (из уже заполненного ВОР)
      const rowKind = row[5] ? String(row[5]).trim() : '';
      const name = colG || (row[7] ? String(row[7]).trim() : '');
      const unit = row[9] ? String(row[9]).trim() : colH;
      const norm = parseFloat(row[8]) || null;
      const coefficient = parseFloat(row[10]) || 1;
      const inPriceRaw = String(row[12] || '').trim().toLowerCase();
      const priceRaw = row[15];
      const priceNum = typeof priceRaw === 'number' ? priceRaw : null;

      if (!name) continue;
      result.push({
        row_type: isWork ? 'work' : 'material',
        section_name: currentSection || 'Без раздела',
        point_number: row[1] ? String(row[1]).trim() : '',
        category: row[2] ? String(row[2]).trim() : '',
        has_item: String(row[3] || '').trim().toLowerCase() === 'да',
        row_kind: rowKind,
        name,
        unit,
        norm,
        coefficient,
        in_price: !inPriceRaw.includes('не в цене'),
        volume: null,
        work_price: isWork ? priceNum : null,
        material_price: isMaterial ? priceNum : null,
        sort_order: sortOrder++
      });
      continue;
    }

    // Не суб-раб/суб-мат → позиция или раздел
    const hasQty = (colI !== null && colI !== undefined && colI !== '') ||
                   (colL !== null && colL !== undefined && colL !== '');
    const hasName = colG && colG.length > 3;

    if (hasName && hasQty) {
      // ПОЗИЦИЯ ВОР (розовая строка с объёмами)
      let posCode = colA ? String(colA).trim() : '';
      // Excel иногда парсит "10.1." как дату — обрабатываем
      if (posCode && posCode.includes('-') && posCode.includes(':')) {
        posCode = ''; // дата — пропускаем
      }

      result.push({
        row_type: 'position',
        section_name: currentSection || 'Без раздела',
        position_code: posCode,
        name: colG,
        unit: colH,
        qty_customer: typeof colI === 'number' ? colI : (parseFloat(colI) || null),
        qty_gp: typeof colL === 'number' ? colL : (parseFloat(colL) || null),
        sort_order: sortOrder++
      });
    } else if (hasName) {
      // РАЗДЕЛ (заголовок секции)
      const sectionText = [row[6], row[5], row[4], row[3], row[2], row[1], row[0]]
        .find(v => v && String(v).trim().length > 3);
      if (sectionText) currentSection = String(sectionText).trim();
    }
  }

  return result;
}

// ─── Утилиты ────────────────────────────────────────────────────────
function formatNumber(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = parseFloat(val);
  return isNaN(n) ? '' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Компонент ──────────────────────────────────────────────────────
function VorPage() {
  const { id } = useParams();
  const [object, setObject] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState(null);
  const [genStats, setGenStats] = useState(null);
  const [showFillModal, setShowFillModal] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimers = useRef({});

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const [objectData, vorData] = await Promise.all([
        fetchObjectById(id),
        fetchVorRows(id)
      ]);
      setObject(objectData);
      setRows(vorData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Импорт Excel ──────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        const parsed = parseVorExcel(rawRows);
        setImportPreview(parsed);
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
      await deleteVorRows(id);
      const rowsToInsert = importPreview.map(r => ({ ...r, object_id: id }));
      const saved = await insertVorRows(rowsToInsert);
      setRows(saved);
      setImportPreview(null);
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancelImport() {
    setImportPreview(null);
    setError(null);
  }

  // ─── Автозаполнение шаблонами ─────────────────────────────────
  async function handleFillTemplates() {
    const positions = rows.filter(r => r.row_type === 'position');
    if (positions.length === 0) {
      setError('Нет позиций для заполнения. Сначала импортируйте пустой ВОР.');
      return;
    }

    // Проверяем, есть ли уже шаблонные строки
    const hasTemplateRows = rows.some(r => r.row_type === 'work' || r.row_type === 'material');
    if (hasTemplateRows) {
      if (!confirm('Шаблонные строки уже есть. Удалить их и заполнить заново?')) return;
    }

    setFilling(true);
    setError(null);

    try {
      const templates = await fetchVorTemplates();
      if (templates.length === 0) {
        setError('База шаблонов пуста. Загрузите шаблоны на странице "База шаблонов".');
        setFilling(false);
        return;
      }

      // Удаляем старые work/material строки, оставляем position
      const existingWorkMat = rows.filter(r => r.row_type === 'work' || r.row_type === 'material');
      if (existingWorkMat.length > 0) {
        await deleteVorRows(id);
        // Переимпортируем позиции
        const positionsToInsert = positions.map(r => ({ ...r, object_id: id }));
        const savedPositions = await insertVorRows(positionsToInsert);
        positions.length = 0;
        savedPositions.forEach(p => positions.push(p));
      }

      // Для каждой позиции — подбор шаблонов
      const newRows = [];
      let sortOrder = 1000; // начинаем после позиций

      let matchedCount = 0;
      let unmatchedPositions = [];

      for (const pos of positions) {
        const matched = findTemplatesForPosition(pos, templates);
        if (matched.length === 0) {
          unmatchedPositions.push(pos.name);
          continue;
        }

        matchedCount++;
        for (const tpl of matched) {
          newRows.push({
            object_id: id,
            template_id: tpl.id,
            section_name: pos.section_name || tpl.section_name,
            row_type: tpl.row_type,
            point_number: tpl.point_number || '',
            category: tpl.category || '',
            has_item: tpl.row_type === 'material',
            row_kind: tpl.row_kind || '',
            name: tpl.name,
            unit: tpl.unit || '',
            norm: tpl.norm,
            coefficient: tpl.coefficient || 1,
            in_price: tpl.in_price !== false,
            volume: pos.qty_gp || pos.qty_customer || null,
            work_price: null,
            material_price: null,
            sort_order: sortOrder++
          });
        }
      }

      if (newRows.length > 0) {
        const saved = await insertVorRows(newRows);
        // Перезагружаем все строки
        const allRows = await fetchVorRows(id);
        setRows(allRows);
      }

      let msg = `Заполнено: ${matchedCount} из ${positions.length} позиций, вставлено ${newRows.length} строк.`;
      if (unmatchedPositions.length > 0) {
        msg += ` Не найдены шаблоны для: ${unmatchedPositions.slice(0, 3).map(n => n.slice(0, 40)).join(', ')}`;
        if (unmatchedPositions.length > 3) msg += ` и ещё ${unmatchedPositions.length - 3}`;
      }
      alert(msg);
    } catch (err) {
      setError('Ошибка заполнения: ' + err.message);
    } finally {
      setFilling(false);
    }
  }

  // ─── Редактирование ячеек ─────────────────────────────────────
  function handleFieldChange(rowId, field, value) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));

    clearTimeout(saveTimers.current[rowId + field]);
    saveTimers.current[rowId + field] = setTimeout(async () => {
      try {
        const numVal = value === '' ? null : parseFloat(value);
        await updateVorRowField(rowId, field, isNaN(numVal) ? null : numVal);
      } catch (err) {
        setError('Ошибка сохранения: ' + err.message);
      }
    }, 600);
  }

  // ─── Группировка по секциям ───────────────────────────────────
  const displayRows = importPreview || rows;
  const sections = [];
  const sectionMap = {};
  displayRows.forEach(row => {
    const s = row.section_name || 'Без раздела';
    if (!sectionMap[s]) {
      sectionMap[s] = [];
      sections.push(s);
    }
    sectionMap[s].push(row);
  });

  const positionCount = displayRows.filter(r => r.row_type === 'position').length;
  const workCount = displayRows.filter(r => r.row_type === 'work').length;
  const materialCount = displayRows.filter(r => r.row_type === 'material').length;

  const totalWorkPrice = displayRows
    .filter(r => r.row_type === 'work' && r.work_price)
    .reduce((s, r) => s + parseFloat(r.work_price || 0), 0);
  const totalMaterialPrice = displayRows
    .filter(r => r.row_type === 'material' && r.material_price)
    .reduce((s, r) => s + parseFloat(r.material_price || 0), 0);

  if (loading) {
    return (
      <main className="vor-page">
        <div className="vor-container"><p className="vor-loading">Загрузка...</p></div>
      </main>
    );
  }

  return (
    <main className="vor-page">
      <div className="vor-container">
        <div className="vor-breadcrumb">
          <Link to="/objects">Объекты</Link>
          <span>/</span>
          <Link to={`/objects/${id}`}>{object?.name}</Link>
          <span>/</span>
          <span>Заполнение ВОРа</span>
        </div>

        <div className="vor-header">
          <h1 className="vor-title">Заполнение ВОРа</h1>
          <div className="vor-header-actions">
            <Link to="/vor-templates" className="vor-btn-secondary">
              База шаблонов
            </Link>
            {positionCount > 0 && workCount === 0 && !importPreview && (
              <button
                className="vor-btn-fill"
                onClick={handleFillTemplates}
                disabled={filling}
              >
                {filling ? 'Заполнение...' : 'Заполнить шаблонами'}
              </button>
            )}
            {positionCount > 0 && workCount > 0 && !importPreview && (
              <button
                className="vor-btn-secondary"
                onClick={handleFillTemplates}
                disabled={filling}
              >
                {filling ? 'Заполнение...' : 'Перезаполнить'}
              </button>
            )}
            <button
              className="vor-btn-fill"
              onClick={() => setShowFillModal(true)}
            >
              Заполнение ВОРа
            </button>
            <button
              className="vor-btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || saving}
            >
              {importing ? 'Чтение...' : 'Импорт Excel'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              hidden
            />
          </div>
        </div>

        {error && <div className="vor-error">{error}</div>}

        {genStats && (
          <div className="vor-gen-stats">
            <span>
              Файл скачан. Позиций: {genStats.totalPositions} (заголовков: {genStats.totalHeaders || 0}),
              заматчено: {genStats.totalMatched}, работ: {genStats.totalWorks}, материалов: {genStats.totalMaterials}.
            </span>
            {genStats.unmatched.length > 0 && (
              <span className="vor-gen-unmatched">
                {' '}Не заматчено: {genStats.unmatched.slice(0, 3).join(', ')}
                {genStats.unmatched.length > 3 && ` и ещё ${genStats.unmatched.length - 3}`}
              </span>
            )}
            <button className="vor-btn-close" onClick={() => setGenStats(null)}>x</button>
          </div>
        )}

        {importPreview && (
          <div className="vor-import-notice">
            <span>
              Загружено: {positionCount} позиций, {workCount} работ, {materialCount} материалов.
              {positionCount > 0 && workCount === 0 && ' Пустой ВОР — после импорта нажмите "Заполнить шаблонами".'}
            </span>
            <div className="vor-import-notice-actions">
              <button className="vor-btn-danger" onClick={handleCancelImport}>Отмена</button>
              <button className="vor-btn-primary" onClick={handleConfirmImport} disabled={saving}>
                {saving ? 'Сохранение...' : 'Подтвердить импорт'}
              </button>
            </div>
          </div>
        )}

        {displayRows.length === 0 ? (
          <div className="vor-empty">
            <p>Нет данных. Импортируйте пустой ВОР заказчика.</p>
          </div>
        ) : (
          <>
            <div className="vor-totals">
              <div className="vor-total-item">
                <span className="vor-total-label">Позиций:</span>
                <span className="vor-total-value">{positionCount}</span>
              </div>
              <div className="vor-total-item">
                <span className="vor-total-label">Работ:</span>
                <span className="vor-total-value">{workCount}</span>
              </div>
              <div className="vor-total-item">
                <span className="vor-total-label">Материалов:</span>
                <span className="vor-total-value">{materialCount}</span>
              </div>
              {totalWorkPrice > 0 && (
                <div className="vor-total-item">
                  <span className="vor-total-label">Итого работы:</span>
                  <span className="vor-total-value">{formatNumber(totalWorkPrice)} р.</span>
                </div>
              )}
              {totalMaterialPrice > 0 && (
                <div className="vor-total-item">
                  <span className="vor-total-label">Итого материалы:</span>
                  <span className="vor-total-value">{formatNumber(totalMaterialPrice)} р.</span>
                </div>
              )}
            </div>

            <div className="vor-table-wrap">
              <table className="vor-table">
                <thead>
                  <tr>
                    <th className="col-num">Код</th>
                    <th className="col-name">Наименование</th>
                    <th className="col-unit">Ед.</th>
                    <th className="col-qty">Кол-во</th>
                    <th className="col-coef">Коэф.</th>
                    <th className="col-inprice">В цене</th>
                    <th className="col-volume">Объём</th>
                    <th className="col-wprice">Цена работ</th>
                    <th className="col-mprice">Цена матер.</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <tbody key={`sec-${section}`}>
                      <tr className="vor-row-section">
                        <td colSpan={9} className="vor-section-name">{section}</td>
                      </tr>
                      {sectionMap[section].map((row, idx) => {
                        if (row.row_type === 'position') {
                          return (
                            <tr key={row.id || `p-${idx}`} className="vor-row vor-row-position">
                              <td className="col-num">{row.position_code || ''}</td>
                              <td className="col-name vor-position-name">{row.name}</td>
                              <td className="col-unit">{row.unit || ''}</td>
                              <td className="col-qty">
                                {row.qty_gp != null ? formatNumber(row.qty_gp) : (row.qty_customer != null ? formatNumber(row.qty_customer) : '')}
                              </td>
                              <td colSpan={5} className="vor-position-qty-label">
                                {row.qty_customer != null && `Заказчик: ${formatNumber(row.qty_customer)}`}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={row.id || `r-${section}-${idx}`}
                            className={`vor-row vor-row-${row.row_type}`}
                          >
                            <td className="col-num">{row.point_number || ''}</td>
                            <td className="col-name">
                              {row.row_kind && <span className="vor-row-kind">{row.row_kind}</span>}
                              {row.name}
                            </td>
                            <td className="col-unit">{row.unit || ''}</td>
                            <td className="col-qty">{row.norm ?? ''}</td>
                            <td className="col-coef">{row.coefficient !== 1 ? row.coefficient : ''}</td>
                            <td className="col-inprice">
                              <span className={row.in_price ? 'in-price-yes' : 'in-price-no'}>
                                {row.in_price ? 'в цене' : 'не в цене'}
                              </span>
                            </td>
                            <td className="col-volume">
                              {row.row_type === 'work' && (
                                <input
                                  type="number"
                                  className="vor-input vor-input-red"
                                  value={row.volume ?? ''}
                                  placeholder="объём"
                                  onChange={e => row.id && handleFieldChange(row.id, 'volume', e.target.value)}
                                  readOnly={!row.id}
                                />
                              )}
                            </td>
                            <td className="col-wprice">
                              {row.row_type === 'work' && (
                                <input
                                  type="number"
                                  className="vor-input vor-input-red"
                                  value={row.work_price ?? ''}
                                  placeholder="цена"
                                  onChange={e => row.id && handleFieldChange(row.id, 'work_price', e.target.value)}
                                  readOnly={!row.id}
                                />
                              )}
                            </td>
                            <td className="col-mprice">
                              {row.row_type === 'material' && (
                                <input
                                  type="number"
                                  className={`vor-input ${!row.in_price ? 'vor-input-red' : ''}`}
                                  value={row.material_price ?? ''}
                                  placeholder="цена"
                                  onChange={e => row.id && handleFieldChange(row.id, 'material_price', e.target.value)}
                                  readOnly={!row.id}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showFillModal && (
        <VorFillModal
          objectId={id}
          objectName={object?.name}
          onClose={() => setShowFillModal(false)}
        />
      )}
    </main>
  );
}

export default VorPage;

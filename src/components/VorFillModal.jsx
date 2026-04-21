import { useState, useRef, useEffect } from 'react';
import { parseEmptyVor, generateFilledVor, downloadBlob } from '../lib/vorExcelGenerator';
import { matchPositionDetailed, isHeader } from '../lib/vorMatcher';
import { loadWorkPrices } from '../lib/vorPriceLoader';
import { fetchWorkPrices, saveWorkPrices, countWorkPrices, entriesToPriceMap } from '../api/vorPrices';
import './VorFillModal.css';

const TPL_NAMES = {
  spk_profile:                  'Профиль стойка-ригель',
  spk_glass:                    'Стеклопакет',
  spk_broneplenka:              'Бронеплёнка',
  pvh_profile:                  'Профиль ПВХ',
  nvf_subsystem:                'Подсистема НВФ',
  insulation:                   'Утеплитель',
  nvf_cladding_clinker:         'Клинкер',
  nvf_cladding_cassette:        'Кассеты',
  nvf_cladding_concrete_tile:   'Бетонная плитка',
  nvf_cladding_fibrobeton:      'Фибробетон',
  nvf_cladding_ceramic:         'Керамика',
  nvf_cladding_porcelain:       'Керамогранит',
  nvf_cladding_natural_stone:   'Натур. камень',
  nvf_cladding_akp:             'АКП',
  nvf_cladding_fcp:             'ФЦП',
  nvf_cladding_galvanized:      'Оцинков. лист',
  nvf_cladding_arch_concrete:   'Арх. бетон',
  nvf_cladding_brick:           'Кирпич',
  nvf_cladding_profiles_vertical: 'Верт. профили',
  wet_facade:                   'Мокрый фасад',
  wet_facade_insulation:        'Мокрый (утеплитель)',
  wet_facade_finish:            'Штукатурный слой',
  wet_facade_paint:             'Окраска',
  flashings:                    'Откосы/отливы',
  pp_otsechi:                   'П/П отсечки',
  glass_railing:                'Стекл. ограждения',
  glass_railing_molled:         'Молл. ограждения',
  glass_canopy:                 'Козырёк (триплекс)',
  vent_grilles:                 'Вентрешётки',
  scaffolding:                  'Леса',
  kmd_spk:                      'КМД СПК',
  kmd_nvf:                      'КМД НВФ',
  doors_entrance:               'Двери входные',
  doors_tambour:                'Тамбурные двери',
  mockup:                       'Мокап',
};

const SECONDARY = new Set(['scaffolding', 'kmd_spk', 'kmd_nvf']);

function tplLabel(key) {
  return TPL_NAMES[key] || key;
}

export default function VorFillModal({ objectId, objectName, onClose }) {
  const [vorFile, setVorFile]       = useState(null);
  const [parsedVor, setParsedVor]   = useState(null);
  const [pricesFile, setPricesFile] = useState(null);
  const [pricesMode, setPricesMode] = useState('none');
  const [savedCount, setSavedCount] = useState(0);
  const [donstroy, setDonstroy]     = useState(false);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState(null);
  const [stats, setStats]           = useState(null);

  const vorInputRef    = useRef(null);
  const pricesInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const n = await countWorkPrices(objectId);
        if (cancelled) return;
        setSavedCount(n);
        setPricesMode(n > 0 ? 'saved' : 'none');
      } catch (err) {
        if (!cancelled) setError('Ошибка загрузки прайса: ' + err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [objectId]);

  // Выбор ВОР → авто-парсинг и показ матчинга
  async function handleVorFileChange(e) {
    const file = e.target.files[0] || null;
    setVorFile(file);
    setParsedVor(null);
    setStats(null);
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseEmptyVor(new Uint8Array(buf));
      if (parsed.stats.totalPositions === 0) {
        setError('Не найдено позиций в файле ВОР');
      } else {
        setParsedVor(parsed);
      }
    } catch (err) {
      setError('Ошибка чтения файла: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  // Матчинг-превью — вычисляется из parsedVor + donstroy (синхронно)
  let matchPreview = null;
  if (parsedVor) {
    const hdrOpts     = { priceAllWithQty: donstroy };
    const allPositions = parsedVor.sections.flatMap(s => s.positions);
    let matched = 0, unmatched = 0;

    const sections = parsedVor.sections.map(section => ({
      name: section.name,
      rows: section.positions.map(pos => {
        const hdr = isHeader(pos, allPositions, hdrOpts);
        const detail = hdr ? { templates: [], keyword: null } : matchPositionDetailed(pos.name, pos.noteCustomer || '');
        if (!hdr) { detail.templates.length > 0 ? matched++ : unmatched++; }
        return { code: pos.code, name: pos.name, templates: detail.templates, keyword: detail.keyword, isHeader: hdr };
      }),
    }));
    matchPreview = { sections, matched, unmatched, total: matched + unmatched };
  }

  async function handleGenerate() {
    if (!vorFile) { setError('Загрузите пустой ВОР'); return; }
    setBusy(true);
    setError(null);
    setStats(null);
    try {
      // Используем закэшированный parsed или парсим заново
      let parsed = parsedVor;
      if (!parsed) {
        const vorBuf = await vorFile.arrayBuffer();
        parsed = parseEmptyVor(new Uint8Array(vorBuf));
        if (parsed.stats.totalPositions === 0) {
          setError('Не найдено позиций в файле ВОР');
          setBusy(false);
          return;
        }
      }

      let workPrices = null;
      if (pricesMode === 'saved') {
        const entries = await fetchWorkPrices(objectId);
        if (entries.length > 0) workPrices = entriesToPriceMap(entries);
      } else if (pricesMode === 'new' && pricesFile) {
        const pb = await pricesFile.arrayBuffer();
        workPrices = loadWorkPrices(new Uint8Array(pb));
        const toSave = [];
        for (const [tplKey, entries] of workPrices) {
          for (const e of entries) {
            toSave.push({ tplKey, workName: e.name, price: e.price, costPath: e.costPath, unit: null });
          }
        }
        await saveWorkPrices(objectId, toSave);
        const newCount = await countWorkPrices(objectId);
        setSavedCount(newCount);
      }

      const result = generateFilledVor(parsed, { priceAllWithQty: donstroy, workPrices });
      const baseName = (objectName || 'ВОР').replace(/[<>:"/\\|?*]+/g, '');
      const suffix   = donstroy ? '_Донстрой' : '';
      downloadBlob(result.blob, `${baseName}${suffix}_расценённый.xlsx`);
      setStats(result.stats);
    } catch (err) {
      setError('Ошибка: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vfm-backdrop" onClick={onClose}>
      <div className="vfm-dialog" onClick={e => e.stopPropagation()}>

        <div className="vfm-header">
          <h3>Заполнение ВОРа</h3>
          <button className="vfm-close" onClick={onClose} disabled={busy}>×</button>
        </div>

        <div className="vfm-body">

          {/* 1. Пустой ВОР */}
          <div className="vfm-field">
            <label className="vfm-label">
              <span className="vfm-req">*</span> Пустой ВОР заказчика
            </label>
            <div className="vfm-file-row">
              <button className="vfm-btn-secondary" onClick={() => vorInputRef.current?.click()} disabled={busy}>
                Выбрать файл
              </button>
              <span className="vfm-filename">
                {vorFile ? vorFile.name : <i>не выбран</i>}
              </span>
              <input
                ref={vorInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleVorFileChange}
                hidden
              />
            </div>
          </div>

          {/* 2. Таблица матчинга (появляется сразу после выбора файла) */}
          {busy && !matchPreview && (
            <div className="vfm-analyzing">Анализирую позиции...</div>
          )}

          {matchPreview && (
            <div className="vfm-preview">
              <div className={`vfm-preview-summary ${matchPreview.unmatched > 0 ? 'has-unmatched' : 'all-matched'}`}>
                <span>
                  Распознано: <b>{matchPreview.matched}</b> из <b>{matchPreview.total}</b>
                </span>
                {matchPreview.unmatched > 0 && (
                  <span className="vfm-preview-warn">
                    · {matchPreview.unmatched} не распознано
                  </span>
                )}
              </div>

              <div className="vfm-preview-table-wrap">
                <table className="vfm-preview-table">
                  <colgroup>
                    <col className="col-pcode" />
                    <col className="col-pname" />
                    <col className="col-ptpl" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Код</th>
                      <th>Позиция</th>
                      <th>Шаблоны</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchPreview.sections.map(section => (
                      <>
                        <tr key={`sec-${section.name}`} className="vfm-sec-row">
                          <td colSpan={3}>{section.name}</td>
                        </tr>
                        {section.rows.map((row, i) => (
                          <tr
                            key={`${section.name}-${i}`}
                            className={
                              row.isHeader ? 'vfm-pos-header' :
                              row.templates.length === 0 ? 'vfm-pos-unmatched' :
                              'vfm-pos-matched'
                            }
                          >
                            <td className="col-pcode">{row.code || ''}</td>
                            <td className="col-pname" title={row.name}>
                              {row.name.length > 55 ? row.name.slice(0, 55) + '…' : row.name}
                            </td>
                            <td className="col-ptpl">
                              {row.isHeader && <span className="vfm-chip vfm-chip-hdr">заголовок</span>}
                              {!row.isHeader && row.templates.length === 0 && (
                                <span className="vfm-chip vfm-chip-none">× не распознано</span>
                              )}
                              {row.templates.map(t => (
                                <span
                                  key={t}
                                  className={`vfm-chip ${SECONDARY.has(t) ? 'vfm-chip-sec' : 'vfm-chip-main'}`}
                                  title={row.keyword ? `Правило: ${row.keyword}` : ''}
                                >
                                  {tplLabel(t)}
                                </span>
                              ))}
                              {row.keyword && row.templates.length > 0 && (
                                <span className="vfm-rule-hint" title={`Сработало правило: ${row.keyword}`}>
                                  ⓘ
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Прайс работ */}
          <div className="vfm-field">
            <label className="vfm-label">Прайс работ</label>
            {savedCount > 0 && (
              <label className="vfm-radio">
                <input type="radio" checked={pricesMode === 'saved'} onChange={() => setPricesMode('saved')} disabled={busy} />
                <span>Использовать сохранённый ({savedCount} цен)</span>
              </label>
            )}
            <label className="vfm-radio">
              <input type="radio" checked={pricesMode === 'new'} onChange={() => setPricesMode('new')} disabled={busy} />
              <span>Загрузить новый {savedCount > 0 && '(заменит сохранённый)'}</span>
            </label>
            {pricesMode === 'new' && (
              <div className="vfm-file-row vfm-indent">
                <button className="vfm-btn-secondary" onClick={() => pricesInputRef.current?.click()} disabled={busy}>
                  Выбрать файл
                </button>
                <span className="vfm-filename">
                  {pricesFile ? pricesFile.name : <i>не выбран</i>}
                </span>
                <input
                  ref={pricesInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setPricesFile(e.target.files[0] || null)}
                  hidden
                />
              </div>
            )}
            <label className="vfm-radio">
              <input type="radio" checked={pricesMode === 'none'} onChange={() => setPricesMode('none')} disabled={busy} />
              <span>Без прайса</span>
            </label>
          </div>

          {/* 4. Донстрой режим */}
          <div className="vfm-field">
            <label className="vfm-checkbox">
              <input type="checkbox" checked={donstroy} onChange={e => setDonstroy(e.target.checked)} disabled={busy} />
              <span>Донстрой-режим <small>(расценивать и родителей, и дочерние позиции)</small></span>
            </label>
          </div>

          {error && <div className="vfm-error">{error}</div>}

          {stats && (
            <div className="vfm-stats">
              <div><b>Готово!</b> Файл скачан.</div>
              <div>Позиций: {stats.totalPositions}</div>
              <div>Заголовков (не расценены): {stats.totalHeaders}</div>
              <div>Matched: {stats.totalMatched}</div>
              <div>Работ: {stats.totalWorks}</div>
              <div>Материалов: {stats.totalMaterials}</div>
              {stats.totalWorkPricesFilled > 0 && <div>Цен проставлено: {stats.totalWorkPricesFilled}</div>}
              {stats.unmatched.length > 0 && (
                <details className="vfm-unmatched">
                  <summary>Не распознано: {stats.unmatched.length}</summary>
                  {stats.unmatched.map((u, i) => <div key={i}>× {u}</div>)}
                </details>
              )}
            </div>
          )}
        </div>

        <div className="vfm-footer">
          <button className="vfm-btn-secondary" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
          <button
            className="vfm-btn-primary"
            onClick={handleGenerate}
            disabled={busy || !vorFile || (pricesMode === 'new' && !pricesFile)}
          >
            {busy ? 'Генерация...' : 'Расценить и скачать'}
          </button>
        </div>
      </div>
    </div>
  );
}

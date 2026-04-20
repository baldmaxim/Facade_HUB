import { useState, useRef, useEffect } from 'react';
import { parseEmptyVor, generateFilledVor, downloadBlob } from '../lib/vorExcelGenerator';
import { loadWorkPrices } from '../lib/vorPriceLoader';
import { fetchWorkPrices, saveWorkPrices, countWorkPrices, entriesToPriceMap } from '../api/vorPrices';
import './VorFillModal.css';

export default function VorFillModal({ objectId, objectName, onClose }) {
  const [vorFile, setVorFile] = useState(null);
  const [pricesFile, setPricesFile] = useState(null);
  const [pricesMode, setPricesMode] = useState('none'); // 'saved' | 'new' | 'none'
  const [savedCount, setSavedCount] = useState(0);
  const [donstroy, setDonstroy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const vorInputRef = useRef(null);
  const pricesInputRef = useRef(null);

  // При открытии — проверяем есть ли сохранённый прайс
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

  async function handleGenerate() {
    if (!vorFile) { setError('Загрузите пустой ВОР'); return; }
    setBusy(true);
    setError(null);
    setStats(null);
    try {
      // Парсим ВОР
      const vorBuf = await vorFile.arrayBuffer();
      const parsed = parseEmptyVor(new Uint8Array(vorBuf));
      if (parsed.stats.totalPositions === 0) {
        setError('Не найдено позиций в файле ВОР');
        setBusy(false);
        return;
      }

      // Подготавливаем прайс в зависимости от режима
      let workPrices = null;
      if (pricesMode === 'saved') {
        const entries = await fetchWorkPrices(objectId);
        if (entries.length > 0) workPrices = entriesToPriceMap(entries);
      } else if (pricesMode === 'new' && pricesFile) {
        const pb = await pricesFile.arrayBuffer();
        workPrices = loadWorkPrices(new Uint8Array(pb));
        // Сохраняем в БД: конвертируем Map → массив и пишем
        const toSave = [];
        for (const [tplKey, entries] of workPrices) {
          for (const e of entries) {
            toSave.push({
              tplKey,
              workName: e.name,
              price: e.price,
              costPath: e.costPath,
              unit: null,
            });
          }
        }
        await saveWorkPrices(objectId, toSave);
        const newCount = await countWorkPrices(objectId);
        setSavedCount(newCount);
      }

      // Генерируем
      const result = generateFilledVor(parsed, {
        priceAllWithQty: donstroy,
        workPrices,
      });

      const baseName = (objectName || 'ВОР').replace(/[<>:"/\\|?*]+/g, '');
      const suffix = donstroy ? '_Донстрой' : '';
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
                onChange={e => setVorFile(e.target.files[0] || null)}
                hidden
              />
            </div>
          </div>

          {/* 2. Прайс работ */}
          <div className="vfm-field">
            <label className="vfm-label">Прайс работ</label>

            {savedCount > 0 && (
              <label className="vfm-radio">
                <input
                  type="radio"
                  checked={pricesMode === 'saved'}
                  onChange={() => setPricesMode('saved')}
                  disabled={busy}
                />
                <span>Использовать сохранённый ({savedCount} цен)</span>
              </label>
            )}

            <label className="vfm-radio">
              <input
                type="radio"
                checked={pricesMode === 'new'}
                onChange={() => setPricesMode('new')}
                disabled={busy}
              />
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
              <input
                type="radio"
                checked={pricesMode === 'none'}
                onChange={() => setPricesMode('none')}
                disabled={busy}
              />
              <span>Без прайса</span>
            </label>
          </div>

          {/* 3. Донстрой режим */}
          <div className="vfm-field">
            <label className="vfm-checkbox">
              <input
                type="checkbox"
                checked={donstroy}
                onChange={e => setDonstroy(e.target.checked)}
                disabled={busy}
              />
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

import { useState, useRef, useEffect, Fragment } from 'react';
import { mutate as swrMutate } from 'swr';
import { parseEmptyVor, generateFilledVor, downloadBlob } from '../lib/vorExcelGenerator';
import { matchPositionDetailed, isHeader } from '../lib/vorMatcher';
import { loadWorkPrices } from '../lib/vorPriceLoader';
import { TPL_NAMES, SECONDARY, tplLabel } from '../lib/vorTplNames';
import { runReview, runPropose, collectProposeTargets } from '../lib/vorProposeRunner';
import { fetchWorkPrices, saveWorkPrices, countWorkPrices, entriesToPriceMap } from '../api/vorPrices';
import { fetchCustomTemplates, customTemplatesToMap, customTemplatesToRules } from '../api/vorCustomTemplates';
import { saveVorHistory } from '../api/vorHistory';
import { saveReviewFeedback } from '../api/vorReviewFeedback';
import { markAiProposalApplied } from '../api/vorAiProposals';
import VorReviewRow from './VorReviewRow';
import VorAltRow from './VorAltRow';
import VorAiPanel from './VorAiPanel';
import './VorFillModal.css';

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
  const [overrides, setOverrides]   = useState(new Map()); // Map<positionRef, string[]>
  const [editingKey, setEditingKey] = useState(null);      // 'sectionIdx:posIdx' или null
  const [customTemplates, setCustomTemplates] = useState({});   // map key→tpl
  const [customRules, setCustomRules]         = useState([]);   // fallback-правила
  const [reviews, setReviews]                 = useState(new Map()); // Map<pos, {verdict, score, comment, reasoning}>
  const [reviewing, setReviewing]             = useState(false);
  const [reviewProgress, setReviewProgress]   = useState({ done: 0, total: 0 });
  const [reviewError, setReviewError]         = useState(null);
  const [expandedReasoning, setExpandedReasoning] = useState(new Set()); // Set<rowKey>
  const [feedbackStatus, setFeedbackStatus]       = useState(new Map()); // Map<rowKey, 'saving'|'saved'|'error'>
  const [feedbackForm, setFeedbackForm]           = useState(null);      // {rowKey, correctTpls: string[], comment: string} | null
  const [proposals, setProposals]                 = useState(new Map()); // Map<pos, {tplKeys, score, reasoning, comment}>
  const [proposing, setProposing]                 = useState(false);
  const [proposeProgress, setProposeProgress]     = useState({ done: 0, total: 0 });
  const [expandedAlt, setExpandedAlt]             = useState(new Set()); // Set<rowKey> — раскрытые строки альтернатив

  const vorInputRef = useRef(null);
  const pricesInputRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, customRows] = await Promise.all([
          countWorkPrices(objectId),
          fetchCustomTemplates().catch(() => []),
        ]);
        if (cancelled) return;
        setSavedCount(n);
        setPricesMode(n > 0 ? 'saved' : 'none');
        setCustomTemplates(customTemplatesToMap(customRows));
        setCustomRules(customTemplatesToRules(customRows));
      } catch (err) {
        if (!cancelled) setError('Ошибка загрузки: ' + err.message);
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
    setOverrides(new Map());
    setEditingKey(null);
    setReviews(new Map());
    setReviewError(null);
    setReviewProgress({ done: 0, total: 0 });
    setExpandedReasoning(new Set());
    setFeedbackStatus(new Map());
    setFeedbackForm(null);
    setProposals(new Map());
    setProposeProgress({ done: 0, total: 0 });
    setExpandedAlt(new Set());
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

  // Матчинг-превью — вычисляется из parsedVor + donstroy + overrides (синхронно)
  let matchPreview = null;
  if (parsedVor) {
    const hdrOpts     = { priceAllWithQty: donstroy };
    const allPositions = parsedVor.sections.flatMap(s => s.positions);
    let matched = 0, unmatched = 0;
    const sections = parsedVor.sections.map((section, sectionIdx) => ({
      name: section.name,
      rows: section.positions.map((pos, posIdx) => {
        const hdr = isHeader(pos, allPositions, hdrOpts);
        const autoMatch = hdr ? { templates: [], keyword: null, isCustom: false } : matchPositionDetailed(pos.name, pos.noteCustomer || '', customRules);
        const override  = overrides.get(pos);
        const templates = override !== undefined ? override : autoMatch.templates;
        if (!hdr) { templates.length > 0 ? matched++ : unmatched++; }
        return {
          pos,
          rowKey: `${sectionIdx}:${posIdx}`,
          code: pos.code,
          name: pos.name,
          templates,
          keyword: autoMatch.keyword,
          isCustom: autoMatch.isCustom || false,
          isHeader: hdr,
          isOverridden: override !== undefined,
        };
      }),
    }));
    matchPreview = { sections, matched, unmatched, total: matched + unmatched };
  }

  async function submitFeedback(row, isCorrect, correctTpls, userComment) {
    const review = reviews.get(row.pos);
    if (!review) return;
    setFeedbackStatus(prev => new Map(prev).set(row.rowKey, 'saving'));
    try {
      await saveReviewFeedback({
        noteCustomer: row.pos.noteCustomer || row.pos.name || '',
        posName: row.pos.name || '',
        engineTplKeys: row.templates || [],
        correctTplKeys: isCorrect ? null : (correctTpls || []),
        aiVerdict: review.verdict, aiConfidence: review.score,
        aiComment: review.comment, aiReasoning: review.reasoning,
        userIsCorrect: isCorrect, userComment: userComment || null, objectId,
      });
      setFeedbackStatus(prev => new Map(prev).set(row.rowKey, 'saved'));
      setFeedbackForm(null);
    } catch (err) {
      setFeedbackStatus(prev => new Map(prev).set(row.rowKey, 'error'));
      console.error('saveReviewFeedback:', err);
    }
  }

  function openIncorrectForm(row) {
    setFeedbackForm({
      rowKey: row.rowKey,
      correctTpls: [...(row.templates || [])],   // старт от того, что сейчас в строке
      comment: '',
    });
  }

  function toggleReasoning(rowKey) {
    setExpandedReasoning(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
      return next;
    });
  }

  function toggleOverrideTpl(pos, key, currentTemplates) {
    setOverrides(prev => {
      const next = new Map(prev);
      // Если override ещё не заводили — стартуем от текущего (авто) набора,
      // чтобы первый же клик по галке не сбросил подобранные движком шаблоны.
      const cur = next.has(pos) ? next.get(pos) : [...(currentTemplates || [])];
      const idx = cur.indexOf(key);
      const updated = idx >= 0 ? cur.filter(k => k !== key) : [...cur, key];
      next.set(pos, updated);
      return next;
    });
  }
  function resetOverride(pos) {
    setOverrides(prev => {
      const next = new Map(prev);
      next.delete(pos);
      return next;
    });
  }

  async function handleReviewAll() {
    if (!matchPreview) return;
    setReviewing(true); setReviewError(null); setReviews(new Map());
    await runReview(matchPreview, {
      onStart:    total        => setReviewProgress({ done: 0, total }),
      onEmpty:    ()           => setReviewError('Нет позиций для ревью'),
      onResult:   map          => setReviews(map),
      onProgress: (done, total)=> setReviewProgress({ done, total }),
    });
    setReviewing(false);
  }
  async function handleProposeAll() {
    if (!matchPreview) return;
    setProposing(true);
    setProposals(new Map());
    await runPropose(
      matchPreview,
      {
        onStart:   total      => setProposeProgress({ done: 0, total }),
        onResult:  map        => setProposals(map),
        onProgress:(done,total)=> setProposeProgress({ done, total }),
      },
      { reviews, scoreThreshold: 70, objectId },
    );
    setProposing(false);
  }

  function applyProposal(pos, tplKeys, mode = 'replace', currentTemplates = []) {
    if (!tplKeys || tplKeys.length === 0) return;
    const next = mode === 'merge'
      ? Array.from(new Set([...(currentTemplates || []), ...tplKeys]))
      : [...tplKeys];
    setOverrides(prev => { const n = new Map(prev); n.set(pos, next); return n; });
    const pr = proposals.get(pos);
    if (pr && pr.proposalId) {
      markAiProposalApplied(pr.proposalId, mode, next).catch(err => console.error('markAiProposalApplied:', err));
    }
    setProposals(prev => { const n = new Map(prev); n.delete(pos); return n; });
  }

  function toggleAlt(rowKey) {
    setExpandedAlt(prev => { const n = new Set(prev); n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey); return n; });
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

      const result = generateFilledVor(parsed, { priceAllWithQty: donstroy, workPrices, overrides, customTemplates, customRules, reviews });
      const baseName = (objectName || 'ВОР').replace(/[<>:"/\\|?*]+/g, '');
      const suffix   = donstroy ? '_Донстрой' : '';
      const fileName = `${baseName}${suffix}_расценённый.xlsx`;
      downloadBlob(result.blob, fileName);
      setStats(result.stats);
      // Сохраняем в историю (не блокирует скачивание если упало)
      saveVorHistory(objectId, result.blob, fileName, result.stats)
        .then(() => swrMutate(['vor-history', objectId]))
        .catch(err => console.error('Не удалось сохранить в историю:', err));
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

          {matchPreview && (() => {
            const proposeCount = collectProposeTargets(matchPreview, reviews, 70).length;
            return (
            <div className="vfm-preview">
              <VorAiPanel
                matchPreview={matchPreview}
                reviewsCount={reviews.size}
                proposeCount={proposeCount}
                reviewing={reviewing}
                proposing={proposing}
                busy={busy}
                onReview={handleReviewAll}
                onPropose={handleProposeAll}
                reviewProgress={reviewProgress}
                proposeProgress={proposeProgress}
                reviewError={reviewError}
              />
              {!proposing && proposals.size > 0 && (
                <div className="vfm-review-banner vfm-review-banner-done">
                  <span>🤖 Gemini предложил шаблоны для <b>{proposals.size}</b> позиций. Нераспознанные — кнопка «Применить» в строке; для распознанных — значок 🤖 рядом с кружком.</span>
                </div>
              )}

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
                      <Fragment key={`sec-${section.name}`}>
                        <tr className="vfm-sec-row">
                          <td colSpan={3}>{section.name}</td>
                        </tr>
                        {section.rows.map((row) => (
                          <Fragment key={row.rowKey}>
                          <tr
                            className={
                              row.isHeader ? 'vfm-pos-header' :
                              row.templates.length === 0 ? 'vfm-pos-unmatched' :
                              row.isOverridden ? 'vfm-pos-override' :
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
                                (() => {
                                  const pr = proposals.get(row.pos);
                                  if (!pr) {
                                    return <span className="vfm-chip vfm-chip-none">× не распознано</span>;
                                  }
                                  if (pr.tplKeys.length === 0) {
                                    return (
                                      <span className="vfm-chip vfm-chip-none" title={pr.comment || ''}>
                                        🤖 Gemini: нет подходящих шаблонов
                                      </span>
                                    );
                                  }
                                  return (
                                    <>
                                      <span className="vfm-propose-label" title={`${pr.score}/100 — ${pr.comment}`}>🤖 Предлагает ({pr.score}/100):</span>
                                      {pr.tplKeys.map(t => (
                                        <span
                                          key={t}
                                          className={`vfm-chip vfm-chip-propose ${SECONDARY.has(t) ? 'vfm-chip-sec' : ''}`}
                                          title={pr.reasoning || pr.comment || ''}
                                        >
                                          {tplLabel(t)}
                                        </span>
                                      ))}
                                      <button
                                        type="button"
                                        className="vfm-propose-apply"
                                        onClick={() => applyProposal(row.pos, pr.tplKeys, 'replace', row.templates)}
                                        title="Принять предложение Gemini (добавить в override)"
                                      >
                                        Применить
                                      </button>
                                    </>
                                  );
                                })()
                              )}
                              {row.templates.map(t => (
                                <span
                                  key={t}
                                  className={`vfm-chip ${SECONDARY.has(t) ? 'vfm-chip-sec' : 'vfm-chip-main'}`}
                                  title={row.isOverridden ? 'Ручной override' : (row.keyword ? `Правило: ${row.keyword}` : '')}
                                >
                                  {tplLabel(t)}
                                </span>
                              ))}
                              {row.keyword && row.templates.length > 0 && !row.isOverridden && (
                                <span className="vfm-rule-hint" title={`${row.isCustom ? 'Custom-шаблон. ' : ''}Сработало правило: ${row.keyword}`}>
                                  {row.isCustom ? '⚡' : 'ⓘ'}
                                </span>
                              )}
                              {row.isOverridden && (
                                <span className="vfm-override-badge" title="Ручной выбор шаблонов">✎</span>
                              )}
                              {(() => {
                                const r = reviews.get(row.pos);
                                if (!r) return null;
                                const score = r.score ?? 0;
                                const tip = `Оценка подбора: ${score}/100\n${r.comment || ''}${r.reasoning ? '\n\n(клик — развёрнутый разбор)' : ''}`;
                                const expanded = expandedReasoning.has(row.rowKey);
                                return (
                                  <button
                                    type="button"
                                    className={`vfm-verdict-wrap vfm-verdict-${r.verdict}`}
                                    title={tip}
                                    onClick={() => r.reasoning && toggleReasoning(row.rowKey)}
                                    disabled={!r.reasoning}
                                  >
                                    <span className="vfm-verdict-dot">●</span>
                                    <span className="vfm-verdict-pct">{score}</span>
                                    {r.reasoning && <span className="vfm-verdict-caret">{expanded ? '▾' : '▸'}</span>}
                                  </button>
                                );
                              })()}
                              {(() => {
                                if (row.isHeader || row.templates.length === 0) return null;
                                const pr = proposals.get(row.pos);
                                if (!pr || !pr.tplKeys || pr.tplKeys.length === 0) return null;
                                const open = expandedAlt.has(row.rowKey);
                                return (
                                  <button
                                    type="button"
                                    className="vfm-alt-badge"
                                    title={`Gemini предлагает альтернативный подбор (${pr.score}/100). Клик — показать.`}
                                    onClick={() => toggleAlt(row.rowKey)}
                                  >
                                    🤖 <span className="vfm-alt-score">{pr.score}</span>
                                    <span className="vfm-verdict-caret">{open ? '▾' : '▸'}</span>
                                  </button>
                                );
                              })()}
                              {!row.isHeader && (
                                <button
                                  type="button"
                                  className="vfm-edit-btn"
                                  onClick={() => setEditingKey(editingKey === row.rowKey ? null : row.rowKey)}
                                  title="Изменить шаблоны"
                                >
                                  ✏
                                </button>
                              )}
                              {editingKey === row.rowKey && (
                                <div className="vfm-edit-popup" onClick={e => e.stopPropagation()}>
                                  <div className="vfm-edit-popup-header">
                                    <span>Выбери шаблоны</span>
                                    <button type="button" className="vfm-edit-close" onClick={() => setEditingKey(null)}>×</button>
                                  </div>
                                  <div className="vfm-edit-popup-list">
                                    {Object.keys(TPL_NAMES).sort((a, b) => tplLabel(a).localeCompare(tplLabel(b), 'ru')).map(k => (
                                      <label key={k} className="vfm-edit-row">
                                        <input
                                          type="checkbox"
                                          checked={row.templates.includes(k)}
                                          onChange={() => toggleOverrideTpl(row.pos, k, row.templates)}
                                        />
                                        <span className={SECONDARY.has(k) ? 'vfm-edit-sec' : ''}>{tplLabel(k)}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <div className="vfm-edit-popup-footer">
                                    {row.isOverridden && (
                                      <button type="button" className="vfm-btn-secondary vfm-edit-reset" onClick={() => { resetOverride(row.pos); setEditingKey(null); }}>
                                        Сбросить к авто
                                      </button>
                                    )}
                                    <button type="button" className="vfm-btn-primary" onClick={() => setEditingKey(null)}>Готово</button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                          <VorReviewRow
                            review={reviews.get(row.pos)}
                            expanded={expandedReasoning.has(row.rowKey)}
                            feedbackStatus={feedbackStatus.get(row.rowKey)}
                            feedbackForm={feedbackForm && feedbackForm.rowKey === row.rowKey ? feedbackForm : null}
                            onFormChange={next => setFeedbackForm(typeof next === 'function' ? next(feedbackForm) : next)}
                            onSubmitCorrect={() => submitFeedback(row, true, null, null)}
                            onOpenIncorrect={() => openIncorrectForm(row)}
                            onSubmitIncorrect={() => submitFeedback(row, false, feedbackForm.correctTpls, feedbackForm.comment)}
                          />
                          {!row.isHeader && row.templates.length > 0 && (
                            <VorAltRow
                              row={row}
                              proposal={proposals.get(row.pos)}
                              expanded={expandedAlt.has(row.rowKey)}
                              onReplace={() => { applyProposal(row.pos, proposals.get(row.pos).tplKeys, 'replace', row.templates); toggleAlt(row.rowKey); }}
                              onMerge={() => { applyProposal(row.pos, proposals.get(row.pos).tplKeys, 'merge', row.templates); toggleAlt(row.rowKey); }}
                              onCancel={() => toggleAlt(row.rowKey)}
                            />
                          )}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

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

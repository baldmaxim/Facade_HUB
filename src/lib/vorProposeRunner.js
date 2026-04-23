// Раннеры AI-ревьюера: runReview (проверка распознанных) и runPropose (дорисовка нераспознанных).
// Оба шагают по позициям последовательно, обновляя Map инкрементально через колбеки.
// Вынесено из VorFillModal.jsx, чтобы не разрастался лимит строк на файл.
import { supabase } from './supabase';

async function readErrorDetail(error) {
  let detail = error?.message || 'unknown';
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.text === 'function') {
      const body = await ctx.text();
      if (body) detail = body.slice(0, 400);
    }
  } catch { /* ignore */ }
  return detail;
}

/**
 * Прогон review-режима по всем распознанным (не-header, templates.length > 0) позициям.
 *
 * @param {object} matchPreview
 * @param {{ onStart, onProgress, onResult, onEmpty, onDone }} cb
 */
export async function runReview(matchPreview, cb) {
  const { onStart, onProgress, onResult, onEmpty, onDone } = cb;
  const targets = [];
  for (const section of matchPreview.sections) {
    for (const row of section.rows) {
      if (row.isHeader) continue;
      if (!row.templates || row.templates.length === 0) continue;
      targets.push({ pos: row.pos, tplKeys: [...row.templates], posCode: row.code || '' });
    }
  }
  if (targets.length === 0) { onEmpty && onEmpty(); onDone && onDone(); return; }
  onStart && onStart(targets.length);

  const results = new Map();
  for (let i = 0; i < targets.length; i++) {
    const { pos, tplKeys, posCode } = targets[i];
    try {
      const { data, error } = await supabase.functions.invoke('vor-review', {
        body: {
          noteCustomer: pos.noteCustomer || pos.name || '',
          tplKeys, posCode,
        },
      });
      if (error) {
        const detail = await readErrorDetail(error);
        results.set(pos, { verdict: 'yellow', score: 50, comment: 'Ошибка: ' + detail, reasoning: '' });
      } else if (data?.verdict) {
        results.set(pos, {
          verdict: data.verdict,
          score: typeof data.score === 'number' ? data.score : 50,
          comment: data.comment || '',
          reasoning: data.reasoning || '',
        });
      } else {
        results.set(pos, { verdict: 'yellow', score: 50, comment: 'Пустой ответ модели', reasoning: '' });
      }
    } catch (err) {
      results.set(pos, { verdict: 'yellow', score: 50, comment: 'Сбой сети: ' + (err?.message || err), reasoning: '' });
    }
    onResult && onResult(new Map(results));
    onProgress && onProgress(i + 1, targets.length);
  }
  onDone && onDone();
}

/**
 * @param {object} matchPreview — структура из VorFillModal (sections → rows)
 * @param {{ onStart, onProgress, onResult, onDone }} callbacks
 *   onStart(total) — сколько позиций будет прогнано
 *   onProgress(done, total) — вызов после каждой позиции
 *   onResult(map) — обновлённый Map<pos, {tplKeys,score,reasoning,comment}>
 *   onDone() — по завершении (всегда)
 */
// Считает цели propose-прогона: unmatched + matched с review.score < scoreThreshold.
// reviews: Map<pos, {score, ...}> | null.
export function collectProposeTargets(matchPreview, reviews, scoreThreshold = 70) {
  const targets = [];
  if (!matchPreview) return targets;
  for (const section of matchPreview.sections) {
    for (const row of section.rows) {
      if (row.isHeader) continue;
      const hasTemplates = row.templates && row.templates.length > 0;
      if (!hasTemplates) {
        targets.push({ pos: row.pos, posCode: row.code || '', reason: 'unmatched' });
        continue;
      }
      const r = reviews && reviews.get(row.pos);
      if (r && typeof r.score === 'number' && r.score < scoreThreshold) {
        targets.push({ pos: row.pos, posCode: row.code || '', reason: 'low-score' });
      }
    }
  }
  return targets;
}

export async function runPropose(matchPreview, cb, opts = {}) {
  const { onStart, onProgress, onResult, onDone } = cb;
  const { reviews = null, scoreThreshold = 70 } = opts;
  const targets = collectProposeTargets(matchPreview, reviews, scoreThreshold);
  if (targets.length === 0) { onDone && onDone(); return; }

  onStart && onStart(targets.length);
  const results = new Map();
  for (let i = 0; i < targets.length; i++) {
    const { pos, posCode } = targets[i];
    try {
      const { data, error } = await supabase.functions.invoke('vor-review', {
        body: {
          mode: 'propose',
          noteCustomer: pos.noteCustomer || pos.name || '',
          posName: pos.name || '',
          posCode,
        },
      });
      if (error) {
        const detail = await readErrorDetail(error);
        results.set(pos, { tplKeys: [], score: 0, reasoning: '', comment: 'Ошибка: ' + detail });
      } else {
        results.set(pos, {
          tplKeys: Array.isArray(data?.tplKeys) ? data.tplKeys : [],
          score: typeof data?.score === 'number' ? data.score : 0,
          reasoning: data?.reasoning || '',
          comment: data?.comment || '',
        });
      }
    } catch (err) {
      results.set(pos, { tplKeys: [], score: 0, reasoning: '', comment: 'Сбой сети: ' + (err?.message || err) });
    }
    onResult && onResult(new Map(results));
    onProgress && onProgress(i + 1, targets.length);
  }
  onDone && onDone();
}

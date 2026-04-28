// Runner для vor-tech-advisor: «Найти упущенное» — для каждой распознанной
// позиции (templates.length > 0, не header) Gemini ищет упущенные по технологии
// материалы/работы. Энциклопедия фасадных систем встроена в SYSTEM_PROMPT
// Edge Function, на клиенте — только сборка currentMaterials и payload.
//
// ВАЖНО: используем прямой fetch (не supabase.functions.invoke), потому что
// invoke имеет короткий дефолтный таймаут, а tech-advisor отвечает 3–10 сек
// (большой system-promp + cold start). Прямой fetch + AbortSignal даёт нам
// контроль на 60 секунд + один retry на сетевую ошибку.
import { TEMPLATES } from './vorTemplates';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/vor-tech-advisor`;
const REQUEST_TIMEOUT_MS = 60000;

async function callTechAdvisor(payload) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Один retry на сетевые/abort ошибки (cold start, временная сеть).
// Ошибки уровня модели (200 + comment с «Отладка:») не ретраятся.
async function callWithRetry(payload) {
  try {
    return await callTechAdvisor(payload);
  } catch {
    await new Promise(r => setTimeout(r, 1500));
    return await callTechAdvisor(payload);
  }
}

// Плоский список названий работ и материалов из набора tplKeys.
// AI сравнивает по этому списку, чтобы не дублировать уже заведённое.
export function collectMaterialsFromTemplates(tplKeys) {
  const out = [];
  const seen = new Set();
  const push = (name) => {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  for (const key of tplKeys || []) {
    const tpl = TEMPLATES[key];
    if (!tpl) continue;
    if (Array.isArray(tpl.works))     for (const w of tpl.works)     push(w.name);
    if (Array.isArray(tpl.materials)) for (const m of tpl.materials) push(m.name);
    if (Array.isArray(tpl.workMaterials)) {
      for (const wm of tpl.workMaterials) {
        push(wm.work?.name);
        if (Array.isArray(wm.materials)) for (const m of wm.materials) push(m.name);
      }
    }
  }
  return out;
}

/**
 * Прогон tech-advisor по всем распознанным позициям.
 *
 * @param {object} matchPreview
 * @param {{ onStart, onProgress, onResult, onEmpty, onDone }} cb
 */
export async function runTechAdvisor(matchPreview, cb) {
  const { onStart, onProgress, onResult, onEmpty, onDone } = cb;
  const targets = [];
  for (const section of matchPreview.sections) {
    for (const row of section.rows) {
      if (row.isHeader) continue;
      if (!row.templates || row.templates.length === 0) continue;
      targets.push({
        pos: row.pos,
        tplKeys: [...row.templates],
        posCode: row.code || '',
      });
    }
  }
  if (targets.length === 0) { onEmpty && onEmpty(); onDone && onDone(); return; }
  onStart && onStart(targets.length);

  const results = new Map();
  for (let i = 0; i < targets.length; i++) {
    const { pos, tplKeys, posCode } = targets[i];
    const currentMaterials = collectMaterialsFromTemplates(tplKeys);
    let entry;
    try {
      const data = await callWithRetry({
        posCode,
        posName: pos.name || '',
        noteCustomer: pos.noteCustomer || pos.name || '',
        currentTplKeys: tplKeys,
        currentMaterials,
      });
      entry = {
        additions: Array.isArray(data?.additions) ? data.additions : [],
        confidence: typeof data?.confidence === 'number' ? data.confidence : 0,
        reasoning: data?.reasoning || '',
        comment: data?.comment || '',
      };
    } catch (err) {
      const msg = err?.name === 'AbortError'
        ? 'таймаут 60 сек — функция холодная или Gemini завис'
        : (err?.message || String(err));
      entry = { additions: [], confidence: 0, reasoning: '', comment: 'Сбой сети: ' + msg };
    }
    results.set(pos, entry);
    onResult && onResult(new Map(results));
    onProgress && onProgress(i + 1, targets.length);
  }
  onDone && onDone();
}

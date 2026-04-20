import { supabase } from '../lib/supabase';

/**
 * Получить прайс работ для объекта.
 * @returns {Promise<Array<{costPath, workName, unit, price, tplKey}>>}
 */
export async function fetchWorkPrices(objectId) {
  const { data, error } = await supabase
    .from('vor_work_prices')
    .select('*')
    .eq('object_id', objectId);
  if (error) throw error;
  return (data || []).map(r => ({
    costPath: r.cost_path,
    workName: r.work_name,
    unit: r.unit,
    price: parseFloat(r.price),
    tplKey: r.tpl_key,
  }));
}

/**
 * Подсчитать количество цен для объекта.
 * @returns {Promise<number>}
 */
export async function countWorkPrices(objectId) {
  const { count, error } = await supabase
    .from('vor_work_prices')
    .select('id', { count: 'exact', head: true })
    .eq('object_id', objectId);
  if (error) throw error;
  return count || 0;
}

/**
 * Заменить прайс для объекта: удалить все существующие записи и вставить новые.
 * @param {string} objectId
 * @param {Array<{costPath, workName, unit, price, tplKey}>} entries
 */
export async function saveWorkPrices(objectId, entries) {
  // Удаляем старые цены
  const { error: delErr } = await supabase
    .from('vor_work_prices')
    .delete()
    .eq('object_id', objectId);
  if (delErr) throw delErr;

  if (!entries || !entries.length) return;

  // Вставляем новые (только с ценой > 0)
  const rows = entries
    .filter(e => Number.isFinite(e.price) && e.price > 0)
    .map(e => ({
      object_id: objectId,
      cost_path: e.costPath || null,
      work_name: e.workName,
      unit: e.unit || null,
      price: e.price,
      tpl_key: e.tplKey,
    }));

  if (!rows.length) return;
  const { error: insErr } = await supabase.from('vor_work_prices').insert(rows);
  if (insErr) throw insErr;
}

/**
 * Удалить весь прайс объекта.
 */
export async function deleteWorkPrices(objectId) {
  const { error } = await supabase
    .from('vor_work_prices')
    .delete()
    .eq('object_id', objectId);
  if (error) throw error;
}

/**
 * Преобразовать массив цен в Map формат совместимый с vorPriceLoader.findWorkPrice.
 * @returns {Map<tplKey, Array<{name, price, costPath}>>}
 */
export function entriesToPriceMap(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!e.tplKey || !Number.isFinite(e.price) || e.price <= 0) continue;
    if (!map.has(e.tplKey)) map.set(e.tplKey, []);
    map.get(e.tplKey).push({
      name: e.workName,
      price: e.price,
      costPath: e.costPath || '',
    });
  }
  return map;
}

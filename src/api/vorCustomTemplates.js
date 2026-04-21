import { supabase } from '../lib/supabase';

/**
 * Пользовательские шаблоны движка ВОР.
 * Дополняют кодовые шаблоны (src/lib/vorTemplates.js) — не заменяют их.
 * Используются как fallback при матчинге (если ни одно кодовое правило не сработало).
 */

export async function fetchCustomTemplates() {
  const { data, error } = await supabase
    .from('vor_custom_templates')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCustomTemplate(tpl) {
  const { data, error } = await supabase
    .from('vor_custom_templates')
    .insert([tpl])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomTemplate(key, fields) {
  const { data, error } = await supabase
    .from('vor_custom_templates')
    .update(fields)
    .eq('key', key)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCustomTemplate(key) {
  const { error } = await supabase
    .from('vor_custom_templates')
    .delete()
    .eq('key', key);
  if (error) throw error;
}

/**
 * Преобразует DB-строку в формат, совместимый с кодовыми шаблонами.
 * DB: { key, label, category, cost_path, data, keywords, secondary }
 * → Runtime: { costPath, ...data (workMaterials/works/materials) }
 */
export function dbRowToTemplate(row) {
  return {
    costPath: row.cost_path,
    ...(row.data || {}),
  };
}

/**
 * Превращает массив DB-строк в Map<key, runtimeTemplate> для слияния с кодовыми TEMPLATES.
 */
export function customTemplatesToMap(rows) {
  const map = {};
  for (const row of rows) {
    map[row.key] = dbRowToTemplate(row);
  }
  return map;
}

/**
 * Превращает массив DB-строк в правила матчинга, совместимые с MATCH_RULES из кода.
 * Каждая строка → одно правило с keywords и templates=[key] + secondary.
 */
export function customTemplatesToRules(rows) {
  return rows.map(row => ({
    keywords: row.keywords || [],
    templates: [row.key],
    secondary: row.secondary || [],
    _customKey: row.key, // для отладки
  }));
}

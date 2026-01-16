import { supabase } from '../lib/supabase';

export async function fetchObjectWorks(objectId) {
  const { data, error } = await supabase
    .from('object_works')
    .select('*')
    .eq('object_id', objectId)
    .order('work_type_id');

  if (error) throw error;
  return data || [];
}

export async function upsertObjectWork({ object_id, work_type_id, field, value }) {
  // Сначала пробуем найти существующую запись
  const { data: existing } = await supabase
    .from('object_works')
    .select('id')
    .eq('object_id', object_id)
    .eq('work_type_id', work_type_id)
    .maybeSingle();

  if (existing) {
    // Обновляем существующую запись
    const { error } = await supabase
      .from('object_works')
      .update({ [field]: value })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    // Создаём новую запись
    const { error } = await supabase
      .from('object_works')
      .insert([{ object_id, work_type_id, [field]: value }]);
    if (error) throw error;
  }
}

/**
 * Массовое обновление данных object_works из Excel
 * @param {string} objectId - ID объекта
 * @param {Array} items - массив { work_type_id, volume, work_per_unit, materials_per_unit }
 * @returns {Promise<{updated: number, created: number}>}
 */
export async function bulkUpsertObjectWorks(objectId, items) {
  let updated = 0;
  let created = 0;

  for (const item of items) {
    const { work_type_id, volume, work_per_unit, materials_per_unit } = item;

    // Проверяем существование записи
    const { data: existing } = await supabase
      .from('object_works')
      .select('id')
      .eq('object_id', objectId)
      .eq('work_type_id', work_type_id)
      .maybeSingle();

    const updateData = {};
    if (volume !== null) updateData.volume = volume;
    if (work_per_unit !== null) updateData.work_per_unit = work_per_unit;
    if (materials_per_unit !== null) updateData.materials_per_unit = materials_per_unit;

    if (Object.keys(updateData).length === 0) continue;

    if (existing) {
      const { error } = await supabase
        .from('object_works')
        .update(updateData)
        .eq('id', existing.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase
        .from('object_works')
        .insert([{
          object_id: objectId,
          work_type_id,
          ...updateData
        }]);
      if (error) throw error;
      created++;
    }
  }

  return { updated, created };
}

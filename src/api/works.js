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

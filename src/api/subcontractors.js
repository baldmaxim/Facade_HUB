import { supabase } from '../lib/supabase';

// Получить субподрядчика для объекта
export async function fetchSubcontractor(objectId) {
  const { data, error } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('object_id', objectId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

// Создать или обновить субподрядчика для объекта
export async function upsertSubcontractor(objectId, name, kpUrl) {
  // Сначала проверяем, есть ли уже запись для этого объекта
  const { data: existing } = await supabase
    .from('subcontractors')
    .select('id')
    .eq('object_id', objectId)
    .single();

  if (existing) {
    // Обновляем существующую запись
    const { data, error } = await supabase
      .from('subcontractors')
      .update({ name, kp_url: kpUrl })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Создаём новую запись
    const { data, error } = await supabase
      .from('subcontractors')
      .insert([{ object_id: objectId, name, kp_url: kpUrl }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// Удалить субподрядчика
export async function deleteSubcontractor(id) {
  const { error } = await supabase
    .from('subcontractors')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

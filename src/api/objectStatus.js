import { supabase } from '../lib/supabase';

/**
 * Получить все статусы объектов
 * @returns {Promise<Array>} Массив статусов
 */
export async function fetchAllObjectStatuses() {
  const { data, error } = await supabase
    .from('object_status')
    .select('*')
    .order('created_at');

  if (error) throw error;
  return data || [];
}

/**
 * Создать новый статус объекта
 * @param {string} name - Название статуса
 * @returns {Promise<Object>} Созданный статус
 */
export async function createObjectStatus(name) {
  const { data, error } = await supabase
    .from('object_status')
    .insert([{ name }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Обновить статус объекта
 * @param {string} id - ID статуса
 * @param {string} name - Новое название
 * @returns {Promise<Object>} Обновленный статус
 */
export async function updateObjectStatus(id, name) {
  const { data, error } = await supabase
    .from('object_status')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Удалить статус объекта
 * @param {string} id - ID статуса
 */
export async function deleteObjectStatus(id) {
  const { error } = await supabase
    .from('object_status')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

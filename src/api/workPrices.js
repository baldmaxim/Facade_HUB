import { supabase } from '../lib/supabase';

/**
 * Получить цены работ для объекта вместе с информацией о видах работ и единицах измерения
 * @param {string} objectId - ID объекта
 * @returns {Promise<Array>} Массив цен работ с информацией о работах
 */
export async function fetchWorkPrices(objectId) {
  const { data, error } = await supabase
    .from('work_price')
    .select(`
      id,
      object_id,
      work_type_id,
      price,
      created_at,
      updated_at,
      work_types:work_type_id (
        id,
        name,
        unit:unit_id (
          id,
          name
        )
      )
    `)
    .eq('object_id', objectId)
    .order('work_type_id');

  if (error) throw error;
  return data || [];
}

/**
 * Получить все виды работ с единицами измерения
 * @returns {Promise<Array>} Массив видов работ
 */
export async function fetchAllWorkTypes() {
  const { data, error } = await supabase
    .from('work_types')
    .select(`
      id,
      name,
      unit:unit_id (
        id,
        name
      )
    `)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Обновить или создать цену работы для объекта
 * @param {string} objectId - ID объекта
 * @param {string} workTypeId - ID вида работ
 * @param {number} price - Цена
 * @returns {Promise<void>}
 */
export async function upsertWorkPrice(objectId, workTypeId, price) {
  const { error } = await supabase
    .from('work_price')
    .upsert({
      object_id: objectId,
      work_type_id: workTypeId,
      price
    }, {
      onConflict: 'object_id,work_type_id'
    });

  if (error) throw error;
}

/**
 * Удалить цену работы
 * @param {string} workPriceId - ID записи work_price
 * @returns {Promise<void>}
 */
export async function deleteWorkPrice(workPriceId) {
  const { error } = await supabase
    .from('work_price')
    .delete()
    .eq('id', workPriceId);

  if (error) throw error;
}

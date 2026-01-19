import { supabase } from '../lib/supabase';

/**
 * Получить фактические цены работ для объекта вместе с информацией о видах работ и единицах измерения
 * @param {string} objectId - ID объекта
 * @returns {Promise<Array>} Массив фактических цен работ с информацией о работах
 */
export async function fetchWorkPricesFact(objectId) {
  const { data, error } = await supabase
    .from('work_price_fact')
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
 * Получить все виды работ с единицами измерения и категориями
 * @returns {Promise<Array>} Массив видов работ
 */
export async function fetchAllWorkTypes() {
  // Сначала пробуем получить с category
  let { data, error } = await supabase
    .from('work_types')
    .select(`
      id,
      name,
      category,
      unit:unit_id (
        id,
        name
      )
    `)
    .order('name');

  // Если ошибка (столбец category не существует), получаем без него
  if (error && error.message.includes('category')) {
    const result = await supabase
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

    data = result.data;
    error = result.error;
  }

  if (error) throw error;
  return data || [];
}

/**
 * Обновить или создать фактическую цену работы для объекта
 * @param {string} objectId - ID объекта
 * @param {string} workTypeId - ID вида работ
 * @param {number} price - Цена
 * @returns {Promise<void>}
 */
export async function upsertWorkPriceFact(objectId, workTypeId, price) {
  const { error } = await supabase
    .from('work_price_fact')
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
 * Удалить фактическую цену работы
 * @param {string} workPriceId - ID записи work_price_fact
 * @returns {Promise<void>}
 */
export async function deleteWorkPriceFact(workPriceId) {
  const { error } = await supabase
    .from('work_price_fact')
    .delete()
    .eq('id', workPriceId);

  if (error) throw error;
}

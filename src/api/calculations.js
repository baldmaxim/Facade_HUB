import { supabase } from '../lib/supabase';

export async function fetchCalculationItems(objectId) {
  const { data, error } = await supabase
    .from('calculation_items')
    .select('*')
    .eq('object_id', objectId)
    .order('created_at');

  if (error) throw error;
  return data || [];
}

export async function createCalculationItem({ object_id, svor_code, work_type, note }) {
  const { data, error } = await supabase
    .from('calculation_items')
    .insert([{ object_id, svor_code, work_type, note }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCalculationItem(id, field, value) {
  const { error } = await supabase
    .from('calculation_items')
    .update({ [field]: value })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteCalculationItem(id) {
  const { error } = await supabase
    .from('calculation_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

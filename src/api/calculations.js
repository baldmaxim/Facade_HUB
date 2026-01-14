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

export async function createCalculationItem({ object_id, svor_code, work_type, note, image_url }) {
  const { data, error } = await supabase
    .from('calculation_items')
    .insert([{ object_id, svor_code, work_type, note, image_url }])
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

export async function uploadCalculationImage(file, itemId) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${itemId || 'new'}-${Date.now()}.${fileExt}`;
  const filePath = `calculation-images/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('object-images')
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('object-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

import { supabase } from '../lib/supabase';

export async function fetchVorRows(objectId) {
  const { data, error } = await supabase
    .from('vor_rows')
    .select('*')
    .eq('object_id', objectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertVorRow(row) {
  const { data, error } = await supabase
    .from('vor_rows')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function insertVorRows(rows) {
  const { data, error } = await supabase
    .from('vor_rows')
    .insert(rows)
    .select();

  if (error) throw error;
  return data || [];
}

export async function deleteVorRows(objectId) {
  const { error } = await supabase
    .from('vor_rows')
    .delete()
    .eq('object_id', objectId);

  if (error) throw error;
}

export async function updateVorRowField(id, field, value) {
  const { error } = await supabase
    .from('vor_rows')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

import { supabase } from '../lib/supabase';

export async function fetchChecklist(objectId) {
  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .eq('object_id', objectId)
    .order('item_id', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertChecklistItems(items) {
  const { error } = await supabase
    .from('checklists')
    .upsert(items, { onConflict: 'object_id,item_id' });

  if (error) throw error;
}

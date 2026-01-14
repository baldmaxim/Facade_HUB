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

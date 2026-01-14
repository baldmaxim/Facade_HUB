import { supabase } from '../lib/supabase';

export async function fetchObjects() {
  const { data, error } = await supabase
    .from('objects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchObjectById(id) {
  const { data, error } = await supabase
    .from('objects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchObjectName(id) {
  const { data, error } = await supabase
    .from('objects')
    .select('name')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createObject({ name, address, developer, image_url }) {
  const { data, error } = await supabase
    .from('objects')
    .insert([{ name, address, developer, image_url }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

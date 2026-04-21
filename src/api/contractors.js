import { supabase } from '../lib/supabase';

export async function fetchContractors() {
  const { data, error } = await supabase
    .from('contractors')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createContractor(fields) {
  const { data, error } = await supabase
    .from('contractors')
    .insert([fields])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContractor(id, fields) {
  const { data, error } = await supabase
    .from('contractors')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContractor(id) {
  const { error } = await supabase
    .from('contractors')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

import { supabase } from '../lib/supabase';

export async function fetchPrompts() {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createPrompt(fields) {
  const { data, error } = await supabase
    .from('prompts')
    .insert([fields])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePrompt(id, fields) {
  const { data, error } = await supabase
    .from('prompts')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePrompt(id) {
  const { error } = await supabase
    .from('prompts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

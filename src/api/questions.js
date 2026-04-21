import { supabase } from '../lib/supabase';

export async function fetchQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createQuestion(fields) {
  const { data, error } = await supabase
    .from('questions')
    .insert([fields])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(id, fields) {
  const { data, error } = await supabase
    .from('questions')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(id) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

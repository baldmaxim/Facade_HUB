import { supabase } from '../lib/supabase';

export async function fetchVorTemplates() {
  const { data, error } = await supabase
    .from('vor_templates')
    .select('*')
    .order('section_name', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createVorTemplate(template) {
  const { data, error } = await supabase
    .from('vor_templates')
    .insert([template])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVorTemplate(id, fields) {
  const { data, error } = await supabase
    .from('vor_templates')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteVorTemplate(id) {
  const { error } = await supabase
    .from('vor_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function deleteAllVorTemplates() {
  const { error } = await supabase
    .from('vor_templates')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw error;
}

export async function insertVorTemplates(templates) {
  const { data, error } = await supabase
    .from('vor_templates')
    .insert(templates)
    .select();

  if (error) throw error;
  return data || [];
}

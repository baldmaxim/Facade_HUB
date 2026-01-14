import { supabase } from '../lib/supabase';

export async function uploadObjectImage(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('object-images')
    .upload(fileName, file);

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('object-images')
    .getPublicUrl(fileName);

  return publicUrl;
}

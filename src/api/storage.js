import { supabase } from '../lib/supabase';

const BUCKET = 'object-images';

// Универсальная загрузка картинки. folder — опциональный префикс пути (например "team").
export async function uploadImage(file, folder = '') {
  const fileExt = file.name.split('.').pop();
  const name = `${Date.now()}.${fileExt}`;
  const fileName = folder ? `${folder}/${name}` : name;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file);
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return publicUrl;
}

export async function uploadObjectImage(file) {
  return uploadImage(file);
}

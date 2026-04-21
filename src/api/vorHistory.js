import { supabase } from '../lib/supabase';

const BUCKET = 'object-images';
const PREFIX = 'vor-history';

/**
 * Загружает xlsx-файл в storage и записывает метаданные в vor_history.
 * blob — Blob/File с содержимым Excel.
 * stats — объект статистики от generateFilledVor.
 */
export async function saveVorHistory(objectId, blob, fileName, stats = null) {
  const ts = Date.now();
  const filePath = `${PREFIX}/${objectId}/${ts}-${fileName}`;

  // Загружаем в storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, blob, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

  // Пишем метаданные в таблицу
  const { data, error } = await supabase
    .from('vor_history')
    .insert([{
      object_id: objectId,
      file_url: publicUrl,
      file_name: fileName,
      file_path: filePath,
      size_bytes: blob.size || null,
      stats,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchVorHistory(objectId) {
  const { data, error } = await supabase
    .from('vor_history')
    .select('*')
    .eq('object_id', objectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Удаляет одну запись истории: файл из storage + строку из таблицы.
 */
export async function deleteVorHistoryItem(id, filePath) {
  // Сначала удаляем файл из storage (не критично если нет)
  await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});

  const { error } = await supabase
    .from('vor_history')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

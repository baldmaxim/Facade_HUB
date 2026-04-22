import { supabase } from '../lib/supabase';

/**
 * Сохранить обратную связь пользователя по ответу AI-ревьюера.
 * Нужна, чтобы накапливать «опыт» и подмешивать его в промпт Gemini на будущих ревью.
 *
 * row: {
 *   noteCustomer, posName,
 *   engineTplKeys,            // string[]
 *   correctTplKeys,           // string[] | null — только для 👎
 *   aiVerdict,                // 'green' | 'yellow' | 'red'
 *   aiConfidence, aiComment, aiReasoning,
 *   userIsCorrect,            // boolean
 *   userComment,              // string | null
 *   objectId,                 // uuid | null
 * }
 */
export async function saveReviewFeedback(row) {
  const payload = {
    note_customer:    row.noteCustomer || '',
    pos_name:         row.posName || null,
    engine_tpl_keys:  row.engineTplKeys || [],
    correct_tpl_keys: row.correctTplKeys || null,
    ai_verdict:       row.aiVerdict || 'yellow',
    ai_confidence:    row.aiConfidence ?? null,
    ai_comment:       row.aiComment || null,
    ai_reasoning:     row.aiReasoning || null,
    user_is_correct:  row.userIsCorrect === true,
    user_comment:     row.userComment || null,
    object_id:        row.objectId || null,
  };
  const { data, error } = await supabase
    .from('vor_review_feedback')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

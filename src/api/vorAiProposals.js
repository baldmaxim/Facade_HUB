// API-слой для логирования ответов AI-ревьюера (propose-режим) в таблицу vor_ai_proposals.
// Используется vorProposeRunner'ом (fire-and-forget) и VorFillModal'ом при применении.

import { supabase } from '../lib/supabase';

/**
 * Сохранить сырой ответ Gemini на propose-запрос.
 * Возвращает {id} записи, чтобы потом апдейтить applied_mode при нажатии «Применить».
 *
 * row: {
 *   noteCustomer, posName, posCode, objectId,
 *   engineTplKeys,         // string[] — что было у движка (пусто для unmatched)
 *   proposedTplKeys,       // string[] — что предложил Gemini
 *   aiScore, aiReasoning, aiComment,
 *   isError,               // true если ответ некорректен/ошибочен
 * }
 */
export async function saveAiProposal(row) {
  const payload = {
    note_customer:     row.noteCustomer || '',
    pos_name:          row.posName || null,
    pos_code:          row.posCode || null,
    engine_tpl_keys:   row.engineTplKeys || [],
    proposed_tpl_keys: row.proposedTplKeys || [],
    ai_score:          typeof row.aiScore === 'number' ? row.aiScore : null,
    ai_reasoning:      row.aiReasoning || null,
    ai_comment:        row.aiComment || null,
    is_error:          row.isError === true,
    object_id:         row.objectId || null,
  };
  const { data, error } = await supabase
    .from('vor_ai_proposals')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data; // {id}
}

/**
 * Отметить, что пользователь применил предложение (клик «Заменить» или «Дополнить»).
 * applied_tpl_keys — итоговый набор, который лёг в overrides (для merge это union, для replace — только proposed).
 */
export async function markAiProposalApplied(proposalId, mode, appliedTplKeys) {
  if (!proposalId) return null;
  const { data, error } = await supabase
    .from('vor_ai_proposals')
    .update({
      applied_mode:     mode, // 'replace' | 'merge'
      applied_at:       new Date().toISOString(),
      applied_tpl_keys: appliedTplKeys || [],
    })
    .eq('id', proposalId)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

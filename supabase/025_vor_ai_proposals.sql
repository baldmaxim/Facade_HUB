-- Лог всех ответов propose-режима AI-ревьюера (Gemini): что было у движка,
-- что предложил Gemini, применил ли пользователь и как именно. Сохраняем
-- даже ошибочные/пустые ответы — для диагностики и калибровки промпта.

CREATE TABLE IF NOT EXISTS vor_ai_proposals (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_customer      TEXT NOT NULL,
  pos_name           TEXT,
  pos_code           TEXT,
  engine_tpl_keys    TEXT[] DEFAULT '{}',
  proposed_tpl_keys  TEXT[] DEFAULT '{}',
  ai_score           INT,
  ai_reasoning       TEXT,
  ai_comment         TEXT,
  is_error           BOOLEAN NOT NULL DEFAULT FALSE,
  applied_mode       TEXT CHECK (applied_mode IN ('replace','merge') OR applied_mode IS NULL),
  applied_at         TIMESTAMPTZ,
  applied_tpl_keys   TEXT[],
  object_id          UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vor_ai_proposals_created_idx ON vor_ai_proposals (created_at DESC);
CREATE INDEX IF NOT EXISTS vor_ai_proposals_object_idx  ON vor_ai_proposals (object_id);

-- RLS: anon read + insert + update (клиенту нужно проставлять applied_mode после клика)
ALTER TABLE vor_ai_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vor_ai_proposals_read"   ON vor_ai_proposals;
DROP POLICY IF EXISTS "vor_ai_proposals_insert" ON vor_ai_proposals;
DROP POLICY IF EXISTS "vor_ai_proposals_update" ON vor_ai_proposals;

CREATE POLICY "vor_ai_proposals_read"   ON vor_ai_proposals FOR SELECT USING (true);
CREATE POLICY "vor_ai_proposals_insert" ON vor_ai_proposals FOR INSERT WITH CHECK (true);
CREATE POLICY "vor_ai_proposals_update" ON vor_ai_proposals FOR UPDATE USING (true) WITH CHECK (true);

COMMENT ON TABLE  vor_ai_proposals IS 'Лог ответов propose-режима AI-ревьюера: что предложил Gemini, применил ли пользователь';
COMMENT ON COLUMN vor_ai_proposals.id IS 'Уникальный идентификатор ответа';
COMMENT ON COLUMN vor_ai_proposals.note_customer IS 'Примечание заказчика из ВОР';
COMMENT ON COLUMN vor_ai_proposals.pos_name IS 'Название позиции из ВОР';
COMMENT ON COLUMN vor_ai_proposals.pos_code IS 'Код позиции';
COMMENT ON COLUMN vor_ai_proposals.engine_tpl_keys IS 'Шаблоны, которые были у движка (пусто для unmatched)';
COMMENT ON COLUMN vor_ai_proposals.proposed_tpl_keys IS 'Шаблоны, которые предложил Gemini';
COMMENT ON COLUMN vor_ai_proposals.ai_score IS 'Оценка уверенности Gemini в предложении (0-100)';
COMMENT ON COLUMN vor_ai_proposals.ai_reasoning IS 'Пошаговое рассуждение Gemini';
COMMENT ON COLUMN vor_ai_proposals.ai_comment IS 'Краткий вывод Gemini';
COMMENT ON COLUMN vor_ai_proposals.is_error IS 'TRUE если ответ был ошибкой/пустым (для диагностики)';
COMMENT ON COLUMN vor_ai_proposals.applied_mode IS 'Если пользователь применил: replace (заменить) или merge (дополнить), иначе NULL';
COMMENT ON COLUMN vor_ai_proposals.applied_at IS 'Когда пользователь применил предложение';
COMMENT ON COLUMN vor_ai_proposals.applied_tpl_keys IS 'Итоговый набор после применения (movок + gemini для merge, только gemini для replace)';
COMMENT ON COLUMN vor_ai_proposals.object_id IS 'Связанный объект строительства';
COMMENT ON COLUMN vor_ai_proposals.created_at IS 'Когда Gemini ответил';

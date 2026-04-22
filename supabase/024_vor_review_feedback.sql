-- Обратная связь пользователя по ответам AI-ревьюера (Gemini) на подбор шаблонов ВОР.
-- Каждый 👍/👎 в модалке «Заполнение ВОРа» падает в эту таблицу и в будущих
-- запросах подмешивается в промпт Gemini как «похожие случаи из вашей истории»
-- (RAG-подход, in-context learning).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS vor_review_feedback (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_customer    TEXT NOT NULL,
  pos_name         TEXT,
  engine_tpl_keys  TEXT[] NOT NULL,
  correct_tpl_keys TEXT[],
  ai_verdict       TEXT NOT NULL,
  ai_confidence    INT,
  ai_comment       TEXT,
  ai_reasoning     TEXT,
  user_is_correct  BOOLEAN NOT NULL,
  user_comment     TEXT,
  object_id        UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- GIN-индекс по склеенному тексту для быстрой trigram-похожести
CREATE INDEX IF NOT EXISTS vor_review_feedback_trgm_idx
  ON vor_review_feedback
  USING GIN ((coalesce(note_customer,'') || ' ' || coalesce(pos_name,'')) gin_trgm_ops);

-- RPC: найти топ-N похожих записей по trigram-similarity
CREATE OR REPLACE FUNCTION find_similar_feedback(query_text TEXT, lim INT DEFAULT 3)
RETURNS SETOF vor_review_feedback
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM vor_review_feedback
  WHERE similarity(coalesce(note_customer,'') || ' ' || coalesce(pos_name,''), query_text) > 0.2
  ORDER BY similarity(coalesce(note_customer,'') || ' ' || coalesce(pos_name,''), query_text) DESC
  LIMIT GREATEST(lim, 1);
$$;

-- RLS: таблица открыта на чтение и вставку для anon (клиент пишет, Edge Function читает через anon JWT).
-- Обновления/удаления — пока не разрешены (аккумулируем историю).
ALTER TABLE vor_review_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vor_review_feedback_read_all"  ON vor_review_feedback;
DROP POLICY IF EXISTS "vor_review_feedback_insert"    ON vor_review_feedback;

CREATE POLICY "vor_review_feedback_read_all" ON vor_review_feedback FOR SELECT USING (true);
CREATE POLICY "vor_review_feedback_insert"   ON vor_review_feedback FOR INSERT WITH CHECK (true);

-- Комментарии
COMMENT ON TABLE  vor_review_feedback IS 'Обратная связь пользователя по ответам AI-ревьюера Gemini на подбор шаблонов ВОР';
COMMENT ON COLUMN vor_review_feedback.id IS 'Уникальный идентификатор записи';
COMMENT ON COLUMN vor_review_feedback.note_customer IS 'Примечание заказчика из ВОР (поле S)';
COMMENT ON COLUMN vor_review_feedback.pos_name IS 'Название позиции из ВОР';
COMMENT ON COLUMN vor_review_feedback.engine_tpl_keys IS 'Шаблоны, подобранные нашим движком (включая override)';
COMMENT ON COLUMN vor_review_feedback.correct_tpl_keys IS 'Шаблоны, которые по мнению пользователя должны были быть (для 👎)';
COMMENT ON COLUMN vor_review_feedback.ai_verdict IS 'Вердикт Gemini: green / yellow / red';
COMMENT ON COLUMN vor_review_feedback.ai_confidence IS 'Процент уверенности Gemini (0-100)';
COMMENT ON COLUMN vor_review_feedback.ai_comment IS 'Краткий вывод Gemini';
COMMENT ON COLUMN vor_review_feedback.ai_reasoning IS 'Полное пошаговое рассуждение Gemini';
COMMENT ON COLUMN vor_review_feedback.user_is_correct IS 'TRUE если пользователь подтвердил ответ AI, FALSE если отметил как ошибку';
COMMENT ON COLUMN vor_review_feedback.user_comment IS 'Комментарий пользователя (опц.)';
COMMENT ON COLUMN vor_review_feedback.object_id IS 'Связанный объект строительства (опц.)';
COMMENT ON COLUMN vor_review_feedback.created_at IS 'Дата и время создания записи';

COMMENT ON FUNCTION find_similar_feedback(TEXT, INT) IS
  'Возвращает топ-N похожих записей из vor_review_feedback по trigram-similarity со склеенным note_customer+pos_name. Используется Edge Function vor-review для RAG-обогащения промпта.';

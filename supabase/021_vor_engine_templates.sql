-- Таблица пользовательских шаблонов движка ВОР.
-- Дополняет (не заменяет) кодовые шаблоны из src/lib/vorTemplates.js.
-- Custom-шаблоны — fallback: сначала матчатся кодовые правила,
-- если они не сработали — проверяются custom-шаблоны по keywords.

CREATE TABLE vor_custom_templates (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  cost_path TEXT NOT NULL,
  data JSONB NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  secondary TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vor_custom_templates IS 'Пользовательские шаблоны движка ВОР (fallback после кодовых правил)';
COMMENT ON COLUMN vor_custom_templates.key IS 'Уникальный ключ custom-шаблона (должен отличаться от ключей в коде)';
COMMENT ON COLUMN vor_custom_templates.label IS 'Человекопонятное название для UI';
COMMENT ON COLUMN vor_custom_templates.category IS 'Категория для группировки: СПК, НВФ, Мокрый фасад и т.д.';
COMMENT ON COLUMN vor_custom_templates.cost_path IS 'Путь затрат (costPath) для строк в ВОРе';
COMMENT ON COLUMN vor_custom_templates.data IS 'Структура шаблона в JSON: { workMaterials: [...] } или { works: [...], materials: [...] }';
COMMENT ON COLUMN vor_custom_templates.keywords IS 'Массив ключевых слов (regex-совместимых) для матчинга позиций';
COMMENT ON COLUMN vor_custom_templates.secondary IS 'Ключи вторичных шаблонов для автоматического добавления (scaffolding, kmd_spk и т.д.)';
COMMENT ON COLUMN vor_custom_templates.sort_order IS 'Порядок сортировки внутри категории';
COMMENT ON COLUMN vor_custom_templates.created_at IS 'Дата создания';
COMMENT ON COLUMN vor_custom_templates.updated_at IS 'Дата последнего изменения';

CREATE INDEX idx_vor_custom_templates_category ON vor_custom_templates(category);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_vor_custom_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vor_custom_templates_updated_at
  BEFORE UPDATE ON vor_custom_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_vor_custom_templates_updated_at();

-- RLS: разрешаем всем (как и остальные таблицы проекта)
ALTER TABLE vor_custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all" ON vor_custom_templates FOR SELECT USING (true);
CREATE POLICY "Allow insert for all" ON vor_custom_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for all" ON vor_custom_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for all" ON vor_custom_templates FOR DELETE USING (true);

-- Таблица шаблонов ВОР компании
CREATE TABLE vor_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_name TEXT NOT NULL,
  category TEXT,
  row_type TEXT NOT NULL CHECK (row_type IN ('work', 'material')),
  row_kind TEXT,
  name TEXT NOT NULL,
  unit TEXT,
  norm NUMERIC,
  coefficient NUMERIC DEFAULT 1,
  in_price BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vor_templates IS 'Шаблоны строк ВОР — база компании для автозаполнения';
COMMENT ON COLUMN vor_templates.section_name IS 'Раздел/группа работ (заголовок секции)';
COMMENT ON COLUMN vor_templates.category IS 'Категория (например: ФАСАДНЫЕ РАБОТЫ / Профиль стойка-ригель)';
COMMENT ON COLUMN vor_templates.row_type IS 'Тип строки: work (суб-раб) или material (суб-мат)';
COMMENT ON COLUMN vor_templates.row_kind IS 'Вид: основн. или вспомогат.';
COMMENT ON COLUMN vor_templates.name IS 'Наименование работы или материала';
COMMENT ON COLUMN vor_templates.unit IS 'Единица измерения';
COMMENT ON COLUMN vor_templates.norm IS 'Норма расхода (для материалов)';
COMMENT ON COLUMN vor_templates.coefficient IS 'Коэффициент';
COMMENT ON COLUMN vor_templates.in_price IS 'Включено в цену (в цене/не в цене)';
COMMENT ON COLUMN vor_templates.sort_order IS 'Порядок сортировки внутри секции';

-- Таблица строк ВОР по конкретному объекту
CREATE TABLE vor_rows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES vor_templates(id) ON DELETE SET NULL,
  section_name TEXT NOT NULL,
  row_type TEXT NOT NULL CHECK (row_type IN ('work', 'material')),
  point_number TEXT,
  category TEXT,
  has_item BOOLEAN DEFAULT true,
  row_kind TEXT,
  name TEXT NOT NULL,
  unit TEXT,
  norm NUMERIC,
  coefficient NUMERIC DEFAULT 1,
  in_price BOOLEAN DEFAULT true,
  volume NUMERIC,
  work_price NUMERIC,
  material_price NUMERIC,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vor_rows IS 'Строки ВОР (ведомость объёмов работ) по объекту';
COMMENT ON COLUMN vor_rows.object_id IS 'ID объекта';
COMMENT ON COLUMN vor_rows.template_id IS 'Ссылка на шаблон (если строка создана из шаблона)';
COMMENT ON COLUMN vor_rows.section_name IS 'Раздел/группа (заголовок секции)';
COMMENT ON COLUMN vor_rows.row_type IS 'Тип: work (суб-раб) или material (суб-мат)';
COMMENT ON COLUMN vor_rows.point_number IS '№ пункта';
COMMENT ON COLUMN vor_rows.category IS 'Категория работ';
COMMENT ON COLUMN vor_rows.has_item IS 'Наличие (да/нет)';
COMMENT ON COLUMN vor_rows.row_kind IS 'Вид: основн. или вспомогат.';
COMMENT ON COLUMN vor_rows.name IS 'Наименование';
COMMENT ON COLUMN vor_rows.unit IS 'Единица измерения';
COMMENT ON COLUMN vor_rows.norm IS 'Норма расхода';
COMMENT ON COLUMN vor_rows.coefficient IS 'Коэффициент';
COMMENT ON COLUMN vor_rows.in_price IS 'Включено в цену';
COMMENT ON COLUMN vor_rows.volume IS 'Объём (заполняется пользователем — красное поле для work)';
COMMENT ON COLUMN vor_rows.work_price IS 'Цена работ (заполняется пользователем — красное поле для work)';
COMMENT ON COLUMN vor_rows.material_price IS 'Цена материала (заполняется — красное поле для material)';
COMMENT ON COLUMN vor_rows.sort_order IS 'Порядок строки в ВОР';

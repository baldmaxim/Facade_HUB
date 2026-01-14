-- =============================================
-- Таблица объектов
-- =============================================
CREATE TABLE objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  developer TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Таблица записей расчёта (нюансы расчёта)
-- =============================================
CREATE TABLE calculation_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID REFERENCES objects(id) ON DELETE CASCADE,
  svor_code TEXT,
  work_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индекс
CREATE INDEX idx_calculation_items_object_id ON calculation_items(object_id);

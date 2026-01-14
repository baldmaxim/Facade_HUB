-- =============================================
-- Справочник видов работ
-- =============================================
CREATE TABLE work_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'м²'
);

-- Заполнение справочника
INSERT INTO work_types (id, name, unit) VALUES
  (1, 'Устройство мокрового фасада', 'м²'),
  (2, 'Облицовка НВФ', 'м²'),
  (3, 'Подсистема НВФ + утеплитель', 'м²'),
  (4, 'Светопрозрачные конструкции', 'м²'),
  (5, 'Фурнитура', 'м²'),
  (6, 'Профиль алюминиевый', 'м²'),
  (7, 'Профиль ПВХ', 'м²'),
  (8, 'Тамбура (1-ые этажи)', 'м²'),
  (9, 'Двери наружные по фасаду (входные и БКФН, тамбурные двери)', 'м²'),
  (10, 'Защита светопрозрачных конструкций', 'м²'),
  (11, 'СОФ', 'м²'),
  (12, 'Леса и люльки', 'м²'),
  (13, 'Ограждения, козырьки, маркизы', 'м²'),
  (14, 'Финишный клининг (фасада, светопрозрачки, отделки, покрытий благоустройства)', 'м²'),
  (15, 'МОКАП', 'м²'),
  (16, 'Разработка РД (включая КМД на фасады) и авторский надзор', 'м²'),
  (17, 'Научно-техническое сопровождение строительства', 'м²');

-- =============================================
-- Таблица работ по объекту (связь objects <-> work_types)
-- =============================================
CREATE TABLE object_works (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  work_type_id INTEGER NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  volume NUMERIC,
  tender_works NUMERIC,
  tender_materials NUMERIC,
  fact_works NUMERIC,
  fact_materials NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Уникальная комбинация: один вид работ на объект
  UNIQUE(object_id, work_type_id)
);

-- Индекс для быстрого поиска по объекту
CREATE INDEX idx_object_works_object_id ON object_works(object_id);

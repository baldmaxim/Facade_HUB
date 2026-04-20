-- Прайс работ на объект: цены за единицу, используются при генерации ВОР
CREATE TABLE IF NOT EXISTS vor_work_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  cost_path TEXT,
  work_name TEXT NOT NULL,
  unit TEXT,
  price NUMERIC(12, 2) NOT NULL,
  tpl_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE vor_work_prices IS 'Прайс работ на объект: цены за единицу, используются при автозаполнении ВОР';
COMMENT ON COLUMN vor_work_prices.id IS 'Уникальный идентификатор записи';
COMMENT ON COLUMN vor_work_prices.object_id IS 'Ссылка на объект (каскадное удаление)';
COMMENT ON COLUMN vor_work_prices.cost_path IS 'Путь затрат (ФАСАДНЫЕ РАБОТЫ / ... / Здание)';
COMMENT ON COLUMN vor_work_prices.work_name IS 'Наименование работы (как в шаблоне)';
COMMENT ON COLUMN vor_work_prices.unit IS 'Единица измерения (м2, шт, м.п.)';
COMMENT ON COLUMN vor_work_prices.price IS 'Цена за единицу в рублях';
COMMENT ON COLUMN vor_work_prices.tpl_key IS 'Ключ шаблона (spk_profile, nvf_cladding_cassette и т.д.)';
COMMENT ON COLUMN vor_work_prices.created_at IS 'Дата создания записи';
COMMENT ON COLUMN vor_work_prices.updated_at IS 'Дата последнего обновления';

CREATE INDEX IF NOT EXISTS idx_vor_work_prices_object_id ON vor_work_prices(object_id);
CREATE INDEX IF NOT EXISTS idx_vor_work_prices_tpl_key ON vor_work_prices(tpl_key);

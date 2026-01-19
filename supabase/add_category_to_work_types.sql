-- Добавление категории к видам работ для группировки
ALTER TABLE work_types ADD COLUMN IF NOT EXISTS category TEXT;

-- Комментарий к новому столбцу
COMMENT ON COLUMN work_types.category IS 'Категория вида работ для группировки (например: Подсистема, Остекление, СОФ)';

-- Обновляем существующие записи с категориями
-- Подсистема
UPDATE work_types SET category = 'Подсистема' WHERE name LIKE '%кронштейн%' OR name LIKE '%подсистем%' OR name LIKE '%направляющ%' OR name LIKE '%анкер%';

-- Остекление
UPDATE work_types SET category = 'Остекление' WHERE name LIKE '%ПВХ%' OR name LIKE '%витраж%' OR name LIKE '%заполнен%' OR name LIKE '%стеклопакет%' OR name LIKE '%импост%';

-- СОФ (Светопрозрачные ограждающие конструкции фасадов)
UPDATE work_types SET category = 'СОФ' WHERE name LIKE '%СОФ%' OR name LIKE '%светопрозрачн%';

-- Облицовка
UPDATE work_types SET category = 'Облицовка' WHERE name LIKE '%облицов%' OR name LIKE '%панел%' OR name LIKE '%касет%' OR name LIKE '%композит%';

-- Утепление и изоляция
UPDATE work_types SET category = 'Утепление и изоляция' WHERE name LIKE '%утепл%' OR name LIKE '%теплоизол%' OR name LIKE '%минплит%' OR name LIKE '%пароизол%' OR name LIKE '%гидроизол%';

-- Профили и элементы
UPDATE work_types SET category = 'Профили и элементы' WHERE name LIKE '%профил%' AND category IS NULL;

-- Доборные элементы
UPDATE work_types SET category = 'Доборные элементы' WHERE name LIKE '%нащельник%' OR name LIKE '%отлив%' OR name LIKE '%козырек%' OR name LIKE '%планк%' OR name LIKE '%уплотнит%';

-- Монтажные работы
UPDATE work_types SET category = 'Монтажные работы' WHERE name LIKE '%монтаж%' AND category IS NULL;

-- Прочие работы (для тех, что не попали ни в одну категорию)
UPDATE work_types SET category = 'Прочие работы' WHERE category IS NULL;

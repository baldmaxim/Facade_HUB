-- Добавление категории к видам работ для группировки
ALTER TABLE work_types ADD COLUMN IF NOT EXISTS category TEXT;

-- Комментарий к новому столбцу
COMMENT ON COLUMN work_types.category IS 'Категория вида работ для группировки (например: Подсистема, Остекление, СОФ)';

-- Сначала очищаем все категории для корректного назначения
UPDATE work_types SET category = NULL;

-- Распределяем по категориям в правильном порядке

-- Подсистема
UPDATE work_types SET category = 'Подсистема' WHERE
  name LIKE '%кронштейн%' OR
  name LIKE '%подсистем%' OR
  name LIKE '%направляющ%' OR
  name LIKE '%анкер%';

-- Позиция 20 -> Подсистема
UPDATE work_types SET category = 'Подсистема'
WHERE id = (SELECT id FROM work_types ORDER BY id LIMIT 1 OFFSET 19);

-- Остекление
UPDATE work_types SET category = 'Остекление' WHERE
  name LIKE '%ПВХ%' OR
  name LIKE '%витраж%' OR
  name LIKE '%заполнен%' OR
  name LIKE '%стеклопакет%' OR
  name LIKE '%импост%';

-- Позиция 16 -> Остекление
UPDATE work_types SET category = 'Остекление'
WHERE id = (SELECT id FROM work_types ORDER BY id LIMIT 1 OFFSET 15);

-- Позиция 31 -> Остекление
UPDATE work_types SET category = 'Остекление'
WHERE id = (SELECT id FROM work_types ORDER BY id LIMIT 1 OFFSET 30);

-- СОФ (Светопрозрачные ограждающие конструкции фасадов)
UPDATE work_types SET category = 'СОФ' WHERE
  name LIKE '%СОФ%' OR
  name LIKE '%светопрозрачн%';

-- Облицовка
UPDATE work_types SET category = 'Облицовка' WHERE
  name LIKE '%облицов%' OR
  name LIKE '%панел%' OR
  name LIKE '%касет%' OR
  name LIKE '%композит%';

-- Утепление и изоляция
UPDATE work_types SET category = 'Утепление и изоляция' WHERE
  name LIKE '%утепл%' OR
  name LIKE '%теплоизол%' OR
  name LIKE '%минплит%' OR
  name LIKE '%пароизол%' OR
  name LIKE '%гидроизол%';

-- Профили и элементы
UPDATE work_types SET category = 'Профили и элементы' WHERE
  name LIKE '%профил%' AND
  category IS NULL;

-- Доборные элементы
UPDATE work_types SET category = 'Доборные элементы' WHERE
  name LIKE '%нащельник%' OR
  name LIKE '%отлив%' OR
  name LIKE '%планк%' OR
  name LIKE '%уплотнит%';

-- Конкретные виды работ по категориям

-- Прочие работы
UPDATE work_types SET category = 'Прочие работы' WHERE
  name LIKE '%козырек%' OR
  name LIKE '%Решетка%' OR
  name LIKE 'Монтаж стеклянных козырьков%';

-- Остекление (дополнительно) - ВАЖНО: выполняется ПОСЛЕ основных правил
UPDATE work_types SET category = 'Остекление' WHERE
  name LIKE '%Заполнение алюминиевых светопрозрачных%' OR
  name LIKE '%дверных блоков%витража%' OR
  name LIKE '%Оклейка/демонтаж бронирующей пленки%';

-- Подсистема (дополнительно)
UPDATE work_types SET category = 'Подсистема' WHERE
  name LIKE '%Монтаж подсистемы под алюмокомпозит%' OR
  name LIKE '%Монтаж подсистемы под натуральный камень%';

-- Позиция 9 -> Прочие работы (только если еще не назначена категория)
UPDATE work_types SET category = 'Прочие работы'
WHERE id = (SELECT id FROM work_types ORDER BY id LIMIT 1 OFFSET 8)
  AND category IS NULL;

-- Позиция 14 -> Прочие работы (только если еще не назначена категория)
UPDATE work_types SET category = 'Прочие работы'
WHERE id = (SELECT id FROM work_types ORDER BY id LIMIT 1 OFFSET 13)
  AND category IS NULL;

-- Все остальные без категории -> Прочие работы
UPDATE work_types SET category = 'Прочие работы' WHERE category IS NULL;

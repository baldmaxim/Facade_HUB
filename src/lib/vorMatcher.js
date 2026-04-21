/**
 * Шаблоны фасадных работ и ГРАНУЛЯРНЫЙ матчинг.
 *
 * Принцип: одна позиция ВОР = только РЕЛЕВАНТНЫЕ шаблоны.
 * Заголовки не расцениваются. Шаблоны разделяются по типу позиции.
 * Каждый шаблон имеет свой путь затрат (costPath).
 *
 * Материалы: коэффициенты и цены из шаблонов.
 * Основные материалы (профиль, стекло, кассеты) — цена пустая (из КП).
 * Вспомогательные (крепёж, дюбели, анкера) — цена заполнена.
 */

export const TEMPLATES = {
  spk_profile: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Профиль стойка-ригель / Здание',
    works: [
      { name: 'Сборка и монтаж алюминиевых витражей (каркас и заполнение, герметизация)', unit: 'м2' },
    ],
    materials: [
      { name: 'Кронштейны опорные, ветровые', unit: 'шт', kind: 'вспомогат.', j: 1.5, k: 1, price: 760.22 },
      { name: 'Анкер клиновой 10*95', unit: 'шт', kind: 'вспомогат.', j: 3, k: 1.05, price: 69 },
      { name: 'Профиль алюминиевый (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.1 },
    ],
  },
  spk_glass: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Светопрозрачные конструкции / Здание',
    works: [
      { name: 'Заполнение алюминиевых светопрозрачных конструкций', unit: 'м2' },
    ],
    materials: [
      { name: 'Стеклопакет (по спецификации проекта)', unit: 'м2', kind: 'основн.', j: 0.9, k: 1.2 },
    ],
  },
  spk_broneplenka: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Защита светопрозрачных конструкций / Здание',
    works: [
      { name: 'Оклейка бронирующей пленки с СПК', unit: 'м2' },
    ],
    materials: [
      { name: 'Пленка защитная НТК ОПТИМА 90 мкм', unit: 'м2', kind: 'основн.', j: 1, k: 1.2 },
    ],
  },
  scaffolding: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Леса и люльки / Здание',
    works: [
      { name: 'Монтаж/демонтаж лесов, подмостей, средств подмащивания', unit: 'м2' },
    ],
    materials: [
      { name: 'Анкера для строительных лесов, хомут-стяжка для сетки и пр', unit: 'м2', kind: 'вспомогат.', j: 1, k: 1.05, price: 800 },
    ],
  },
  kmd_spk: {
    costPath: 'ПРОЕКТНЫЕ РАБОТЫ / Разработка РД (включая КМД на фасады) и авторский надзор / Здание',
    works: [{ name: 'Разработка КМ/КМД СПК', unit: 'м2' }],
    materials: [],
  },
  kmd_nvf: {
    costPath: 'ПРОЕКТНЫЕ РАБОТЫ / Разработка РД (включая КМД на фасады) и авторский надзор / Здание',
    works: [{ name: 'Разработка КМ/КМД НВФ', unit: 'м2' }],
    materials: [],
  },
  nvf_subsystem: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Подсистема НВФ + утеплитель / Здание',
    works: [
      { name: 'Монтаж подсистемы НВФ', unit: 'м2' },
    ],
    materials: [
      { name: 'Подсистема НВФ (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.12 },
    ],
  },
  nvf_cladding_clinker: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    // workMaterials: каждая работа идёт вместе со своими материалами (чередование)
    workMaterials: [
      {
        work: { name: 'Наружная облицовка фасада клинкерной плиткой', unit: 'м2' },
        materials: [
          { name: 'Фасадная клинкерная плитка (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
        ],
      },
      {
        work: { name: 'Затирка швов клинкерной плитки', unit: 'м2' },
        materials: [
          { name: 'FM.R-E, Смесь затирочная для НФС, антрацитово-серый, производства Quick-mix(Россия), фасовка 30 кг/мешок', unit: 'м2', kind: 'основн.', j: 1, k: 1.05, price: 699.6, noOverride: true },
        ],
      },
    ],
  },
  nvf_cladding_cassette: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада алюминиевыми кассетами', unit: 'м2' },
    ],
    materials: [
      { name: 'Алюминиевая кассета (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_fibrobeton: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка поверхности фасада панелями из стеклофибробетона', unit: 'м2' },
    ],
    materials: [
      { name: 'Панель стеклофибробетонная (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_ceramic: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада керамическими панелями', unit: 'м2' },
    ],
    materials: [
      { name: 'Керамическая панель (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_porcelain: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада керамогранитом', unit: 'м2' },
    ],
    materials: [
      { name: 'Керамогранит (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_natural_stone: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада натуральным камнем', unit: 'м2' },
    ],
    materials: [
      { name: 'Натуральный камень (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_akp: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада алюмокомпозитными панелями', unit: 'м2' },
    ],
    materials: [
      { name: 'Алюмокомпозитная панель (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.22 },
    ],
  },
  nvf_cladding_concrete_tile: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада бетонной плиткой', unit: 'м2' },
    ],
    materials: [
      { name: 'Бетонная плитка (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.15 },
    ],
  },
  nvf_cladding_brick: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада кирпичом', unit: 'м2' },
    ],
    materials: [
      { name: 'Кирпич облицовочный (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.05 },
    ],
  },
  nvf_cladding_fcp: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада фиброцементными панелями', unit: 'м2' },
    ],
    materials: [
      { name: 'Фиброцементная панель (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.05 },
    ],
  },
  nvf_cladding_galvanized: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада оцинкованным листом', unit: 'м2' },
    ],
    materials: [
      { name: 'Оцинкованный лист (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.20 },
    ],
  },
  nvf_cladding_arch_concrete: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Наружная облицовка фасада архитектурным бетоном', unit: 'м2' },
    ],
    materials: [
      { name: 'Архитектурный бетон (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.00 },
    ],
  },
  insulation: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Подсистема НВФ + утеплитель / Здание',
    works: [
      { name: 'Утепление в 2 слоя (180 мм)', unit: 'м2' },
    ],
    materials: [
      { name: 'Утеплитель ТЕХНОВЕНТ ОПТИМА', unit: 'м3', kind: 'основн.', j: 0.05, k: 1.15 },
      { name: 'Утеплитель ТЕХНОВЕНТ ОПТИМА', unit: 'м3', kind: 'основн.', j: 0.13, k: 1.15 },
      { name: 'Противопожарная защитная мембрана ТехноНИКОЛЬ АЛЬФА ПРО НГ', unit: 'м2', kind: 'основн.', j: 1, k: 1.15 },
      { name: 'Фасадный забивной дюбель со стальным распорным элементом', unit: 'м2', kind: 'вспомогат.', j: 5, k: 1.05, price: 13.25 },
      { name: 'Фасадный забивной дюбель со стальным распорным элементом', unit: 'м2', kind: 'вспомогат.', j: 10, k: 1.05, price: 18.73 },
    ],
  },
  flashings: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    workMaterials: [
      {
        work: { name: 'Изготовление и монтаж оцинкованных элементов (парапеты, отливы, нащельники)', unit: 'м.п.', noteGp: 'Откосы' },
        materials: [
          { name: 'Лист 0,7 оц. с полимерным покрытием (1 м2 = 5,7 кг)', unit: 'м2', kind: 'основн.', j: 0.2, k: 1.2 },
          { name: 'Заклепка вытяжная комбинированная 4,0*8', unit: 'шт', kind: 'вспомогат.', j: 6, k: 1, price: 1.44 },
          { name: 'Дюбель-гвоздь 6*60', unit: 'шт', kind: 'вспомогат.', j: 4, k: 2, price: 1.6 },
        ],
      },
      {
        work: { name: 'Устройство герметика', unit: 'м.п.', noteGp: 'Откосы' },
        materials: [
          { name: 'Герметик акриловый СТИЗ-А 7 кг', unit: 'кг', kind: 'вспомогат.', j: 0.1, k: 1.05 },
          { name: 'Герметик акриловый СТИЗ-В 7 кг', unit: 'кг', kind: 'вспомогат.', j: 0.1, k: 1.05 },
        ],
      },
    ],
  },
  pp_otsechi: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    workMaterials: [
      {
        work: { name: 'Изготовление и монтаж оцинкованных элементов (парапеты, отливы, нащельники)', unit: 'м.п.', noteGp: 'П/П отсечки' },
        materials: [
          { name: 'Лист 0,7 оц. с полимерным покрытием (1 м2 = 5,7 кг)', unit: 'м2', kind: 'основн.', j: 0.2, k: 1.2 },
          { name: 'Заклепка вытяжная комбинированная 4,0*8', unit: 'шт', kind: 'вспомогат.', j: 6, k: 1, price: 1.44 },
          { name: 'Дюбель-гвоздь 6*60', unit: 'шт', kind: 'вспомогат.', j: 4, k: 2, price: 1.6 },
        ],
      },
      {
        work: { name: 'Устройство герметика', unit: 'м.п.', noteGp: 'П/П отсечки' },
        materials: [
          { name: 'Герметик акриловый СТИЗ-А 7 кг', unit: 'кг', kind: 'вспомогат.', j: 0.1, k: 1.05 },
          { name: 'Герметик акриловый СТИЗ-В 7 кг', unit: 'кг', kind: 'вспомогат.', j: 0.1, k: 1.05 },
        ],
      },
    ],
  },
  glass_railing: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Ограждения, козырьки, маркизы / Здание',
    works: [
      { name: 'Монтаж стеклянных ограждений', unit: 'м2' },
    ],
    materials: [
      { name: 'Профиль алюминиевый зажимной L=3000 мм', unit: 'м', kind: 'основн.', j: 0.83, k: 1.1 },
      { name: 'Триплекс UltraClear (зак.) полир', unit: 'м2', kind: 'основн.', j: 1, k: 1.2 },
      { name: 'Уплотнитель EPDM базовый', unit: 'м', kind: 'вспомогат.', j: 1, k: 1.05, price: 50 },
      { name: 'Уплотнитель EPDM установочный', unit: 'м', kind: 'вспомогат.', j: 1, k: 1.05, price: 50 },
      { name: 'Крышка декоративная', unit: 'м', kind: 'вспомогат.', j: 1, k: 1.05, price: 200 },
      { name: 'Клипса зажимная для стекла', unit: 'шт', kind: 'вспомогат.', j: 4, k: 1.05, price: 450 },
      { name: 'Химический анкер эпоксидный', unit: 'шт', kind: 'вспомогат.', j: 0.5, k: 1.05, price: 1690 },
      { name: 'Анкерный крепеж Ø14х110 + винт М10, AISI 304+Q345B', unit: 'шт', kind: 'вспомогат.', j: 8, k: 1.05, price: 503 },
    ],
  },
  glass_railing_molled: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Ограждения, козырьки, маркизы / Здание',
    works: [
      { name: 'Монтаж стеклянных ограждений', unit: 'м2' },
      { name: 'Гибка профиля', unit: 'м2' },
    ],
    materials: [
      { name: 'Профиль алюминиевый зажимной L=3000 мм', unit: 'м', kind: 'основн.', j: 0.83, k: 1.1 },
      { name: 'Триплекс UltraClear (зак.) полир', unit: 'м2', kind: 'основн.', j: 1, k: 1.2 },
      { name: 'Уплотнитель EPDM', unit: 'м', kind: 'вспомогат.', j: 1, k: 1.05, price: 50 },
      { name: 'Крышка декоративная', unit: 'м', kind: 'вспомогат.', j: 1, k: 1.05, price: 200 },
      { name: 'Клипса зажимная для стекла', unit: 'шт', kind: 'вспомогат.', j: 4, k: 1.05, price: 450 },
      { name: 'Химический анкер эпоксидный', unit: 'шт', kind: 'вспомогат.', j: 0.5, k: 1.05, price: 1690 },
      { name: 'Анкерный крепеж Ø14х110 + винт М10, AISI 304+Q345B', unit: 'шт', kind: 'вспомогат.', j: 8, k: 1.05, price: 503 },
    ],
  },
  glass_canopy: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Ограждения, козырьки, маркизы / Здание',
    works: [
      { name: 'Монтаж стеклянных козырьков на тягах с устройством метал. каркаса', unit: 'м2' },
    ],
    materials: [
      { name: 'Козырек из триплекса в алюминиевом профиле', unit: 'м2', kind: 'основн.', j: 1, k: 1.2 },
    ],
  },
  doors_entrance: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Двери наружные по фасаду (входные и БКФН, тамбурные двери) / Здание',
    works: [
      { name: 'Монтаж алюминиевых дверных блоков в составе витража', unit: 'м2' },
    ],
    materials: [
      { name: 'Профиль дверной алюминиевый (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.1 },
    ],
  },
  doors_tambour: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Тамбура (1-ые этажи и БКФН) / Здание',
    works: [
      { name: 'Монтаж алюминиевых дверных блоков в составе витража', unit: 'м2' },
    ],
    materials: [
      { name: 'Профиль дверной алюминиевый (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.1 },
    ],
  },
  pvh_profile: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Профиль ПВХ / Здание',
    works: [{ name: 'Монтаж ПВХ окон', unit: 'м2' }],
    materials: [
      { name: 'Расходные материалы для ПВХ', unit: 'м2', kind: 'вспомогат.', j: 1, k: 1.1 },
      { name: 'Профиль ПВХ (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.1 },
    ],
  },
  spk_hardware: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Фурнитура / Здание',
    works: [],
    materials: [
      { name: 'Фурнитура', unit: 'м2', kind: 'основн.', j: 1, k: 1.1 },
    ],
  },
  vent_grilles: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    works: [
      { name: 'Установка заполнений витражей: Решетка', unit: 'м2' },
    ],
    materials: [
      { name: 'Вентиляционная решетка (по проекту)', unit: 'м2', kind: 'основн.', j: 1, k: 1.2 },
    ],
  },
  wet_facade_insulation: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Устройство мокрого фасада / Здание',
    works: [
      { name: 'Мокрый штукатурный фасад', unit: 'м2' },
    ],
    materials: [
      { name: 'Утеплитель минераловатный (по проекту)', unit: 'м3', kind: 'основн.', j: 0.1, k: 1.15 },
      { name: 'Клей ROCKglue', unit: 'кг', kind: 'вспомогат.', j: 6, k: 1.1, price: 54.75 },
      { name: 'Дюбель для изоляции (гриб) 10*260 мет.гвоздем', unit: 'шт', kind: 'вспомогат.', j: 7, k: 1.05, price: 15 },
      { name: 'Армирующая шпаклевка ROCKmortar', unit: 'кг', kind: 'вспомогат.', j: 6, k: 1.1, price: 56.38 },
      { name: 'Сетка стеклотканевая', unit: 'м2', kind: 'вспомогат.', j: 1, k: 1.1, price: 219 },
    ],
  },
  wet_facade_finish: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Устройство мокрого фасада / Здание',
    works: [
      { name: 'Мокрый штукатурный фасад', unit: 'м2' },
    ],
    materials: [
      { name: 'Штукатурка декоративная (по проекту)', unit: 'кг', kind: 'основн.', j: 5.5, k: 1.1 },
      { name: 'Грунтовка пропитывающая', unit: 'л', kind: 'основн.', j: 1, k: 1 },
      { name: 'Грунтовочный слой', unit: 'кг', kind: 'основн.', j: 1, k: 1 },
    ],
  },
  wet_facade_paint: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Устройство мокрого фасада / Здание',
    works: [
      { name: 'Окраска фасада', unit: 'м2' },
    ],
    materials: [
      { name: 'Краска силиконовая атмосферостойкая', unit: 'кг', kind: 'основн.', j: 1, k: 1 },
    ],
  },
  wet_facade: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Устройство мокрого фасада / Здание',
    works: [{ name: 'Мокрый штукатурный фасад', unit: 'м2' }],
    materials: [
      { name: 'ROCKforce грунтовка пропитывающая', unit: 'л', kind: 'основн.', j: 0.18, k: 1.1 },
      { name: 'ROCKglue', unit: 'кг', kind: 'основн.', j: 6, k: 1.1, price: 54.75 },
      { name: 'Дюбель для изоляции (гриб) 10*260 мет.гвоздем', unit: 'шт', kind: 'вспомогат.', j: 7, k: 1.05, price: 15 },
      { name: 'Армирующая шпаклевка ROCKmortar', unit: 'кг', kind: 'основн.', j: 6, k: 1.1, price: 56.38 },
      { name: 'Сетка стеклотканевая для фасадных работ FasadPro 2000 1x50 м', unit: 'м2', kind: 'основн.', j: 1, k: 1.1, price: 219 },
      { name: 'Грунтовочный слой ROCKprimer (на все 3 слоя)', unit: 'кг', kind: 'основн.', j: 0.75, k: 1.15 },
      { name: 'Силикатно-силиконовая структурная штукатурка для наружных работ', unit: 'кг', kind: 'основн.', j: 0.37, k: 1.1 },
      { name: 'Краска силиконовая ROCKsil', unit: 'кг', kind: 'основн.', j: 0.3, k: 1.15 },
    ],
  },
  nvf_cladding_profiles_vertical: {
    costPath: 'ФАСАДНЫЕ РАБОТЫ / Облицовка НВФ / Здание',
    workMaterials: [
      {
        work: { name: 'Монтаж декоративных прямоугольных профилей', unit: 'м.п.' },
        materials: [{ name: 'Декоративный профиль прямоугольный (по проекту)', unit: 'м.п.', kind: 'основн.', j: 1, k: 1.2 }],
      },
      {
        work: { name: 'Монтаж креплений', unit: 'м.п.' },
        materials: [{ name: 'Крепление', unit: 'м.п.', kind: 'основн.', j: 1, k: 1 }],
      },
    ],
  },
  mockup: {
    costPath: 'МОКАП / Фасадные работы / Здание',
    works: [
      { name: 'Устройство мокап фасада', unit: 'компл' },
    ],
    materials: [
      { name: 'Материалы для мокап фасада', unit: 'компл', kind: 'основн.', j: 1, k: 1 },
    ],
  },
};

// ─── Гранулярные правила матчинга ────────────────────────────────────
// Порядок важен: специфичные правила ПЕРВЫМИ, общие — последними.
// Первое совпадение побеждает.
const MATCH_RULES = [
  // === Пропускаемые позиции (не наш раздел) ===
  { keywords: ['архитектурн.*освещен', 'освещен.*фасад'],
    templates: [], secondary: [] },

  // Перголы — всегда ручная расценка, пропускаем
  { keywords: ['пергол'],
    templates: [], secondary: [] },

  // Пол в технических лоджиях/кондиционеров — не наш раздел
  { keywords: ['пол.*технич.*лоджи', 'пол.*лоджи.*кондиционер', 'пол.*лоджи.*тех'],
    templates: [], secondary: [] },

  // === МОКАП — всегда отдельный шаблон ===
  { keywords: ['мокап', 'mock-up', 'mockup'],
    templates: ['mockup'], secondary: [] },

  // Фурнитура — отдельный шаблон (редко, по явному ключевому слову)
  { keywords: ['фурнитур'],
    templates: ['spk_hardware'], secondary: [] },

  // КМД — отдельные позиции (если есть, НЕ дублируем как secondary)
  { keywords: ['разработк.*км.*спк', 'км.*спк.*разработк', 'разработк.*спк.*км'],
    templates: ['kmd_spk'], secondary: [] },
  { keywords: ['разработк.*км.*нвф', 'км.*нвф.*разработк', 'разработк.*нвф.*км'],
    templates: ['kmd_nvf'], secondary: [] },
  { keywords: ['разработк.*км', 'разработк.*рд', 'разработк.*рабоч.*документ'],
    templates: ['kmd_spk'], secondary: [] },

  // Защитные экраны из триплекса — то же, что стеклянное ограждение (ДО защиты СПК)
  { keywords: ['защит.*экран', 'экран.*триплекс', 'экран.*стекл', 'стекл.*экран', 'триплекс.*экран'],
    templates: ['glass_railing'], secondary: [] },

  { keywords: ['защит.*стекл', 'бронир', 'защит.*спк', 'защит.*светопрозр'],
    templates: ['spk_broneplenka'], secondary: [] },

  // Моллированные стеклянные ограждения (гибка + доп. анкер)
  { keywords: ['молл', 'моллирован', 'изогнут', 'гнут'],
    templates: ['glass_railing_molled'], secondary: [] },

  // === Стеклянные ограждения — ДО общего правила "стекл" ===
  { keywords: ['ограждени.*стекл', 'стекл.*ограждени', 'ограждени.*кровл', 'ограждени.*террас', 'ограждени.*балкон', 'стилобат', 'перильн.*светопрозрачн', 'светопрозрачн.*перильн'],
    templates: ['glass_railing'], secondary: [] },

  // Откосы с мокрым фасадом (ВЫШЕ общего откос)
  { keywords: ['откос.*мокр', 'мокр.*фасад.*откос', 'откос.*штукатурн'],
    templates: ['wet_facade', 'flashings', 'pp_otsechi'], secondary: [] },

  // Откосы с кассетами / алюминиевым фасадом (ВЫШЕ общего откос)
  { keywords: ['откос.*кассет', 'кассет.*откос', 'откос.*алюминиев.*фасад'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette', 'flashings', 'pp_otsechi'], secondary: [] },

  // Навесные элементы на витраж (пилоны) → кассеты без утеплителя (ВЫШЕ витраж)
  { keywords: ['навесн.*элемент.*витраж', 'пилон.*горизонт', 'пилон.*навесн', 'навесн.*пилон'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette'], secondary: ['scaffolding'] },

  // Фасадные короба и корзины кондиционеров → кассеты без утеплителя
  { keywords: ['фасадн.*короб.*кондиционер', 'короб.*наружн.*блок', 'короб.*кондиционер', 'корзин.*кондиционер', 'корзин.*наружн.*блок'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette'], secondary: ['scaffolding'] },

  // Решётки под лоджиями → полный НВФ с кассетами
  { keywords: ['решетк.*лоджи', 'решетк.*ниш.*кондиционер', 'решетк.*технич.*лодж'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },

  // Вертикальные прямоугольные профили
  { keywords: ['вертикальн.*прямоугольн.*профил', 'прямоугольн.*профил.*вертикальн', 'декоратив.*прямоугольн.*профил'],
    templates: ['nvf_cladding_profiles_vertical'], secondary: [] },

  // Тамбура — отдельный costPath (ВЫШЕ стоечно-ригельн)
  { keywords: ['тамбур'],
    templates: ['spk_profile', 'doors_tambour', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },
  // ПВХ окна — ВЫШЕ дверных правил (чтобы "блоки балконные дверные из ПВХ" не уходили в двери)
  { keywords: ['пвх', 'pvh', 'brusbox', 'остеклени.*лоджи', 'остеклени.*балкон', 'профил.*пвх', 'пвх.*профил'],
    templates: ['pvh_profile', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },

  // Внутренние двери = тамбурные (ВЫШЕ входных)
  { keywords: ['двер.*внутренн', 'внутренн.*двер'],
    templates: ['spk_profile', 'doors_tambour', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },
  // Двери входные (витражные, БКФН) — ВЫШЕ стоечно-ригельн
  { keywords: ['двер.*входн', 'входн.*двер', 'БКФН', 'бкфн', 'двер.*витражн', 'витражн.*двер'],
    templates: ['spk_profile', 'doors_entrance', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },
  // Общие двери (fallback) — ВЫШЕ стоечно-ригельн
  { keywords: ['двер', 'створч'],
    templates: ['spk_profile', 'doors_entrance', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },

  // Окна — ВЫШЕ "стекл", чтобы получить scaffolding+kmd+защиту
  { keywords: ['окна', 'оконн', 'аит'],
    templates: ['spk_profile', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },

  // Стемалит — полный СПК (крашеный стеклопакет)
  { keywords: ['стемалит'],
    templates: ['spk_profile', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },

  // Козырёк — ВЫШЕ "стоечно-ригельн" и "профил", т.к. "Козырек ... в составе витражной стоечно-ригельной" содержит оба
  { keywords: ['козыр'],
    templates: ['glass_canopy'], secondary: [] },

  // === СПК полный цикл: стоечно-ригельная конструкция ===
  { keywords: ['стоечно-ригельн'],
    templates: ['spk_profile', 'spk_glass', 'spk_broneplenka'], secondary: ['scaffolding', 'kmd_spk'] },

  // НВФ клинкер — полный цикл: подсистема + утеплитель + облицовка
  { keywords: ['облицовк.*клинкер', 'клинкер.*облицовк', 'клинкер.*плитк'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_clinker'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ кассеты — полный цикл
  { keywords: ['облицовк.*кассет', 'кассет.*облицовк', 'облицовк.*алюмин'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ фиброцементная панель ФЦП (k=1.05) — ДО фибробетона (т.к. "фибр" общий)
  { keywords: ['фиброцемент', 'фцп\\b', 'цементн.*панел.*фасад'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_fcp'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ фибробетон — полный цикл
  { keywords: ['фибробетон', 'стеклофибробетон', 'сфб', 'облицовк.*фибр', 'фибр.*облицовк'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_fibrobeton'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ керамогранит — полный цикл (k=1.22)
  { keywords: ['керамогранит', 'облицовк.*керамогранит'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_porcelain'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ керамические панели — полный цикл (k=1.22)
  { keywords: ['керамическ.*панел', 'панел.*керамическ', 'облицовк.*керамическ', 'керамическ.*облицовк'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_ceramic'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ натуральный камень (k=1.22) — 'камн' корень чтобы ловить "камнем/камня/камни"
  { keywords: ['натуральн.*камн', 'камн.*натуральн', 'облицовк.*натур.*камн', 'облицовк.*камн', 'камн.*облицовк', 'гранитн.*камн'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_natural_stone'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ алюмокомпозитная панель АКП (k=1.22)
  { keywords: ['алюмокомпозит', 'алюмин.*композит', 'композит.*алюмин', 'акп\\b', 'облицовк.*акп'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_akp'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ бетонная плитка (k=1.15)
  { keywords: ['бетонн.*плитк', 'плитк.*бетонн', 'облицовк.*бетонн.*плитк'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_concrete_tile'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ кирпич облицовочный (k=1.05)
  { keywords: ['облицовк.*кирпич', 'кирпич.*облицовк', 'кирпичн.*облицовк', 'облицовочн.*кирпич'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_brick'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ оцинкованный лист облицовка (k=1.20) — только для НВФ, НЕ для отливов/парапетов
  { keywords: ['облицовк.*оцинкован.*лист', 'оцинкован.*лист.*облицовк', 'облицовк.*лист.*оцинкован'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_galvanized'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ архитектурный бетон (k=1.00)
  { keywords: ['архитектурн.*бетон', 'бетон.*архитектурн', 'облицовк.*архитектурн.*бетон'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_arch_concrete'], secondary: ['scaffolding', 'kmd_nvf'] },

  // НВФ generic — fallback по ключу "нвф" / "навесн вентилир" (когда тип облицовки не указан)
  { keywords: ['нвф\\.', 'нвф\\s', 'навесн.*вентилир', 'вентилируем.*фасад'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },

  // Утеплитель с явными ключами типа — ДО общего "стекл" (иначе "пеностекла" ловится на "стекл")
  { keywords: ['пеностекл', 'эппс', 'экструдирован.*пенополистирол', 'пенополистирол.*экструдирован'],
    templates: ['insulation'], secondary: ['scaffolding', 'kmd_nvf'] },

  // СПК fallback по "профил"/"каркас" (ПОСЛЕ специфичных окон/дверей/стоечно-ригельн)
  { keywords: ['профил', 'каркас', 'сборка.*витраж', 'монтаж.*витраж', 'монтаж.*спк', 'устройство.*профил'],
    templates: ['spk_profile'], secondary: ['scaffolding', 'kmd_spk'] },

  { keywords: ['стекл', 'остеклен', 'заполнен', 'стеклопакет'],
    templates: ['spk_glass'], secondary: [] },

  // === Решётки — БЕЗ лесов и КМД ===
  { keywords: ['вентрешетк', 'ламел', 'решетк'],
    templates: ['vent_grilles'], secondary: [] },

  // === Леса — отдельная позиция ===
  { keywords: ['лес[аоы]', 'люльк', 'подмост', 'подмащив'],
    templates: ['scaffolding'], secondary: [] },

  // === НВФ: отдельно подсистема, облицовка, утеплитель ===
  { keywords: ['подсистем'],
    templates: ['nvf_subsystem'], secondary: [] },

  // Краска фасадная
  { keywords: ['краск.*атмосфер', 'краск.*силикон', 'краск.*фасад'],
    templates: ['wet_facade_paint'], secondary: [] },
  // Отделка декоративным слоем мокрого фасада
  { keywords: ['отделк.*мокр', 'декор.*мокр', 'мокр.*декор', 'отделк.*штукатур'],
    templates: ['wet_facade_finish'], secondary: [] },
  // Полный мокрый фасад (со всеми материалами) — утеплитель вставляется inline в генераторе
  { keywords: ['мокрого фасада', 'устройств.*мокрого', 'мокр.*фасад.*систем', 'мокр.*фасад.*техн', 'мокрый штукатурн', 'rockforce', 'rockglue'],
    templates: ['wet_facade'], secondary: [] },
  // Мокрый фасад — с утеплением (старый fallback, после основного правила)
  { keywords: ['мокр.*фасад.*утепл', 'утепл.*мокр.*фасад', 'мокр.*утепл.*фасад'],
    templates: ['wet_facade_insulation'], secondary: [] },
  // Общий fallback по "штукатур"/"сфтк"/"мокр.*фасад"/"отделка стен" → ПОЛНЫЙ мокрый фасад
  { keywords: ['штукатур', 'сфтк', 'мокр.*фасад', 'отделка стен'],
    templates: ['wet_facade'], secondary: [] },

  { keywords: ['утеплен', 'утеплит', 'минерал', 'минват', 'теплоизол',
               'пеностекл', 'эппс', 'экструдирован.*пенополистирол', 'пенополистирол.*экструдирован'],
    templates: ['insulation'], secondary: [] },

  // === Прочие — одиночные шаблоны ===
  { keywords: ['откос'], templates: ['flashings', 'pp_otsechi'], secondary: [] },
  { keywords: ['отлив'], templates: ['flashings'], secondary: [] },
  { keywords: ['парапет'], templates: ['flashings'], secondary: [] },
  { keywords: ['перфорирован'], templates: ['nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },

  // === Составные позиции (когда НЕ разбиты на подпозиции) ===
  { keywords: ['витраж', 'светопрозрачн'],
    templates: ['spk_profile', 'spk_glass'], secondary: ['scaffolding', 'kmd_spk'] },

  { keywords: ['клинкер'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_clinker'], secondary: ['scaffolding', 'kmd_nvf'] },

  // Сэндвич-панель — утеплитель встроен, отдельной подсистемы нет
  { keywords: ['сэндвич', 'трёхслойн.*панел', 'трехслойн.*панел'],
    templates: ['nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },

  { keywords: ['кассет'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'] },
];

/**
 * Определяет, является ли позиция заголовком (имеет дочерние позиции).
 */
export function isHeader(pos, allPositions = null, options = {}) {
  const priceAllWithQty = options.priceAllWithQty === true;
  const hasQty =
    (pos.qty && pos.qty !== 0) ||
    (pos.qtyCustomer && pos.qtyCustomer !== 0) ||
    (pos.qtyGp && pos.qtyGp !== 0);

  // Нет объёма — всегда заголовок
  if (!hasQty) return true;

  // Донстрой-режим: всё с объёмом расцениваем (и родителей, и дочерних)
  if (priceAllWithQty) return false;

  // Стандарт: родитель с дочерними позициями — заголовок (не дублируем объём с листьями)
  if (!pos.code || !allPositions) return false;
  const prefix = pos.code.replace(/\.$/, '');
  return allPositions.some(other =>
    other !== pos &&
    other.code &&
    other.code.startsWith(prefix + '.') &&
    other.code.length > pos.code.length
  );
}

/**
 * Определяет шаблоны для конкретной позиции ВОР.
 * Первое совпадение правил побеждает.
 */
export function matchPosition(positionName, noteCustomer = '') {
  const searchText = (positionName + ' ' + (noteCustomer || '')).toLowerCase();
  // Маркер "без утепления/утеплителя" — исключаем insulation из результата
  const skipInsulation = /без\s+утепл|декоратив/i.test(searchText);
  const matched = [];
  const seen = new Set();

  for (const rule of MATCH_RULES) {
    // Правило, которое даёт ТОЛЬКО insulation — пропускаем, если "без утепл"
    if (skipInsulation && rule.templates.length === 1 && rule.templates[0] === 'insulation') {
      continue;
    }
    const hit = rule.keywords.some(kw => {
      if (kw.includes('.*') || kw.includes('[')) return new RegExp(kw, 'i').test(searchText);
      return searchText.includes(kw);
    });
    if (hit) {
      for (const t of rule.templates) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { matched.push(t); seen.add(t); }
      }
      for (const t of rule.secondary) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { matched.push(t); seen.add(t); }
      }
      break;
    }
  }

  return matched;
}

/**
 * Как matchPosition, но дополнительно возвращает сработавшее правило (индекс + ключевое слово).
 * Используется для отладки и отображения источника матчинга в UI.
 */
export function matchPositionDetailed(positionName, noteCustomer = '') {
  const searchText = (positionName + ' ' + (noteCustomer || '')).toLowerCase();
  const skipInsulation = /без\s+утепл|декоратив/i.test(searchText);

  for (let i = 0; i < MATCH_RULES.length; i++) {
    const rule = MATCH_RULES[i];
    if (skipInsulation && rule.templates.length === 1 && rule.templates[0] === 'insulation') continue;
    const matchedKeyword = rule.keywords.find(kw => {
      if (kw.includes('.*') || kw.includes('[')) return new RegExp(kw, 'i').test(searchText);
      return searchText.includes(kw);
    });
    if (matchedKeyword) {
      const templates = [];
      const seen = new Set();
      for (const t of rule.templates) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { templates.push(t); seen.add(t); }
      }
      for (const t of rule.secondary) {
        if (skipInsulation && t === 'insulation') continue;
        if (!seen.has(t)) { templates.push(t); seen.add(t); }
      }
      return { templates, ruleIndex: i, keyword: matchedKeyword };
    }
  }
  return { templates: [], ruleIndex: -1, keyword: null };
}

/**
 * Определяет стиль ВОР: simple (Сокольники) или split-3 (Муза).
 * Сканирует все названия позиций. Если есть "прочие материалы" / "вспомогательные материалы" → split-3.
 */
export function detectVorStyle(positions) {
  const auxPattern = /прочие\s+материал|вспомогательн\w*\s+материал/i;
  for (const pos of positions) {
    if (auxPattern.test(pos.name || '')) return 'split-3';
  }
  return 'simple';
}

/**
 * Классифицирует роль строки в split-3 режиме: work / material / auxiliary.
 * - auxiliary: "прочие материалы", "вспомогательные материалы"
 * - work: начинается с глагола действия (монтаж, устройство, установка, и т.д.)
 * - material: всё остальное (конкретный материал)
 */
export function classifyRowRole(name) {
  const lower = (name || '').toLowerCase().trim();
  if (/прочие\s+материал|вспомогательн\w*\s+материал/.test(lower)) return 'auxiliary';
  if (/^(монтаж|устройство|установка|сборка|демонтаж|оклейка|затирка|изготовление|разработка|утепление\s|наружная\s+облицовк|заполнение|монтаж\/демонтаж|отделка)/.test(lower)) return 'work';
  return 'material';
}

/**
 * Определяет толщину утеплителя из названия позиции и примечания.
 * Приоритет: название > примечание > дефолт 150мм.
 */
export function detectInsulationThickness(name, note) {
  const nameStr = name || '';
  const noteStr = note || '';

  // Паттерн 1: явное "NNN мм" (основной)
  const patternMm = /(\d{2,3})\s*мм/;
  // Паттерн 2: "толщ" + число (без "мм")
  const patternTolsch = /толщ\.?\s*(\d{2,3})/i;
  // Паттерн 3: габариты "x NNN" — последнее число = толщина
  const patternDim = /\d+\s*[xх×]\s*\d+\s*[xх×]\s*(\d{2,3})/i;

  // Любая толщина в разумном диапазоне (30-300мм)
  for (const str of [nameStr, noteStr]) {
    for (const pat of [patternMm, patternTolsch, patternDim]) {
      const m = str.match(pat);
      if (m) {
        const mm = parseInt(m[1]);
        if (mm >= 30 && mm <= 300) return mm;
      }
    }
  }
  return 150;
}

/**
 * Определяет тип утеплителя из названия/примечания.
 * 'foam_glass' — пеностекло, 'xps' — ЭППС/экструдированный пенополистирол,
 * 'mineral' — минераловатный (дефолт).
 */
export function detectInsulationType(name, note) {
  const s = ((name || '') + ' ' + (note || '')).toLowerCase();
  if (/пеностекл/.test(s)) return 'foam_glass';
  if (/эппс|экструдирован.*пенополистирол|пенополистирол.*экструдирован/.test(s)) return 'xps';
  return 'mineral';
}

/**
 * Возвращает скорректированный шаблон утеплителя под толщину, тип и слои.
 * Формула толщины:
 *   - Всегда 2 слоя: наружный = 50мм (j=0.05), внутренний = (толщина - 50)мм / 1000
 *   - Если толщина ≤ 50мм → 1 слой, j = толщина / 1000
 *   - Оба слоя называются одинаково (бренд/тип без суффиксов)
 *   - layers: { outer, inner } — ручные толщины из названия позиции "X+Y мм"
 */
export function adjustInsulationTemplate(thickness, insulationType = 'mineral', layers = null) {
  const base = TEMPLATES.insulation;

  let outerMm, innerMm;
  if (layers) {
    outerMm = layers.outer;
    innerMm = layers.inner;
  } else {
    outerMm = 50;
    innerMm = thickness - 50;
  }
  const oneLayer = (layers ? innerMm <= 0 : thickness <= 50);

  const outerJ = outerMm / 1000;
  const innerJ = innerMm / 1000;

  const works = base.works.map(w => ({
    ...w,
    name: oneLayer
      ? `Утепление в 1 слой (${thickness} мм)`
      : `Утепление в 2 слоя (${thickness} мм)`,
  }));

  // Имя утеплителя по типу
  const insulationName = insulationType === 'foam_glass' ? 'Утеплитель пеностекло'
                       : insulationType === 'xps' ? 'Утеплитель ЭППС'
                       : 'Утеплитель ТЕХНОВЕНТ ОПТИМА';

  let materials;
  const [mat0, mat1, mem, dub0, dub1] = base.materials;
  if (oneLayer) {
    materials = [
      { ...mat0, name: insulationName, j: outerJ },
      { ...mem },
      { ...dub0 },
      { ...dub1 },
    ];
  } else {
    materials = [
      { ...mat0, name: insulationName, j: outerJ },
      { ...mat1, name: insulationName, j: innerJ },
      { ...mem },
      { ...dub0 },
      { ...dub1 },
    ];
  }

  return { ...base, works, materials };
}

/**
 * Определяет слои утеплителя из формата "X+Y мм" в названии позиции.
 * Возвращает { outer, inner } (оба в мм), или null если не найдено.
 */
export function detectInsulationLayers(name, note) {
  const s = ((name || '') + ' ' + (note || '')).toLowerCase();
  const m = s.match(/(\d+)\s*\+\s*(\d+)\s*мм/);
  if (m) {
    const a = parseInt(m[1]);
    const b = parseInt(m[2]);
    if (a >= 30 && a <= 200 && b >= 30 && b <= 200) {
      return { outer: Math.min(a, b), inner: Math.max(a, b) };
    }
  }
  return null;
}

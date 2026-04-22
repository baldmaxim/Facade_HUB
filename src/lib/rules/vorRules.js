/**
 * Правила матчинга позиций ВОР на шаблоны.
 * Порядок важен: специфичные правила ПЕРВЫМИ, общие — последними.
 * Первое совпадение побеждает.
 */

export const MATCH_RULES = [
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
    templates: ['wet_facade', 'pp_otsechi'], secondary: [] },

  // Откосы с кассетами / алюминиевым фасадом (ВЫШЕ общего откос)
  { keywords: ['откос.*кассет', 'кассет.*откос', 'откос.*алюминиев.*фасад'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette', 'pp_otsechi'], secondary: [] },

  // Навесные элементы на витраж (пилоны) → кассеты без утеплителя (ВЫШЕ витраж)
  { keywords: ['навесн.*элемент.*витраж', 'пилон.*горизонт', 'пилон.*навесн', 'навесн.*пилон'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette'], secondary: ['scaffolding'] },

  // Фасадные короба и корзины кондиционеров → кассеты без утеплителя
  { keywords: ['фасадн.*короб.*кондиционер', 'короб.*наружн.*блок', 'короб.*кондиционер', 'корзин.*кондиционер', 'корзин.*наружн.*блок'],
    templates: ['nvf_subsystem', 'nvf_cladding_cassette'], secondary: ['scaffolding'] },

  // Решётки под лоджиями → полный НВФ с кассетами
  { keywords: ['решетк.*лоджи', 'решетк.*ниш.*кондиционер', 'решетк.*технич.*лодж'],
    templates: ['nvf_subsystem', 'insulation', 'nvf_cladding_cassette'], secondary: ['scaffolding', 'kmd_nvf'],
    defaultThickness: 180 },

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

# -*- coding: utf-8 -*-
"""Анализ реального ВОР: извлечение шаблонов и маппинг позиция→шаблоны"""
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

# === Шаблоны, извлечённые из реального ВОР ===
TEMPLATES = {
    "spk_profile": {
        "name": "Профиль СПК (стоечно-ригельная система)",
        "trigger_keywords": ["витраж", "стоечно-ригельн", "алюминиев", "светопрозрачн"],
        "works": [
            {"name": "Сборка и монтаж алюминиевых витражей (каркас и заполнение, герметизация)", "unit": "м2", "price_ref": 14555}
        ],
        "materials": [
            {"name": "Кронштейны опорные, ветровые (0,83шт/м2)", "unit": "шт", "type": "вспомогат.", "coeff": 0.83, "price_ref": 760.22},
            {"name": "Анкер клиновой 10*95", "unit": "шт", "type": "вспомогат.", "price_ref": 69},
            {"name": "Профиль АЛМО (по проекту)", "unit": "м2", "type": "основн.", "price_ref": 9107}
        ]
    },
    "spk_glass": {
        "name": "Заполнение СПК (стеклопакеты)",
        "trigger_keywords": ["стеклопакет", "остеклен", "заполнен"],
        "works": [
            {"name": "Заполнение алюминиевых светопрозрачных конструкций", "unit": "м2", "price_ref": 6050}
        ],
        "materials": [
            {"name": "Стеклопакет (по спецификации проекта)", "unit": "м2", "type": "основн.", "price_range": "15790-63900"}
        ],
        "note": "Стекло разбивается по типам из проекта, каждый тип = отдельная строка работ + материал"
    },
    "spk_broneplenka": {
        "name": "Бронирование СПК",
        "trigger_keywords": ["бронир", "защитн.*пленк"],
        "works": [
            {"name": "Оклейка бронирующей пленки с СПК", "unit": "м2", "price_ref": 650.6}
        ],
        "materials": [
            {"name": "Пленка защитная НТК ОПТИМА 90 мкм", "unit": "м2", "type": "основн.", "price_ref": 37.8}
        ]
    },
    "scaffolding": {
        "name": "Леса и подмости",
        "trigger_keywords": ["ALWAYS"],
        "works": [
            {"name": "Монтаж/демонтаж лесов, подмостей, средств подмащивания", "unit": "м2", "price_ref": 1552.5}
        ],
        "materials": [
            {"name": "Анкера для строительных лесов, хомут-стяжка для сетки и пр", "unit": "м2", "type": "основн.", "price_ref": 800}
        ],
        "note": "Применяется ВСЕГДА к каждой позиции (кроме откосов/отливов)"
    },
    "kmd_spk": {
        "name": "Разработка КМ/КМД СПК",
        "trigger_keywords": ["витраж", "светопрозрачн", "остеклен"],
        "works": [
            {"name": "Разработка КМ/КМД СПК", "unit": "м2", "price_ref": 800}
        ],
        "materials": []
    },
    "kmd_nvf": {
        "name": "Разработка КМ/КМД НВФ",
        "trigger_keywords": ["нвф", "подсистем", "кассет", "клинкер", "вентфасад"],
        "works": [
            {"name": "Разработка КМ/КМД НВФ", "unit": "м2", "price_ref": 400}
        ],
        "materials": []
    },
    "nvf_subsystem": {
        "name": "Подсистема НВФ",
        "trigger_keywords": ["подсистем", "нвф", "вентфасад", "вентилируем", "навесн"],
        "works": [
            {"name": "Монтаж подсистемы НВФ", "unit": "м2", "price_range": "8592-9735",
             "note": "кассеты=8592, клинкер=9735"}
        ],
        "materials": [
            {"name": "Подсистема (по проекту)", "unit": "м2", "type": "основн.", "price_range": "1453-7198"}
        ]
    },
    "nvf_cladding_clinker": {
        "name": "Облицовка НВФ клинкерной плиткой",
        "trigger_keywords": ["клинкер"],
        "works": [
            {"name": "Наружная облицовка фасада клинкерной плиткой", "unit": "м2", "price_ref": 10725},
            {"name": "Затирка швов клинкерной плитки", "unit": "м2", "price_ref": 2000}
        ],
        "materials": [
            {"name": "Фасадная клинкерная плитка (по проекту)", "unit": "м2", "type": "основн.", "price_ref": 3885.6},
            {"name": "Смесь затирочная для НФС", "unit": "м2", "type": "основн.", "price_ref": 699.6}
        ]
    },
    "nvf_cladding_cassette": {
        "name": "Облицовка НВФ алюминиевыми кассетами",
        "trigger_keywords": ["кассет", "алюминиев.*лист", "сэндвич"],
        "works": [
            {"name": "Наружная облицовка фасада алюминиевыми кассетами", "unit": "м2", "price_ref": 8956.06}
        ],
        "materials": [
            {"name": "Алюминиевая кассета (по проекту)", "unit": "м2", "type": "основн.", "price_ref": 10550}
        ]
    },
    "insulation": {
        "name": "Утепление фасада",
        "trigger_keywords": ["утеплит", "минерал", "теплоизол", "минват", "стемалит"],
        "works": [
            {"name": "Утепление в 2 слоя (180 мм)", "unit": "м2", "price_ref": 2564.1}
        ],
        "materials": [
            {"name": "Мембрана ветрозащитная ТехноНИКОЛЬ АЛЬФА ПРОФ НГ", "unit": "м2", "type": "основн.", "price_ref": 148.88},
            {"name": "Дюбель фасадный забивной EJOT (наруж. слой)", "unit": "м2", "type": "вспомогат.", "price_ref": 13.25},
            {"name": "Утеплитель ТЕХНОВЕНТ ОПТИМА (наруж. слой)", "unit": "м3", "type": "основн.", "price_ref": 8930},
            {"name": "Утеплитель ТЕХНОВЕНТ Н (внутр. слой)", "unit": "м3", "type": "основн.", "price_ref": 3991.12},
            {"name": "Дюбель фасадный забивной EJOT (внутр. слой)", "unit": "м2", "type": "вспомогат.", "price_ref": 18.73}
        ]
    },
    "flashings": {
        "name": "Откосы / отливы / парапеты (оцинковка)",
        "trigger_keywords": ["откос", "отлив", "парапет", "оцинков"],
        "works": [
            {"name": "Изготовление и монтаж оцинкованных элементов", "unit": "м.п.", "price_ref": 2400}
        ],
        "materials": [
            {"name": "Лист 0,7 оц. с полимерным покрытием", "unit": "м2", "type": "основн.", "price_range": "826-1645"},
            {"name": "Заклепка вытяжная 4,0*8", "unit": "шт", "type": "вспомогат.", "price_ref": 1.44},
            {"name": "Дюбель-гвоздь 6*60", "unit": "шт", "type": "вспомогат.", "price_ref": 1.6}
        ]
    },
    "glass_railing": {
        "name": "Стеклянные ограждения",
        "trigger_keywords": ["ограждени.*стекл", "триплекс.*ограждени"],
        "works": [
            {"name": "Монтаж стеклянных ограждений", "unit": "м2", "price_ref": 20000}
        ],
        "materials": [
            {"name": "Профиль алюминиевый зажимной L=3000 мм", "unit": "м", "type": "основн.", "price_ref": 3900},
            {"name": "Триплекс UltraClear (зак.) полир", "unit": "м2", "type": "основн.", "price_ref": 17970},
            {"name": "Уплотнитель EPDM базовый", "unit": "м", "type": "вспомогат.", "price_ref": 50},
            {"name": "Уплотнитель EPDM установочный", "unit": "м", "type": "вспомогат.", "price_ref": 50},
            {"name": "Крышка декоративная", "unit": "м", "type": "основн.", "price_ref": 200},
            {"name": "Клипса зажимная для стекла", "unit": "шт", "type": "вспомогат.", "price_ref": 450},
            {"name": "Химический анкер эпоксидный", "unit": "шт", "type": "вспомогат.", "price_ref": 1690},
            {"name": "Анкерный крепеж AISI 304", "unit": "шт", "type": "вспомогат.", "price_ref": 503}
        ]
    },
    "glass_canopy": {
        "name": "Козырьки из триплекса",
        "trigger_keywords": ["козыр", "триплекс.*козыр"],
        "works": [
            {"name": "Монтаж стеклянных козырьков на тягах с устройством метал. каркаса", "unit": "м2", "price_ref": 15000}
        ],
        "materials": [
            {"name": "Козырек из триплекса в алюминиевом профиле", "unit": "м2", "type": "основн.", "price_ref": 180000}
        ]
    },
    "doors_aluminum": {
        "name": "Алюминиевые двери в составе витража",
        "trigger_keywords": ["дверь", "дверн", "створ"],
        "works": [
            {"name": "Монтаж алюминиевых дверных блоков в составе витража", "unit": "м2", "price_ref": 13150}
        ],
        "materials": [
            {"name": "Профиль дверной АЛМО (по проекту)", "unit": "м2", "type": "основн.", "price_range": "19634-69634"}
        ]
    },
    "vent_grilles": {
        "name": "Фасадные вентрешетки",
        "trigger_keywords": ["вентрешетк", "ламел", "решетк.*фасад"],
        "works": [
            {"name": "Установка заполнений витражей: Решетка", "unit": "м2", "price_ref": 6050}
        ],
        "materials": [
            {"name": "Вентиляционная решетка (по проекту)", "unit": "м2", "type": "основн.", "price_ref": 7210}
        ]
    }
}

# === Маппинг позиция → набор шаблонов (из реального ВОР) ===
POSITION_MAP = {
    "10.1.1.1 Витражная стоечно-ригельная система 1-го этажа": [
        "spk_profile", "spk_glass", "spk_broneplenka", "scaffolding", "kmd_spk"
    ],
    "10.1.1.2 Окна из алюминиевого профиля": [
        "spk_profile", "spk_glass", "spk_broneplenka", "scaffolding", "kmd_spk"
    ],
    "10.1.1.3 Витражная система, стемалит (глухие вставки)": [
        "spk_profile", "spk_glass", "spk_broneplenka", "scaffolding", "kmd_spk", "insulation"
    ],
    "10.1.2.1 Наружные откосы": [
        "flashings"
    ],
    "10.1.2.2 Отливы окон": [
        "flashings"
    ],
    "10.1.3.1 Вентрешетка из алюминиевых ламелей": [
        "spk_profile", "vent_grilles", "scaffolding"
    ],
    "10.1.3.2 Алюминиевые ламели в нишах": [
        "nvf_subsystem", "vent_grilles", "scaffolding"
    ],
    "10.1.3.3 Перфорированные алюминиевые кассеты": [
        "nvf_subsystem", "nvf_cladding_cassette", "scaffolding", "kmd_nvf"
    ],
    "10.2.X Фасадные двери (витражные)": [
        "spk_profile", "doors_aluminum", "spk_glass", "spk_broneplenka"
    ],
    "10.3.1.1 Фасадный утеплитель минплита 170мм": [
        "insulation"
    ],
    "10.3.1.2 Фасад клинкер на подсистеме НВФ": [
        "nvf_subsystem", "nvf_cladding_clinker", "scaffolding", "kmd_nvf"
    ],
    "10.3.1.3 Фасад сэндвич-панель с алюм. листом": [
        "nvf_subsystem", "nvf_cladding_cassette", "scaffolding", "kmd_nvf", "insulation"
    ],
    "10.3.2.1 Отлив парапета кровли": [
        "flashings"
    ],
    "10.3.2.2 Ограждение парапета стеклянное": [
        "glass_railing"
    ],
    "10.3.2.3 Козырек из триплекса": [
        "glass_canopy", "nvf_subsystem", "nvf_cladding_cassette", "scaffolding", "kmd_nvf"
    ]
}


def print_report():
    print("=" * 80)
    print("КАРТА ШАБЛОНОВ: ПОЗИЦИЯ ВОР → НАБОР ШАБЛОНОВ")
    print("=" * 80)
    print()

    total_works = 0
    total_mats = 0

    for pos_name, tpl_ids in POSITION_MAP.items():
        w = sum(len(TEMPLATES[t]["works"]) for t in tpl_ids)
        m = sum(len(TEMPLATES[t]["materials"]) for t in tpl_ids)
        total_works += w
        total_mats += m
        print(f"  {pos_name}")
        for t in tpl_ids:
            tmpl = TEMPLATES[t]
            wc = len(tmpl["works"])
            mc = len(tmpl["materials"])
            print(f"    + {tmpl['name']:50s} ({wc} раб, {mc} мат)")
        print(f"    ИТОГО: {w} строк работ, {m} строк материалов")
        print()

    print("=" * 80)
    print(f"Всего шаблонов: {len(TEMPLATES)}")
    print(f"Позиций в ВОР:  {len(POSITION_MAP)}")
    print(f"Суммарно строк: {total_works} работ + {total_mats} материалов")
    print("=" * 80)


if __name__ == "__main__":
    print_report()

"""Domain-specific norms for VOR pricing validation.

Provides benchmark ranges, work/material ratios, required component
checklists, and work vs material classification per construction domain.
"""
from __future__ import annotations

# Work / Material classification keywords (from rule_pricer.py)
_WORK_KEYWORDS = [
    'монтаж', 'демонтаж', 'укладк', 'работ', 'вибрирован', 'армирован',
    'заглажив', 'подача', 'пусконаладк', 'сварк', 'резк', 'нанесен',
    'окраск', 'окрас', 'оклейк', 'инъектирован', 'испытан', 'регистрац',
    'планировк', 'укатк', 'посев', 'посадочн', 'уплотнен', 'сверлен',
    'снятие', 'герметизац', 'изоляц',
    'вывоз', 'транспорт', 'перевозк', 'перебазировк',
    'охран', 'уборк', 'содержан', 'сопровожден', 'обслужив',
    'срубк', 'распушовк', 'разработк', 'засыпк',
    'полив', 'подъём', 'подъем', 'доставк',
]

_MECH_KEYWORDS = [
    'кран', 'вибратор', 'виброрейк', 'бетононасос', 'подъёмник', 'подъемник',
    'экскаватор', 'бульдозер', 'компрессор', 'молот', 'маш-ч',
    'гидромолот', 'вибропогруж',
]

_MATERIAL_EXCEPTIONS = [
    'теплоизоляц', 'звукоизоляц', 'гидроизоляц', 'пароизоляц',
]


def is_work_item(name: str, unit: str) -> bool:
    """Classify whether a line item is work/labor (vs material)."""
    nl = name.lower()
    ul = unit.lower() if unit else ''
    if any(kw in nl for kw in _MATERIAL_EXCEPTIONS):
        if not any(nl.startswith(prefix) for prefix in ['работа', 'монтаж', 'устройство']):
            return False
    if any(kw in nl for kw in _MECH_KEYWORDS) or 'маш-ч' in ul:
        return True
    return any(kw in nl for kw in _WORK_KEYWORDS)


# Benchmark ranges per template_id
_BENCHMARKS: dict[str, tuple[float, float]] = {
    # Concrete (section 7)
    "concrete_slab": (28_000, 45_000),
    "concrete_walls": (25_000, 48_000),
    "concrete_columns": (35_000, 68_000),
    "concrete_foundation": (18_000, 38_000),
    "concrete_beams": (30_000, 62_000),
    "concrete_stairs": (45_000, 90_000),
    "concrete_prep": (6_000, 14_000),
    "concrete_pile_cap": (22_000, 45_000),
    "concrete_retaining_wall": (25_000, 50_000),
    "concrete_pool": (35_000, 70_000),
    "concrete_monolith": (20_000, 50_000),
    "concrete_inner_walls": (25_000, 48_000),
    # Masonry (section 9)
    "masonry_block_wall": (8_000, 16_000),
    "masonry_block_part": (800, 2_500),
    "masonry_brick_part": (1_500, 4_000),
    "masonry_glass_part": (8_000, 18_000),
    "masonry_ventshaft": (8_000, 18_000),
    # Facade (section 11)
    "facade_nvf": (4_000, 8_000),
    "facade_plaster": (1_500, 4_000),
    "facade_cladding": (3_000, 7_000),
    "facade_insulation": (800, 2_500),
    # Roofing (section 10)
    "roof_flat": (1_500, 4_000),
    "roof_pitched": (2_000, 5_000),
    "roof_waterproof": (500, 2_000),
    "roof_insulation": (600, 2_000),
    # Finishing (section 12)
    "finish_plaster": (400, 1_500),
    "finish_putty": (200, 800),
    "finish_paint": (150, 600),
    "finish_tile": (2_000, 5_000),
    "finish_floor_screed": (500, 1_800),
    # HVAC (section 14.1)
    "hvac_heating": (3_000, 8_000),
    "hvac_ventilation": (2_000, 6_000),
    "hvac_water_supply": (2_000, 5_000),
    # Electrical (section 14.2)
    "electrical_main": (1_500, 5_000),
    "electrical_lighting": (800, 3_000),
    # Earthworks (sections 2-4)
    "earth_excavation": (200, 1_500),
    "earth_backfill": (100, 800),
    "earth_piling": (2_000, 8_000),
}


def get_benchmark(template_id: str) -> tuple[float, float] | None:
    """Return (lo, hi) benchmark for a template, or None if unknown."""
    return _BENCHMARKS.get(template_id)


# Work / Material ratio norms per domain
_WORK_RATIOS: dict[str, tuple[float, float]] = {
    "concrete": (0.20, 0.30),
    "masonry": (0.25, 0.35),
    "facade": (0.25, 0.40),
    "roofing": (0.30, 0.45),
    "finishing": (0.35, 0.50),
    "hvac": (0.30, 0.45),
    "electrical": (0.35, 0.50),
    "earthworks": (0.40, 0.60),
}

_DEFAULT_WORK_RATIO = (0.10, 0.50)


def get_work_material_ratio(domain: str) -> tuple[float, float]:
    """Return (work_ratio_lo, work_ratio_hi) for a domain."""
    return _WORK_RATIOS.get(domain.lower(), _DEFAULT_WORK_RATIO)


# Required components per domain + template
_REQUIRED_COMPONENTS: dict[str, dict[str, list[str]]] = {
    "concrete": {
        "concrete_slab": ["бетон", "арматур", "опалубк", "укладк"],
        "concrete_walls": ["бетон", "арматур", "опалубк", "укладк"],
        "concrete_columns": ["бетон", "арматур", "опалубк", "укладк"],
        "concrete_foundation": ["бетон", "арматур", "укладк"],
        "concrete_stairs": ["бетон", "арматур", "опалубк"],
        "concrete_beams": ["бетон", "арматур", "опалубк", "укладк"],
        "concrete_prep": ["бетон", "укладк"],
        "_default": ["бетон", "арматур", "опалубк"],
    },
    "masonry": {
        "masonry_block_wall": ["блок|газобетон", "клей|раствор", "кладк"],
        "masonry_block_part": ["блок|газобетон", "клей|раствор", "кладк"],
        "masonry_brick_part": ["кирпич", "раствор", "кладк"],
        "masonry_glass_part": ["стекл|панел", "профил|каркас", "монтаж"],
        "_default": ["блок|кирпич|газобетон", "клей|раствор", "кладк|монтаж"],
    },
    "facade": {
        "facade_nvf": ["утеплител|теплоизол", "подсистем|каркас|профил", "облицовк|плит|панел", "монтаж"],
        "facade_plaster": ["утеплител|теплоизол", "штукатурк|шпаклёвк", "сетк|армир", "нанесен|монтаж"],
        "_default": ["утеплител|теплоизол", "монтаж|устройств"],
    },
    "roofing": {
        "roof_flat": ["гидроизоляц|мембран", "утеплител|теплоизол", "устройств|монтаж"],
        "roof_pitched": ["кровельн|черепиц|профлист", "обрешётк|обрешетк", "монтаж"],
        "_default": ["гидроизоляц|мембран", "монтаж|устройств"],
    },
    "finishing": {
        "finish_plaster": ["штукатурк|смесь", "нанесен|работ"],
        "finish_tile": ["плитк|керамогранит", "клей", "укладк|облицовк"],
        "_default": ["материал", "работ|монтаж|нанесен"],
    },
    "hvac": {
        "_default": ["труб|трубопровод|воздуховод", "монтаж|прокладк"],
    },
    "electrical": {
        "_default": ["кабел|провод", "монтаж|прокладк"],
    },
    "earthworks": {
        "_default": ["разработк|выемк|засыпк"],
    },
}


# Public registry — used by validation to check domain existence
DOMAIN_NORMS: dict[str, dict] = {
    domain: {
        "work_ratio": _WORK_RATIOS.get(domain, _DEFAULT_WORK_RATIO),
        "required_components": _REQUIRED_COMPONENTS.get(domain, {}),
    }
    for domain in ["concrete", "masonry", "facade", "roofing",
                   "finishing", "hvac", "electrical", "earthworks"]
}


def get_required_components(domain: str, template_id: str) -> list[str]:
    """Return list of required component keywords for a domain+template.

    Each element is a string like "блок|газобетон" meaning at least one
    of the alternatives must appear in the composition item names.
    """
    domain_components = _REQUIRED_COMPONENTS.get(domain.lower(), {})
    components = domain_components.get(template_id)
    if components is None:
        components = domain_components.get("_default", [])
    return components


def component_present(keyword_pattern: str, item_names: list[str]) -> bool:
    """Check if at least one item name matches the keyword pattern.

    Pattern can contain | for alternatives: "блок|газобетон" matches
    if any item name contains "блок" OR "газобетон".
    """
    alternatives = keyword_pattern.split("|")
    combined = " ".join(item_names).lower()
    return any(alt in combined for alt in alternatives)

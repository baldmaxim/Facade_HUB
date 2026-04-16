"""Model Analyzer — extracts intelligence from Revit model data.

This module bridges the gap between raw Revit model data (from the Model
Passport and live bridge queries) and the reasoning engine.  It does NOT
use an LLM; instead it applies deterministic domain rules that a senior
construction estimator would know.

Responsibilities
----------------
1. Parse wall type names to detect multi-layer structures.
2. Decompose compound walls/floors into individual VOR-relevant layers.
3. Detect implicit work items (scaffolding, transport, temporary structures).
4. Identify parameter-driven requirements (fire resistance, waterproofing).
5. Detect below-grade vs above-grade conditions from level data.
6. Calculate opening deductions from window/door counts and sizes.
7. Provide model summaries grouped by VOR section relevance.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from vor.models import (
    ElementDecomposition,
    Finding,
    FindingCategory,
    FindingSeverity,
    VorItem,
    WallLayer,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants: material detection patterns
# ---------------------------------------------------------------------------

# Russian material keywords mapped to GESN collection hints.
_MATERIAL_GESN_MAP: dict[str, dict[str, str]] = {
    "газобетон":       {"collection": "08", "function": "structure", "param": "Volume"},
    "газосиликат":     {"collection": "08", "function": "structure", "param": "Volume"},
    "пенобетон":       {"collection": "08", "function": "structure", "param": "Volume"},
    "кирпич":          {"collection": "08", "function": "structure", "param": "Volume"},
    "керамзитобетон":  {"collection": "08", "function": "structure", "param": "Volume"},
    "пазогребнев":     {"collection": "08", "function": "structure", "param": "Area"},
    "гипсокартон":     {"collection": "15", "function": "finish", "param": "Area"},
    "штукатурк":       {"collection": "15", "function": "finish", "param": "Area"},
    "утеплител":       {"collection": "26", "function": "insulation", "param": "Area"},
    "минват":          {"collection": "26", "function": "insulation", "param": "Area"},
    "минеральн":       {"collection": "26", "function": "insulation", "param": "Area"},
    "пенополистирол":  {"collection": "26", "function": "insulation", "param": "Area"},
    "пенопласт":       {"collection": "26", "function": "insulation", "param": "Area"},
    "экструзионн":     {"collection": "26", "function": "insulation", "param": "Area"},
    "rockwool":        {"collection": "26", "function": "insulation", "param": "Area"},
    "isover":          {"collection": "26", "function": "insulation", "param": "Area"},
    "бетон":           {"collection": "06", "function": "structure", "param": "Volume"},
    "железобетон":     {"collection": "06", "function": "structure", "param": "Volume"},
    "монолит":         {"collection": "06", "function": "structure", "param": "Volume"},
}

# Thickness extraction regex: "400мм", "400 мм", "150мм", "0.4м"
_THICKNESS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(мм|mm)")
_THICKNESS_M_RE = re.compile(r"(\d+(?:\.\d+)?)\s*м(?!м)")  # meters, not mm

# Wall type name delimiters indicating multi-layer: "+", "/", " и "
_LAYER_DELIMITERS = re.compile(r"[+/]|\sи\s")

# Fire resistance patterns
_FIRE_RESISTANCE_RE = re.compile(r"REI\s*(\d+)|EI\s*(\d+)|огнестойк", re.IGNORECASE)

# Scaffolding threshold: wall height above which scaffolding is needed (meters)
_SCAFFOLDING_HEIGHT_M = 4.0

# Opening deduction threshold per GESN rules: openings > 3 m2 are deducted
_OPENING_DEDUCTION_THRESHOLD_M2 = 3.0

# Standard rebar ratios (kg per m3 of concrete) by structure type
_REBAR_RATIOS: dict[str, tuple[float, float]] = {
    "foundation": (80.0, 120.0),
    "slab": (100.0, 150.0),
    "column": (150.0, 250.0),
    "beam": (120.0, 180.0),
    "wall": (60.0, 100.0),
}

# Standard waste coefficients by material type (fraction, e.g., 0.03 = 3%)
_WASTE_COEFFICIENTS: dict[str, float] = {
    "кирпич": 0.03,
    "газобетон": 0.03,
    "газосиликат": 0.03,
    "бетон": 0.015,
    "раствор": 0.02,
    "штукатурк": 0.05,
    "утеплител": 0.03,
    "минват": 0.03,
    "гипсокартон": 0.05,
    "плитк": 0.05,
    "линолеум": 0.02,
    "ламинат": 0.03,
    "металл": 0.015,
    "арматур": 0.01,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@dataclass
class ModelSummary:
    """Summary of model data relevant to VOR processing."""
    total_elements: int = 0
    wall_types: list[dict] = field(default_factory=list)
    floor_types: list[dict] = field(default_factory=list)
    roof_types: list[dict] = field(default_factory=list)
    levels: list[dict] = field(default_factory=list)
    ground_level_idx: int = -1       # Index of ground level (0.000)
    below_grade_levels: list[str] = field(default_factory=list)
    above_grade_levels: list[str] = field(default_factory=list)
    window_count: int = 0
    door_count: int = 0
    estimated_opening_area_m2: float = 0.0
    categories_summary: dict[str, int] = field(default_factory=dict)
    has_mep: bool = False
    building_height_m: float = 0.0
    facade_area_m2: float = 0.0


def analyze_model_passport(passport_data: dict[str, Any]) -> ModelSummary:
    """Extract a structured ModelSummary from raw model passport data.

    This provides the reasoning engine with pre-digested model intelligence
    without requiring additional Revit queries.
    """
    summary = ModelSummary()

    # Categories
    cats = passport_data.get("categories", [])
    for cat in cats:
        name = cat.get("name", cat.get("name_ru", ""))
        count = cat.get("count", 0)
        summary.categories_summary[name] = count
        summary.total_elements += count

        name_lower = name.lower()
        if "окн" in name_lower or "window" in name_lower:
            summary.window_count = count
        elif "двер" in name_lower or "door" in name_lower:
            summary.door_count = count
        elif any(kw in name_lower for kw in ("труб", "pipe", "воздуховод", "duct", "кабел", "cable")):
            summary.has_mep = True

    # Levels
    levels = passport_data.get("levels", [])
    for i, lv in enumerate(levels):
        elev = lv.get("elevation_m", 0.0)
        name = lv.get("name", "")
        summary.levels.append({"name": name, "elevation_m": elev})
        if abs(elev) < 0.01:
            summary.ground_level_idx = i
        if elev < -0.1:
            summary.below_grade_levels.append(name)
        else:
            summary.above_grade_levels.append(name)

    # Building height from bounding box
    detailed = passport_data.get("detailed", {})
    bbox = detailed.get("bounding_box", {})
    if bbox:
        summary.building_height_m = bbox.get("height_m", 0.0)

    # Wall types from family_types
    family_types = detailed.get("family_types", {})
    for cat_name, families in family_types.items():
        cat_lower = cat_name.lower()
        for fam in families:
            for t in fam.get("types", []):
                entry = {
                    "family": fam.get("family_name", ""),
                    "type_name": t.get("name", ""),
                    "count": t.get("count", 0),
                }
                if "стен" in cat_lower or "wall" in cat_lower:
                    summary.wall_types.append(entry)
                elif "перекрыт" in cat_lower or "пол" in cat_lower or "floor" in cat_lower:
                    summary.floor_types.append(entry)
                elif "кровл" in cat_lower or "крыш" in cat_lower or "roof" in cat_lower:
                    summary.roof_types.append(entry)

    return summary


def detect_multi_layer_walls(
    wall_types: list[dict],
) -> list[ElementDecomposition]:
    """Analyze wall type names to detect and decompose multi-layer structures.

    A wall type named "НС-400 (газобетон D500 400мм + утеплитель 150мм)"
    is decomposed into two layers: masonry and insulation.

    Returns one ElementDecomposition per wall type that has multiple materials.
    Single-material walls are not returned (they need no decomposition).
    """
    decompositions: list[ElementDecomposition] = []

    for wt in wall_types:
        type_name = wt.get("type_name", "")
        count = wt.get("count", 0)
        if not type_name:
            continue

        layers = _parse_wall_layers(type_name)
        if len(layers) > 1:
            decompositions.append(
                ElementDecomposition(
                    source_type_name=type_name,
                    source_category="OST_Walls",
                    instance_count=count,
                    layers=layers,
                )
            )

    return decompositions


def detect_implicit_work(
    model_summary: ModelSummary,
    vor_items: list[VorItem],
) -> list[Finding]:
    """Detect work items that should be in the VOR but are not explicitly listed.

    An experienced estimator would know these are needed even if nobody wrote
    them down.  The function checks for:

    1. Scaffolding — if building height > 4m and no scaffolding line in VOR
    2. Rebar — if concrete positions exist but no rebar line
    3. Transportation — for heavy materials (concrete, steel)
    4. Temporary structures — for large projects
    5. Waterproofing — for below-grade walls/foundations

    Returns a list of Finding objects describing each gap.
    """
    findings: list[Finding] = []
    vor_text_lower = " ".join(item.name.lower() for item in vor_items)

    # 1. Scaffolding
    if model_summary.building_height_m > _SCAFFOLDING_HEIGHT_M:
        has_scaffolding = any(
            kw in vor_text_lower
            for kw in (
                "леса", "лесов", "лесами", "лесах",
                "подмости", "подмостки", "подмостей",
                "лес строит",
                "scaffold",
            )
        )
        if not has_scaffolding:
            findings.append(Finding(
                category=FindingCategory.IMPLICIT_WORK,
                severity=FindingSeverity.WARNING,
                title="Отсутствуют строительные леса/подмости",
                description=(
                    f"Высота здания {model_summary.building_height_m:.1f} м превышает "
                    f"порог {_SCAFFOLDING_HEIGHT_M} м.  Для фасадных и отделочных работ "
                    "необходимы строительные леса или подмости.  "
                    "Рекомендуется добавить позицию по сборнику ГЭСН 08."
                ),
                suggested_action="Добавить позицию: установка и разборка строительных лесов",
                suggested_gesn="08-07-001-01",
                suggested_quantity=model_summary.facade_area_m2 if model_summary.facade_area_m2 > 0 else 0.0,
                suggested_unit="м2",
            ))

    # 2. Rebar for concrete positions
    has_concrete_item = any(
        kw in vor_text_lower
        for kw in ("бетонирован", "монолит", "бетон ", "ж/б", "железобетон")
    )
    has_rebar_item = any(
        kw in vor_text_lower
        for kw in ("арматур", "армирован", "каркас арм")
    )
    if has_concrete_item and not has_rebar_item:
        findings.append(Finding(
            category=FindingCategory.MISSING_ITEM,
            severity=FindingSeverity.ERROR,
            title="Отсутствует армирование для бетонных конструкций",
            description=(
                "В ВОР есть позиции бетонирования, но нет позиций по арматурным работам.  "
                "Типичный расход арматуры: 80-250 кг/м3 бетона в зависимости от конструкции.  "
                "Рекомендуется добавить позицию из ГЭСН сборника 06 или 09."
            ),
            suggested_action="Добавить позицию: установка арматуры",
            suggested_gesn="06-01-034-01",
            suggested_unit="т",
        ))

    # 3. Reinforcement mesh for masonry walls (every 2-3 rows)
    has_masonry = any(
        kw in vor_text_lower
        for kw in ("кладка", "газобетон", "кирпич", "блоков")
    )
    has_mesh = any(
        kw in vor_text_lower
        for kw in ("армирование кладки", "сетка кладоч", "кладочная сетка")
    )
    if has_masonry and not has_mesh:
        findings.append(Finding(
            category=FindingCategory.IMPLICIT_WORK,
            severity=FindingSeverity.WARNING,
            title="Армирование кладки не указано",
            description=(
                "В ВОР есть каменная кладка, но отсутствует позиция армирования "
                "кладочной сеткой (укладывается каждые 2-3 ряда по СП 15.13330).  "
                "Рекомендуется добавить отдельную позицию."
            ),
            suggested_action="Добавить позицию: укладка арматурных сеток в кладку",
            suggested_gesn="08-02-009-01",
            suggested_unit="м2",
        ))

    # 4. Below-grade waterproofing
    if model_summary.below_grade_levels:
        has_waterproof = any(
            kw in vor_text_lower
            for kw in ("гидроизоляц", "waterproof", "обмазоч", "оклеечн")
        )
        if not has_waterproof:
            findings.append(Finding(
                category=FindingCategory.LEVEL_SPECIFIC,
                severity=FindingSeverity.WARNING,
                title="Отсутствует гидроизоляция подземной части",
                description=(
                    f"Модель содержит подземные уровни: "
                    f"{', '.join(model_summary.below_grade_levels)}.  "
                    "Для стен и фундаментов ниже уровня земли требуется "
                    "гидроизоляция (обмазочная или оклеечная)."
                ),
                suggested_action="Добавить позицию: устройство гидроизоляции",
                suggested_gesn="12-01-017-01",
                suggested_unit="м2",
            ))

    # 5. Transportation for heavy materials
    has_transport = any(
        kw in vor_text_lower
        for kw in ("транспортир", "перевозк", "доставк")
    )
    if not has_transport and model_summary.total_elements > 500:
        findings.append(Finding(
            category=FindingCategory.IMPLICIT_WORK,
            severity=FindingSeverity.INFO,
            title="Транспортные расходы не учтены",
            description=(
                "В ВОР нет позиций по транспортировке материалов.  "
                "Для крупных материалов (бетон, арматура, кирпич) "
                "транспортные расходы могут составлять 3-5% от стоимости."
            ),
            suggested_action="Рассмотреть добавление транспортных позиций",
        ))

    return findings


def detect_unit_mismatches(
    items: list[VorItem],
    matches: list[dict],
) -> list[Finding]:
    """Detect cases where VOR unit and GESN unit are incompatible.

    For example, VOR says "м2" but the matched GESN norm measures "м3".
    This is a common error that leads to incorrect pricing.
    """
    findings: list[Finding] = []

    # Normalize unit for comparison
    def _norm(u: str) -> str:
        return u.strip().lower().replace(" ", "").replace(".", "")

    _EQUIVALENT_GROUPS = [
        {"м2", "м²", "кв.м", "квм"},
        {"м3", "м³", "куб.м", "кубм"},
        {"м", "мп", "погм", "пог.м"},
        {"шт", "штук", "штука"},
        {"т", "тонн", "тонна"},
    ]

    def _same_base(a: str, b: str) -> bool:
        na, nb = _norm(a), _norm(b)
        if na == nb:
            return True
        for group in _EQUIVALENT_GROUPS:
            if na in group and nb in group:
                return True
        return False

    for match_info in matches:
        idx = match_info.get("item_idx", -1)
        if idx < 0 or idx >= len(items):
            continue
        item = items[idx]
        gesn_unit = match_info.get("gesn_unit", "")
        if not item.unit or not gesn_unit:
            continue

        # Check if units are fundamentally different (not just scale)
        item_base = _norm(item.unit).lstrip("0123456789 ")
        gesn_base = _norm(gesn_unit).lstrip("0123456789 ")

        if not _same_base(item_base, gesn_base):
            findings.append(Finding(
                category=FindingCategory.UNIT_MISMATCH,
                severity=FindingSeverity.WARNING,
                title=f"Несовпадение единиц: ВОР «{item.unit}» vs ГЭСН «{gesn_unit}»",
                description=(
                    f"Позиция #{idx + 1} «{item.name}» измеряется в «{item.unit}», "
                    f"но подобранная расценка ГЭСН использует «{gesn_unit}».  "
                    "Необходимо пересчитать объём или подобрать другую расценку."
                ),
                affected_items=[idx],
                suggested_action="Проверить единицу измерения и при необходимости пересчитать объём",
            ))

    return findings


def get_waste_coefficient(material_keyword: str) -> float:
    """Return the standard waste coefficient for a material.

    Returns 0.0 if no specific coefficient is known.
    """
    material_lower = material_keyword.lower()
    for kw, coeff in _WASTE_COEFFICIENTS.items():
        if kw in material_lower:
            return coeff
    return 0.0


def estimate_opening_deduction(
    window_count: int,
    door_count: int,
    avg_window_area_m2: float = 2.0,
    avg_door_area_m2: float = 2.1,
) -> float:
    """Estimate total area to deduct for openings.

    Per GESN rules, only openings > 3 m2 are deducted from wall area.
    Standard window ~2 m2 (not deducted), standard door ~2.1 m2 (not deducted).
    Large windows and balcony doors (> 3 m2) should be deducted.

    Returns the estimated deduction in m2.
    """
    total_deduction = 0.0

    # Assume ~20% of windows are large (> 3 m2)
    large_window_fraction = 0.2
    large_window_area = 4.0  # average large window
    large_windows = int(window_count * large_window_fraction)
    total_deduction += large_windows * large_window_area

    # Assume balcony doors ~ 3.2 m2 each, ~10% of door count
    balcony_doors = int(door_count * 0.1)
    total_deduction += balcony_doors * 3.2

    return total_deduction


def classify_vor_section(section_name: str) -> str:
    """Map a VOR section name to a GESN collection hint.

    This helps the LLM reasoning by narrowing the search space.
    """
    s = section_name.lower()
    mapping = [
        (["земл", "котлован", "разработ", "грунт"], "01"),
        (["свай", "шпунт"], "05"),
        (["фундамент", "монолит", "бетон", "ж/б", "железобетон"], "06"),
        (["кладк", "стен", "перегород", "газобетон", "кирпич", "блок"], "08"),
        (["металл", "сталь", "каркас металл"], "09"),
        (["деревян", "сруб"], "10"),
        (["пол", "стяжк", "напольн"], "11"),
        (["кровл", "крыш", "крове"], "12"),
        (["огражда", "защит", "антикорр"], "13"),
        (["отдел", "штукатур", "облицов", "покраск", "обо", "малярн"], "15"),
        (["водопровод", "канализ", "сантехн"], "16-17"),
        (["отопл", "вентиляц", "кондиц"], "18-20"),
        (["электр", "освещ", "кабел", "проводк"], "21"),
    ]
    for keywords, collection in mapping:
        if any(kw in s for kw in keywords):
            return collection
    return ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _parse_wall_layers(type_name: str) -> list[WallLayer]:
    """Parse a Revit wall type name into individual layers.

    Examples:
    - "НС-400 (газобетон D500 400мм + утеплитель 150мм)" -> 2 layers
    - "НС-200 (газобетон D500 200мм)" -> 1 layer
    - "Кирпич 250 + утеплитель 100 + облицовка 120" -> 3 layers
    """
    layers: list[WallLayer] = []

    # Try splitting by delimiters
    parts = _LAYER_DELIMITERS.split(type_name)
    if len(parts) <= 1:
        # No delimiter found; try to detect a single material
        layer = _identify_layer(type_name)
        if layer:
            layers.append(layer)
        return layers

    for part in parts:
        part = part.strip()
        if not part:
            continue
        layer = _identify_layer(part)
        if layer:
            layers.append(layer)

    return layers


def _identify_layer(text: str) -> Optional[WallLayer]:
    """Try to identify material and thickness from a text fragment."""
    text_lower = text.lower()

    # Find material
    material = ""
    mat_info: dict[str, str] = {}
    for keyword, info in _MATERIAL_GESN_MAP.items():
        if keyword in text_lower:
            material = keyword
            mat_info = info
            break

    if not material:
        return None

    # Find thickness
    thickness_mm = 0.0
    m = _THICKNESS_RE.search(text)
    if m:
        thickness_mm = float(m.group(1))
    else:
        m = _THICKNESS_M_RE.search(text)
        if m:
            thickness_mm = float(m.group(1)) * 1000

    return WallLayer(
        material=material,
        thickness_mm=thickness_mm,
        function=mat_info.get("function", "structure"),
        gesn_collection=mat_info.get("collection", ""),
        quantity_parameter=mat_info.get("param", "Volume"),
    )

"""Quantity planner — maps GESN collection codes to Revit extraction strategies.

Given a list of matched GESN codes, determines which Revit categories and
parameters to query for each item.  This is a deterministic mapper (no LLM).

The collection code is the first two digits of the GESN code (e.g. ``08`` in
``08-02-001-01`` means collection 08 — masonry works).
"""

from __future__ import annotations

import re

from vor.models import GesnMatch, QuantityPlan, VorItem

# ---------------------------------------------------------------------------
# GESN collection → Revit extraction strategy
# ---------------------------------------------------------------------------

COLLECTION_MAP: dict[str, dict[str, str]] = {
    "01": {"category": "manual", "notes": "Земляные работы — объёмы из модели фундаментов"},
    "06": {"category": "OST_StructuralFoundation,OST_Floors,OST_StructuralColumns", "parameter": "Volume"},
    "07": {"category": "OST_StructuralFoundation,OST_StructuralColumns,OST_StructuralFraming", "parameter": "Volume"},
    "08": {"category": "OST_Walls", "parameter": "Volume", "notes": "Кладка"},
    "09": {"category": "OST_StructuralFraming,OST_StructuralColumns", "parameter": "Weight"},
    "10": {"category": "OST_Walls,OST_Roofs", "parameter": "Volume", "notes": "Деревянные"},
    "11": {"category": "OST_Floors", "parameter": "Area", "notes": "Полы"},
    "12": {"category": "OST_Roofs", "parameter": "Area", "notes": "Кровля"},
    "15": {"category": "OST_Walls,OST_Ceilings,OST_Floors", "parameter": "Area", "notes": "Отделка"},
    # MEP collections
    "16": {"category": "OST_PipeCurves", "parameter": "Length"},
    "17": {"category": "OST_PipeCurves,OST_PlumbingFixtures", "parameter": "Length"},
    "18": {"category": "OST_DuctCurves,OST_MechanicalEquipment", "parameter": "Length"},
    "19": {"category": "OST_CableTray,OST_Conduit,OST_ElectricalEquipment", "parameter": "Length"},
    "20": {"category": "OST_DuctCurves", "parameter": "Length", "notes": "Вентиляция"},
}

# ---------------------------------------------------------------------------
# Unit conversion factors — Revit internal → metric
# ---------------------------------------------------------------------------

_PARAMETER_CONVERSIONS: dict[str, float] = {
    "Volume": 0.0283168,   # cubic feet → m³
    "Area": 0.092903,      # square feet → m²
    "Length": 0.3048,       # feet → m
    "Weight": 1.0,         # already kg in Revit
}

# ---------------------------------------------------------------------------
# VOR unit → additional multiplier (for "100 м²" style units)
# ---------------------------------------------------------------------------

_UNIT_MULTIPLIERS: dict[str, float] = {
    "100 м2": 0.01,
    "100 м²": 0.01,
    "1000 м2": 0.001,
    "1000 м²": 0.001,
    "100 м3": 0.01,
    "100 м³": 0.01,
    "1000 м3": 0.001,
    "1000 м³": 0.001,
    "10 м3": 0.1,
    "10 м³": 0.1,
    "100 шт": 0.01,
    "10 шт": 0.1,
    "100 м": 0.01,
    "10 м": 0.1,
}

# ---------------------------------------------------------------------------
# Filter hint keywords — Russian material names to look for in item names
# ---------------------------------------------------------------------------

_MATERIAL_KEYWORDS: list[str] = [
    "газобетон",
    "газосиликат",
    "пенобетон",
    "кирпич",
    "керамзитобетон",
    "бетон",
    "железобетон",
    "монолит",
    "дерев",
    "металл",
    "сталь",
    "гипсокартон",
    "штукатур",
    "плитк",
    "линолеум",
    "ламинат",
    "паркет",
    "керамогранит",
    "утеплител",
    "минват",
    "пенополистирол",
]

# Regex for thickness patterns like "400мм", "400 мм", "200мм"
_THICKNESS_RE = re.compile(r"(\d+)\s*мм")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def plan_quantities(
    matches: list[GesnMatch],
    items: list[VorItem],
) -> list[QuantityPlan]:
    """Create extraction plans based on GESN collection codes.

    For each ``GesnMatch``:
    1. Extract collection code from ``gesn_code`` (first 2 digits).
    2. Look up in ``COLLECTION_MAP``.
    3. Create ``QuantityPlan`` with category, parameter, filter hints.
    4. Items with no mapping get ``source="manual"``.

    Parameters
    ----------
    matches:
        GESN matches produced by the matcher.
    items:
        Original VOR items (used to extract filter keywords from names).

    Returns
    -------
    list[QuantityPlan]
        One plan per match, in the same order.
    """
    plans: list[QuantityPlan] = []

    for match in matches:
        item_idx = match.item_idx
        item = items[item_idx] if item_idx < len(items) else None
        item_name = item.name if item else ""
        item_unit = item.unit if item else ""

        collection = _extract_collection(match.gesn_code)
        mapping = COLLECTION_MAP.get(collection) if collection else None

        if mapping is None or mapping.get("category") == "manual":
            # No Revit mapping — manual input required.
            notes = ""
            if mapping and mapping.get("notes"):
                notes = mapping["notes"]
            elif not match.gesn_code:
                notes = "No GESN code — cannot determine extraction strategy"
            else:
                notes = f"Collection {collection or '??'} not mapped to Revit categories"

            plans.append(
                QuantityPlan(
                    item_idx=item_idx,
                    source="manual",
                    category="",
                    parameter="",
                    filter_criteria={},
                    unit_conversion=1.0,
                    notes=notes,
                )
            )
            continue

        category = mapping["category"]
        parameter = mapping.get("parameter", "")
        notes = mapping.get("notes", "")

        # Determine unit conversion
        base_conversion = _PARAMETER_CONVERSIONS.get(parameter, 1.0)
        unit_multiplier = _UNIT_MULTIPLIERS.get(item_unit.strip(), 1.0)
        unit_conversion = base_conversion * unit_multiplier

        # Extract filter criteria from item name
        filter_criteria = _extract_filters(item_name)

        plans.append(
            QuantityPlan(
                item_idx=item_idx,
                source="model",
                category=category,
                parameter=parameter,
                filter_criteria=filter_criteria,
                unit_conversion=unit_conversion,
                notes=notes,
            )
        )

    return plans


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_collection(gesn_code: str) -> str | None:
    """Extract the 2-digit collection code from a GESN code.

    Example: ``"08-02-001-01"`` → ``"08"``.
    Returns ``None`` if the code is empty or malformed.
    """
    if not gesn_code:
        return None
    parts = gesn_code.split("-")
    if parts and len(parts[0]) == 2 and parts[0].isdigit():
        return parts[0]
    return None


def _extract_filters(item_name: str) -> dict:
    """Extract filter hints from a VOR item name.

    Looks for:
    - Material keywords (газобетон, кирпич, etc.)
    - Thickness patterns (400мм, 200 мм, etc.)

    Returns a dict suitable for ``QuantityPlan.filter_criteria``.
    """
    if not item_name:
        return {}

    name_lower = item_name.lower()
    criteria: dict = {}

    # Find material keywords
    materials = [kw for kw in _MATERIAL_KEYWORDS if kw in name_lower]
    if materials:
        criteria["type_name_contains"] = materials[0]

    # Find thickness
    thickness_match = _THICKNESS_RE.search(item_name)
    if thickness_match:
        criteria["thickness_mm"] = int(thickness_match.group(1))

    return criteria

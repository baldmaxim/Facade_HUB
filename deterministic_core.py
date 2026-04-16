"""Deterministic domain core for high-signal VOR domains.

This module is the first step toward a template-first pricing engine:
for domains where freeform LLM composition is too risky, we build a
repeatable composition from archetypes and curated templates.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from vor.models import (
    CompositionItem,
    CompositionType,
    ExpertDomain,
    PricedItem,
    PricedPosition,
    VorItem,
)


_WORK_KEYWORDS = (
    "монтаж",
    "демонтаж",
    "уклад",
    "кладк",
    "армирован",
    "подача",
    "заглаж",
    "уход за бетоном",
    "вязка",
    "расшивка",
)

_MACHINERY_KEYWORDS = (
    "кран",
    "вибратор",
    "виброрейка",
    "бетононасос",
    "подъём",
    "подъем",
    "автокран",
    "растворосмеситель",
    "маш-ч",
)

_UNIT_ALIASES = {
    "м2": {"м2", "мв", "квм", "кв.м", "кв м"},
    "м3": {"м3", "мг", "кубм", "куб.м", "куб м"},
    "шт": {"шт", "шт."},
    "м": {"м", "м.п", "м.п.", "п.м", "п.м."},
    "маш-ч": {"маш-ч", "маш.-ч", "машч"},
}


@dataclass(frozen=True)
class ArchetypeMatch:
    template_key: str
    confidence: float
    thickness_m: float | None = None
    density: str | None = None


@dataclass(frozen=True)
class DeterministicGuidance:
    template_key: str
    template_name: str
    template_unit: str
    confidence: float
    benchmark: tuple[float, float] | None
    expected_components: list[str]
    required_keyword_groups: list[list[str]]
    minimum_items: int
    thickness_m: float | None = None
    density: str | None = None


class DeterministicDomainCore:
    """Template-first composition builder for concrete and masonry."""

    _TEMPLATES: dict[str, dict[str, Any]] | None = None

    def __init__(self, templates_path: str | Path | None = None) -> None:
        if templates_path is None:
            templates_path = (
                Path(__file__).resolve().parent / "agent" / "composition_templates.yaml"
            )

        if self.__class__._TEMPLATES is None:
            with open(templates_path, "r", encoding="utf-8") as fh:
                self.__class__._TEMPLATES = yaml.safe_load(fh) or {}

    @property
    def templates(self) -> dict[str, dict[str, Any]]:
        return self.__class__._TEMPLATES or {}

    def build_position(
        self,
        domain: ExpertDomain,
        item: VorItem,
    ) -> PricedPosition | None:
        """Try to build a deterministic position for a high-signal domain."""
        if item.quantity is None or item.quantity <= 0:
            return None

        match = self._match_archetype(domain, item)
        if match is None:
            return None

        template = self.templates.get(match.template_key)
        if not template:
            return None

        factor = self._resolve_scale_factor(
            position_unit=item.unit,
            position_quantity=float(item.quantity),
            template_unit=str(template.get("unit", "")),
            thickness_m=match.thickness_m,
        )
        if factor is None:
            return None

        priced_items: list[PricedItem] = []
        for raw_item in template.get("items", []):
            name = str(raw_item.get("name", "")).strip()
            unit = str(raw_item.get("unit", "")).strip()
            qty = float(raw_item.get("qty", 0.0)) * factor
            price = float(raw_item.get("price", 0.0))

            name, price = self._apply_domain_adjustments(
                match=match,
                name=name,
                price=price,
            )

            composition = CompositionItem(
                type=self._infer_composition_type(name, unit),
                code="",
                name=name,
                unit=unit,
                quantity=round(qty, 6),
                quantity_formula=self._build_quantity_formula(
                    base_qty=float(raw_item.get("qty", 0.0)),
                    factor=factor,
                    position_unit=item.unit,
                    template_unit=str(template.get("unit", "")),
                    thickness_m=match.thickness_m,
                ),
            )
            priced_items.append(
                PricedItem(
                    composition=composition,
                    unit_price=price,
                    price_source=f"template:{match.template_key}",
                    price_year=2025,
                )
            )

        notes = (
            f"[det-core] archetype={match.template_key}; "
            f"scale={factor:.4f}; "
            f"template_unit={template.get('unit', '')}; "
            f"position_unit={item.unit}; "
            f"confidence={match.confidence:.2f}"
        )
        if match.thickness_m:
            notes += f"; thickness_mm={int(round(match.thickness_m * 1000))}"
        if match.density:
            notes += f"; density={match.density}"

        return PricedPosition(
            original_idx=item.row_num,
            items=priced_items,
            confidence=match.confidence,
            notes=notes,
        )

    def build_guidance(
        self,
        domain: ExpertDomain,
        item: VorItem,
    ) -> DeterministicGuidance | None:
        """Build a compact expert hint for LLM prompting and post-checks."""
        match = self._match_archetype(domain, item)
        if match is None:
            return None

        template = self.templates.get(match.template_key)
        if not template:
            return None

        benchmark = None
        bench_values = template.get("bench", [])
        if (
            isinstance(bench_values, list)
            and len(bench_values) >= 2
        ):
            benchmark = (float(bench_values[0]), float(bench_values[1]))

        component_rules = self._component_rules(match.template_key)

        return DeterministicGuidance(
            template_key=match.template_key,
            template_name=str(template.get("name", "")).strip(),
            template_unit=str(template.get("unit", "")).strip(),
            confidence=match.confidence,
            benchmark=benchmark,
            expected_components=component_rules["expected_components"],
            required_keyword_groups=component_rules["required_keyword_groups"],
            minimum_items=component_rules["minimum_items"],
            thickness_m=match.thickness_m,
            density=match.density,
        )

    def _match_archetype(
        self,
        domain: ExpertDomain,
        item: VorItem,
    ) -> ArchetypeMatch | None:
        text = self._build_text(item)

        if domain == ExpertDomain.MASONRY:
            return self._match_masonry(text)
        if domain == ExpertDomain.CONCRETE:
            return self._match_concrete(text)
        return None

    def _match_masonry(self, text: str) -> ArchetypeMatch | None:
        block_words = (
            "газобетон",
            "газосиликат",
            "агб",
            "ytong",
            "bonolit",
            "hebel",
            "aerostone",
            "блок",
        )
        brick_words = ("кирпич",)
        partition_words = ("перегород",)
        wall_words = ("стен", "межквартир", "наружн", "внутрен")
        vent_words = ("вентшахт", "вентканал", "шахт")

        thickness = self._extract_thickness_m(text)
        density = self._extract_density(text)

        if any(w in text for w in vent_words) and any(w in text for w in brick_words):
            return ArchetypeMatch("masonry_ventshaft", 0.90, thickness_m=thickness)
        if any(w in text for w in partition_words) and any(w in text for w in brick_words):
            return ArchetypeMatch(
                "masonry_brick_partition",
                0.95,
                thickness_m=thickness or 0.12,
            )
        if any(w in text for w in partition_words) and any(w in text for w in block_words):
            return ArchetypeMatch(
                "masonry_block_partition",
                0.97,
                thickness_m=thickness or 0.15,
                density=density or "D500",
            )
        if any(w in text for w in wall_words) and any(w in text for w in block_words):
            return ArchetypeMatch(
                "masonry_block_wall",
                0.93,
                thickness_m=thickness or 0.30,
                density=density or "D500",
            )
        return None

    def _match_concrete(self, text: str) -> ArchetypeMatch | None:
        concrete_words = ("монолит", "бетон", "ж/б", "железобетон")
        thickness = self._extract_thickness_m(text)

        if not any(word in text for word in concrete_words):
            return None

        if any(word in text for word in ("подготовк", "подбетонк")):
            return ArchetypeMatch(
                "concrete_prep",
                0.96,
                thickness_m=thickness or 0.10,
            )
        if any(word in text for word in ("колонн", "пилон")):
            return ArchetypeMatch("concrete_columns", 0.92, thickness_m=thickness)
        if any(word in text for word in ("стен", "диафрагм", "ядр", "шахт")):
            return ArchetypeMatch(
                "concrete_walls",
                0.90,
                thickness_m=thickness or 0.25,
            )
        if any(word in text for word in ("фундамент", "ростверк")):
            return ArchetypeMatch(
                "concrete_foundation",
                0.93,
                thickness_m=thickness,
            )
        if "плит" in text or "перекрыт" in text:
            return ArchetypeMatch(
                "concrete_slab",
                0.90,
                thickness_m=thickness or 0.20,
            )
        return None

    def _resolve_scale_factor(
        self,
        *,
        position_unit: str,
        position_quantity: float,
        template_unit: str,
        thickness_m: float | None,
    ) -> float | None:
        canonical_position_unit = self._normalize_unit(position_unit)
        canonical_template_unit = self._normalize_unit(template_unit)

        if canonical_position_unit == canonical_template_unit:
            return position_quantity

        if canonical_position_unit == "м2" and canonical_template_unit == "м3":
            if thickness_m is None or thickness_m <= 0:
                return None
            return position_quantity * thickness_m

        if canonical_position_unit == "м3" and canonical_template_unit == "м2":
            if thickness_m is None or thickness_m <= 0:
                return None
            return position_quantity / thickness_m

        return None

    def _apply_domain_adjustments(
        self,
        *,
        match: ArchetypeMatch,
        name: str,
        price: float,
    ) -> tuple[str, float]:
        if match.template_key.startswith("masonry_block_") and "D500" in name:
            density = (match.density or "D500").upper()
            density_prices = {
                "D400": 5000.0,
                "D500": 6000.0,
                "D600": 6500.0,
            }
            return name.replace("D500", density), density_prices.get(density, price)
        return name, price

    def _infer_composition_type(self, name: str, unit: str) -> CompositionType:
        text = name.lower()
        normalized_unit = self._normalize_unit(unit)

        if normalized_unit == "маш-ч" or any(word in text for word in _MACHINERY_KEYWORDS):
            return CompositionType.MACHINERY
        if normalized_unit == "чел-ч":
            return CompositionType.LABOR
        if any(word in text for word in _WORK_KEYWORDS):
            return CompositionType.WORK
        return CompositionType.MATERIAL

    def _build_quantity_formula(
        self,
        *,
        base_qty: float,
        factor: float,
        position_unit: str,
        template_unit: str,
        thickness_m: float | None,
    ) -> str:
        if thickness_m and self._normalize_unit(position_unit) != self._normalize_unit(template_unit):
            return (
                f"template {base_qty:g} × {factor:g} "
                f"(conversion {position_unit}->{template_unit}, h={thickness_m:g}м)"
            )
        return f"template {base_qty:g} × {factor:g}"

    def _extract_thickness_m(self, text: str) -> float | None:
        mm_match = re.search(r"(\d+(?:[.,]\d+)?)\s*мм", text)
        if mm_match:
            return float(mm_match.group(1).replace(",", ".")) / 1000.0

        brick_patterns = (
            (r"в\s*полкирпича|в\s*1/2\s*кирпича", 0.12),
            (r"в\s*1\s*кирпич|в\s*один\s*кирпич", 0.25),
            (r"в\s*1[.,]5\s*кирпича|в\s*полтора\s*кирпича", 0.38),
            (r"в\s*2\s*кирпича", 0.51),
        )
        for pattern, thickness in brick_patterns:
            if re.search(pattern, text):
                return thickness

        return None

    def _extract_density(self, text: str) -> str | None:
        match = re.search(r"\bd\s*([456]00)\b", text, re.IGNORECASE)
        if match:
            return f"D{match.group(1)}"
        return None

    def _build_text(self, item: VorItem) -> str:
        parts = [item.name or "", item.section or ""]
        if item.raw_data:
            notes = item.raw_data.get("notes")
            if notes:
                parts.append(str(notes))
        return " ".join(parts).lower()

    def _normalize_unit(self, unit: str) -> str:
        compact = unit.strip().lower().replace(" ", "").replace(".", "")
        compact = re.sub(r"^\d+", "", compact)
        for canonical, aliases in _UNIT_ALIASES.items():
            if compact in aliases:
                return canonical
        return compact

    def _component_rules(self, template_key: str) -> dict[str, Any]:
        """Return high-signal composition requirements for one archetype."""
        rules: dict[str, dict[str, Any]] = {
            "concrete_prep": {
                "expected_components": [
                    "бетонная подготовка или подбетонка",
                    "основной материал: бетон",
                    "укладка бетона и уплотнение",
                ],
                "required_keyword_groups": [
                    ["бетон", "подбетон"],
                ],
                "minimum_items": 3,
            },
            "concrete_columns": {
                "expected_components": [
                    "бетон колонн/пилонов",
                    "армирование (продольная + конструктивная арматура)",
                    "опалубка колонн",
                    "подача и укладка бетона",
                ],
                "required_keyword_groups": [
                    ["бетон"],
                    ["арматур"],
                    ["опалуб"],
                ],
                "minimum_items": 6,
            },
            "concrete_walls": {
                "expected_components": [
                    "бетон стен/диафрагм",
                    "армирование",
                    "щитовая опалубка",
                    "подача, укладка и вибрирование бетона",
                ],
                "required_keyword_groups": [
                    ["бетон"],
                    ["арматур"],
                    ["опалуб"],
                ],
                "minimum_items": 6,
            },
            "concrete_foundation": {
                "expected_components": [
                    "бетон фундаментной конструкции",
                    "армирование",
                    "опалубка или подготовительные работы по форме",
                    "укладка и уплотнение бетона",
                ],
                "required_keyword_groups": [
                    ["бетон"],
                    ["арматур"],
                ],
                "minimum_items": 6,
            },
            "concrete_slab": {
                "expected_components": [
                    "бетон плиты",
                    "армирование верхней/нижней зоны",
                    "опалубка перекрытия",
                    "подача, вибрирование и заглаживание",
                ],
                "required_keyword_groups": [
                    ["бетон"],
                    ["арматур"],
                    ["опалуб"],
                ],
                "minimum_items": 6,
            },
            "masonry_block_partition": {
                "expected_components": [
                    "кладка перегородок",
                    "основной материал: газобетонные блоки",
                    "клей или раствор для кладки",
                    "доборные и вспомогательные материалы без двойного учета",
                ],
                "required_keyword_groups": [
                    ["кладк"],
                    ["блок", "газобетон", "газосиликат"],
                    ["клей", "раствор"],
                ],
                "minimum_items": 4,
            },
            "masonry_brick_partition": {
                "expected_components": [
                    "кладка перегородок",
                    "основной материал: кирпич",
                    "кладочный раствор",
                    "вспомогательные материалы для перевязки/армирования",
                ],
                "required_keyword_groups": [
                    ["кладк"],
                    ["кирпич"],
                    ["раствор"],
                ],
                "minimum_items": 4,
            },
            "masonry_block_wall": {
                "expected_components": [
                    "кладка стен",
                    "основной материал: газобетонные блоки",
                    "клей или раствор",
                    "вспомогательные элементы без повторного учета основного материала",
                ],
                "required_keyword_groups": [
                    ["кладк"],
                    ["блок", "газобетон", "газосиликат"],
                    ["клей", "раствор"],
                ],
                "minimum_items": 4,
            },
            "masonry_ventshaft": {
                "expected_components": [
                    "кладка вентшахт",
                    "основной материал: кирпич",
                    "раствор",
                    "вспомогательные элементы по швам и перевязке",
                ],
                "required_keyword_groups": [
                    ["кладк"],
                    ["кирпич"],
                    ["раствор"],
                ],
                "minimum_items": 4,
            },
        }

        return rules.get(
            template_key,
            {
                "expected_components": [],
                "required_keyword_groups": [],
                "minimum_items": 0,
            },
        )

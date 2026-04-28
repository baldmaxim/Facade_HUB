"""VOR pricing validator — checks every position for correctness.

Validates:
1. Price range — unit_price within expected min-max for material/work type
2. Composition completeness — required components present per domain
3. Zero-price detection — no items with price=0 (except admin)
4. Cross-position consistency — same materials ±30% across positions
5. Position total sanity — per-unit total within expected range
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import yaml

from vor.models import (
    CompositionType,
    PricedItem,
    PricedPosition,
    PricedSection,
)

logger = logging.getLogger("vor_validator")


# ═══════════════════════════════════════════════════════════════════════
# Data structures
# ═══════════════════════════════════════════════════════════════════════


class Severity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class ValidationIssue:
    """A single validation finding."""
    severity: Severity
    rule: str                 # e.g. "price_range", "completeness", "zero_price"
    position_idx: int         # original VOR row index
    message: str
    suggested_fix: str = ""
    details: dict = field(default_factory=dict)


@dataclass
class ValidationResult:
    """Result of validating all positions."""
    total_positions: int = 0
    passed: int = 0
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.WARNING]

    @property
    def infos(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == Severity.INFO]

    def summary(self) -> str:
        lines = [
            f"Validation: {self.passed}/{self.total_positions} positions passed",
            f"  ERRORS: {len(self.errors)}",
            f"  WARNINGS: {len(self.warnings)}",
            f"  INFO: {len(self.infos)}",
        ]
        if self.errors:
            lines.append("\nAll errors:")
            for issue in self.errors:
                lines.append(f"  [{issue.rule}] pos {issue.position_idx}: {issue.message}")
        if self.warnings:
            # Group warnings by rule
            from collections import Counter
            rule_counts = Counter(i.rule for i in self.warnings)
            lines.append(f"\nWarnings by type:")
            for rule, count in rule_counts.most_common():
                lines.append(f"  {rule}: {count}")
            lines.append(f"\nAll warnings:")
            for issue in self.warnings:
                lines.append(f"  [{issue.rule}] pos {issue.position_idx}: {issue.message}")
        return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════
# Price ranges config loader
# ═══════════════════════════════════════════════════════════════════════

_RANGES_FILE = Path(__file__).parent / "price_ranges.yaml"


def _load_price_ranges() -> dict[str, Any]:
    """Load price ranges from YAML config."""
    if _RANGES_FILE.exists():
        with open(_RANGES_FILE, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


# ═══════════════════════════════════════════════════════════════════════
# Validator
# ═══════════════════════════════════════════════════════════════════════


class VorValidator:
    """Validates priced VOR positions against quality rules."""

    def __init__(self, price_ranges: dict | None = None):
        self.ranges = price_ranges or _load_price_ranges()
        self._material_ranges = self.ranges.get("materials", {})
        self._work_ranges = self.ranges.get("works", {})
        self._composition_rules = self.ranges.get("compositions", {})
        self._position_ranges = self.ranges.get("position_totals", {})

    def validate_all(self, sections: list[PricedSection]) -> ValidationResult:
        """Validate all positions across all sections."""
        result = ValidationResult()
        all_positions: list[tuple[str, PricedPosition]] = []

        for section in sections:
            domain = section.domain.value
            for pos in section.positions:
                all_positions.append((domain, pos))

        result.total_positions = len(all_positions)

        # Run all validation rules
        for domain, pos in all_positions:
            pos_issues = []
            pos_issues.extend(self._check_price_ranges(pos, domain))
            pos_issues.extend(self._check_zero_prices(pos))
            pos_issues.extend(self._check_composition_completeness(pos, domain))
            pos_issues.extend(self._check_position_total(pos, domain))
            result.issues.extend(pos_issues)

            if not any(i.severity == Severity.ERROR for i in pos_issues):
                result.passed += 1

        # Cross-position consistency
        result.issues.extend(self._check_cross_consistency(all_positions))

        return result

    def validate_positions(self, positions: list[PricedPosition], domain: str = "general") -> ValidationResult:
        """Validate a flat list of positions (for vor_claude_runner integration)."""
        result = ValidationResult()
        result.total_positions = len(positions)
        all_positions = [(domain, pos) for pos in positions]

        for d, pos in all_positions:
            pos_issues = []
            pos_issues.extend(self._check_price_ranges(pos, d))
            pos_issues.extend(self._check_zero_prices(pos))
            pos_issues.extend(self._check_composition_completeness(pos, d))
            pos_issues.extend(self._check_position_total(pos, d))
            result.issues.extend(pos_issues)

            if not any(i.severity == Severity.ERROR for i in pos_issues):
                result.passed += 1

        result.issues.extend(self._check_cross_consistency(all_positions))
        return result

    # ── Rule 1: Price Range Check ────────────────────────────────────

    def _check_price_ranges(self, pos: PricedPosition, domain: str) -> list[ValidationIssue]:
        issues = []
        for pi in pos.items:
            comp = pi.composition
            name_lower = (comp.name or "").lower()
            unit = (comp.unit or "").lower().replace(".", "").replace(" ", "")

            # Check materials against known ranges
            if comp.type == CompositionType.MATERIAL:
                for mat_key, mat_range in self._material_ranges.items():
                    keywords = mat_range.get("keywords", [mat_key])
                    if any(kw in name_lower for kw in keywords):
                        expected_unit = mat_range.get("unit", "")
                        if expected_unit and expected_unit.replace(".", "") != unit:
                            continue
                        min_p = mat_range.get("min", 0)
                        max_p = mat_range.get("max", float("inf"))
                        if pi.unit_price < min_p:
                            issues.append(ValidationIssue(
                                severity=Severity.WARNING,
                                rule="price_range_low",
                                position_idx=pos.original_idx,
                                message=f"{comp.name}: {pi.unit_price:.0f} < min {min_p} руб/{comp.unit}",
                                suggested_fix=f"Expected {min_p}-{max_p} руб/{comp.unit}",
                                details={"item": comp.name, "price": pi.unit_price, "expected_min": min_p},
                            ))
                        elif pi.unit_price > max_p:
                            issues.append(ValidationIssue(
                                severity=Severity.ERROR,
                                rule="price_range_high",
                                position_idx=pos.original_idx,
                                message=f"{comp.name}: {pi.unit_price:.0f} > max {max_p} руб/{comp.unit}",
                                suggested_fix=f"Expected {min_p}-{max_p} руб/{comp.unit}",
                                details={"item": comp.name, "price": pi.unit_price, "expected_max": max_p},
                            ))
                        break

            # Check works against known ranges
            if comp.type == CompositionType.WORK:
                for work_key, work_range in self._work_ranges.items():
                    keywords = work_range.get("keywords", [work_key])
                    if any(kw in name_lower for kw in keywords):
                        min_p = work_range.get("min", 0)
                        max_p = work_range.get("max", float("inf"))
                        if pi.unit_price > max_p:
                            issues.append(ValidationIssue(
                                severity=Severity.WARNING,
                                rule="work_price_high",
                                position_idx=pos.original_idx,
                                message=f"{comp.name}: {pi.unit_price:.0f} > max {max_p}",
                                details={"item": comp.name, "price": pi.unit_price},
                            ))
                        break

        return issues

    # ── Rule 2: Zero Price Detection ─────────────────────────────────

    def _check_zero_prices(self, pos: PricedPosition) -> list[ValidationIssue]:
        issues = []
        for pi in pos.items:
            if pi.unit_price <= 0 and pi.price_source != "admin":
                issues.append(ValidationIssue(
                    severity=Severity.ERROR,
                    rule="zero_price",
                    position_idx=pos.original_idx,
                    message=f"Нулевая цена: {pi.composition.name} ({pi.composition.type.value})",
                    suggested_fix="Найти цену в базе или энциклопедии",
                    details={"item": pi.composition.name, "type": pi.composition.type.value},
                ))
        return issues

    # ── Rule 3: Composition Completeness ─────────────────────────────

    def _check_composition_completeness(self, pos: PricedPosition, domain: str) -> list[ValidationIssue]:
        issues = []
        if not pos.items:
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="empty_composition",
                position_idx=pos.original_idx,
                message="По��иция без состава работ",
            ))
            return issues

        # Must have at least one WORK item
        has_work = any(pi.composition.type == CompositionType.WORK for pi in pos.items)
        if not has_work:
            issues.append(ValidationIssue(
                severity=Severity.WARNING,
                rule="no_work_item",
                position_idx=pos.original_idx,
                message="Позиция без работы (только материалы/механизмы)",
            ))

        # Check domain-specific composition rules
        all_names = " ".join((pi.composition.name or "").lower() for pi in pos.items)
        # Material/machinery names only (for required component checks)
        material_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
            if pi.composition.type in (CompositionType.MATERIAL, CompositionType.MACHINERY)
        )

        for rule_key, rule in self._composition_rules.items():
            # Check if this rule applies to this position (trigger checks all names)
            trigger_keywords = rule.get("trigger", [])
            if not any(kw in all_names for kw in trigger_keywords):
                continue

            # Check required components
            required = rule.get("required", [])
            mode = rule.get("required_mode", "all")  # "all" or "any"

            if mode == "any":
                # At least one required keyword must be in material names
                if required and not any(kw in material_names for kw in required):
                    issues.append(ValidationIssue(
                        severity=Severity.WARNING,
                        rule="missing_component",
                        position_idx=pos.original_idx,
                        message=f"Нет ни одного из [{', '.join(required)}] для {rule_key}",
                        suggested_fix=f"Добавить один из: {', '.join(required)}",
                    ))
            else:
                # All required keywords must be in material names
                for req_keyword in required:
                    if req_keyword not in material_names:
                        issues.append(ValidationIssue(
                            severity=Severity.WARNING,
                            rule="missing_component",
                            position_idx=pos.original_idx,
                            message=f"Не хватает компонента '{req_keyword}' для {rule_key}",
                        suggested_fix=f"Добавить {req_keyword} в состав",
                        ))

        if domain == "concrete":
            issues.extend(self._check_concrete_completeness(pos))
        elif domain == "masonry":
            issues.extend(self._check_masonry_completeness(pos))

        return issues

    def _check_concrete_completeness(
        self,
        pos: PricedPosition,
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        all_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
        )
        if any(keyword in all_names for keyword in ("демонтаж", "разборк")):
            return issues

        work_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
            if pi.composition.type == CompositionType.WORK
        )
        material_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
            if pi.composition.type in (
                CompositionType.MATERIAL,
                CompositionType.MACHINERY,
            )
        )
        is_prep = any(keyword in all_names for keyword in ("подбетон", "подготовк"))

        if len(pos.items) < (3 if is_prep else 5):
            issues.append(ValidationIssue(
                severity=Severity.WARNING,
                rule="thin_concrete_composition",
                position_idx=pos.original_idx,
                message=(
                    f"Слишком тонкий состав монолита: {len(pos.items)} строк, "
                    f"ожидается не менее {3 if is_prep else 5}"
                ),
                suggested_fix="Добавить основные материалы и процессы монолитных работ",
            ))

        if not any(keyword in material_names for keyword in ("бетон", "подбетон")):
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="concrete_missing_concrete",
                position_idx=pos.original_idx,
                message="В монолитной позиции отсутствует основной бетонный материал",
                suggested_fix="Добавить бетон / бетонную смесь в состав позиции",
            ))

        if not is_prep and "арматур" not in all_names:
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="concrete_missing_rebar",
                position_idx=pos.original_idx,
                message="В монолитной позиции отсутствует арматура",
                suggested_fix="Добавить рабочую и/или конструктивную арматуру",
            ))

        if not is_prep and "опалуб" not in all_names:
            issues.append(ValidationIssue(
                severity=Severity.WARNING,
                rule="concrete_missing_formwork",
                position_idx=pos.original_idx,
                message="В монолитной позиции не найдено опалубки",
                suggested_fix="Проверить, нужна ли опалубка для данного archetype",
            ))

        if not any(
            keyword in work_names
            for keyword in ("бетонир", "монолит", "укладк", "подбетон")
        ):
            issues.append(ValidationIssue(
                severity=Severity.WARNING,
                rule="concrete_process_weak",
                position_idx=pos.original_idx,
                message="В монолитной позиции нет явной основной работы по бетонированию",
                suggested_fix="Добавить основную работу по устройству монолитной конструкции",
            ))

        return issues

    def _check_masonry_completeness(
        self,
        pos: PricedPosition,
    ) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        all_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
        )
        if any(keyword in all_names for keyword in ("демонтаж", "разборк")):
            return issues

        work_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
            if pi.composition.type == CompositionType.WORK
        )
        material_names = " ".join(
            (pi.composition.name or "").lower()
            for pi in pos.items
            if pi.composition.type in (
                CompositionType.MATERIAL,
                CompositionType.MACHINERY,
            )
        )

        if len(pos.items) < 4:
            issues.append(ValidationIssue(
                severity=Severity.WARNING,
                rule="thin_masonry_composition",
                position_idx=pos.original_idx,
                message="Слишком тонкий состав кладки: обычно нужны работа, основной материал и вяжущий",
                suggested_fix="Проверить полноту состава по блокам/кирпичу и клею/раствору",
            ))

        if "кладк" not in work_names:
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="masonry_missing_work",
                position_idx=pos.original_idx,
                message="В позиции кладки отсутствует основная работа по кладке",
                suggested_fix="Добавить основную работу по кладке стен/перегородок",
            ))

        if not any(
            keyword in material_names
            for keyword in ("блок", "газобетон", "газосиликат", "кирпич")
        ):
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="masonry_missing_main_unit",
                position_idx=pos.original_idx,
                message="В позиции кладки отсутствует основной кладочный материал",
                suggested_fix="Добавить блоки или кирпич в зависимости от типа кладки",
            ))

        if not any(keyword in material_names for keyword in ("клей", "раствор")):
            issues.append(ValidationIssue(
                severity=Severity.ERROR,
                rule="masonry_missing_binder",
                position_idx=pos.original_idx,
                message="В позиции кладки отсутствует клей или раствор",
                suggested_fix="Добавить клей для газобетона или кладочный раствор",
            ))

        return issues

    # ── Rule 4: Position Total Sanity ────────────────────────────────

    def _check_position_total(self, pos: PricedPosition, domain: str) -> list[ValidationIssue]:
        issues = []
        if not pos.items:
            return issues

        # Find the main work item to get position unit and quantity
        work_items = [pi for pi in pos.items if pi.composition.type == CompositionType.WORK]
        if not work_items:
            return issues

        main_work = work_items[0]
        pos_qty = main_work.composition.quantity or 0
        pos_unit = (main_work.composition.unit or "").lower().replace(".", "").replace(" ", "")
        if pos_qty <= 0:
            return issues

        # Calculate total cost per unit
        total = sum(pi.unit_price * (pi.composition.quantity or 0) for pi in pos.items)
        per_unit = total / pos_qty

        # Check against position total ranges
        for range_key, range_def in self._position_ranges.items():
            keywords = range_def.get("keywords", [range_key])
            names_lower = " ".join((pi.composition.name or "").lower() for pi in pos.items)
            if not any(kw in names_lower for kw in keywords):
                continue

            expected_unit = range_def.get("unit", "")
            if expected_unit and expected_unit.replace(".", "") != pos_unit:
                continue

            min_total = range_def.get("min", 0)
            max_total = range_def.get("max", float("inf"))

            if per_unit < min_total:
                issues.append(ValidationIssue(
                    severity=Severity.WARNING,
                    rule="total_too_low",
                    position_idx=pos.original_idx,
                    message=f"Итого {per_unit:,.0f} руб/{pos_unit} < min {min_total:,} для {range_key}",
                    details={"per_unit": per_unit, "expected_min": min_total},
                ))
            elif per_unit > max_total:
                issues.append(ValidationIssue(
                    severity=Severity.WARNING,
                    rule="total_too_high",
                    position_idx=pos.original_idx,
                    message=f"Итого {per_unit:,.0f} руб/{pos_unit} > max {max_total:,} для {range_key}",
                    details={"per_unit": per_unit, "expected_max": max_total},
                ))
            break

        return issues

    # ── Rule 5: Cross-Position Consistency ───────────────────────────

    def _check_cross_consistency(self, all_positions: list[tuple[str, PricedPosition]]) -> list[ValidationIssue]:
        """Check that same materials have consistent prices across positions."""
        issues = []

        # Collect material prices by normalized name (first significant word)
        material_prices: dict[str, list[tuple[int, float]]] = {}
        for _, pos in all_positions:
            for pi in pos.items:
                if pi.composition.type == CompositionType.MATERIAL and pi.unit_price > 0:
                    words = (pi.composition.name or "").lower().split()
                    key = next((w for w in words if len(w) > 2), "")
                    if key:
                        if key not in material_prices:
                            material_prices[key] = []
                        material_prices[key].append((pos.original_idx, pi.unit_price))

        # Check consistency: same material should be ±50% across positions
        for mat_name, prices in material_prices.items():
            if len(prices) < 2:
                continue
            values = [p for _, p in prices]
            median = sorted(values)[len(values) // 2]
            if median <= 0:
                continue

            for pos_idx, price in prices:
                ratio = price / median
                if ratio > 2.0 or ratio < 0.5:
                    issues.append(ValidationIssue(
                        severity=Severity.INFO,
                        rule="price_inconsistency",
                        position_idx=pos_idx,
                        message=f"'{mat_name}': {price:.0f} vs median {median:.0f} (×{ratio:.1f})",
                        details={"material": mat_name, "price": price, "median": median},
                    ))

        return issues

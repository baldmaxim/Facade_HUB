"""Deterministic validation checks for VOR pricing positions.

Six checks run after each LLM pricing iteration:
1. unit_price_in_benchmark — is the per-unit price within known range?
2. work_material_ratio — is the work/material split within domain norms?
3. unit_conversion_sanity — detect м²/м³ mixups (critical for masonry)
4. required_components_present — are mandatory items in the composition?
5. no_anomalous_prices — no zeros, negatives, or extreme outliers?
6. no_duplicates — no duplicate line items?

All six checks are implemented.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from vor.agents.domain_norms import (
    component_present,
    get_benchmark,
    get_required_components,
    get_work_material_ratio,
    is_work_item,
)
from vor.models import (
    CompositionType,
    PricedPosition,
)


class Severity(Enum):
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationError:
    severity: Severity
    check_name: str
    message: str
    item_idx: int = -1  # -1 = position-level error


# Red flag thresholds for unit conversion check (руб per unit)
_UNIT_RED_FLAGS: dict[str, float] = {
    # Masonry
    "masonry_block_part": 5_000,
    "masonry_brick_part": 7_000,
    "masonry_block_wall": 25_000,
    # Concrete — prices above these per м3 are suspicious
    "concrete_slab": 60_000,
    "concrete_walls": 65_000,
    "concrete_columns": 90_000,
    "concrete_foundation": 50_000,
    "concrete_beams": 80_000,
    "concrete_prep": 20_000,
    "concrete_monolith": 65_000,
    "concrete_inner_walls": 65_000,
}


class PositionValidator:
    """Runs deterministic checks on a PricedPosition."""

    def check_all(
        self,
        position: PricedPosition,
        domain: str,
        template_id: str = "",
        vor_unit: str = "",
    ) -> list[ValidationError]:
        """Run all checks, return list of errors."""
        errors: list[ValidationError] = []
        errors.extend(self.check_unit_price_benchmark(position, template_id))
        errors.extend(self.check_work_material_ratio(position, domain))
        errors.extend(self.check_unit_conversion(position, template_id, vor_unit))
        errors.extend(self.check_required_components(position, domain, template_id))
        errors.extend(self.check_anomalous_prices(position))
        errors.extend(self.check_duplicates(position))
        return errors

    # ------------------------------------------------------------------
    # Check 1: unit_price vs benchmark
    # ------------------------------------------------------------------
    def check_unit_price_benchmark(
        self,
        position: PricedPosition,
        template_id: str,
    ) -> list[ValidationError]:
        bench = get_benchmark(template_id)
        if bench is None:
            return []

        lo, hi = bench
        unit_price = self._calc_unit_price(position)

        if unit_price <= 0:
            return []

        errors: list[ValidationError] = []

        if unit_price < lo * 0.7:
            # Severely below benchmark — ERROR
            errors.append(ValidationError(
                severity=Severity.ERROR,
                check_name="benchmark",
                message=(
                    f"Цена {unit_price:,.0f} руб/ед НИЖЕ бенчмарка "
                    f"[{lo:,.0f}-{hi:,.0f}] на {(1 - unit_price / lo) * 100:.0f}%. "
                    f"Пересмотри состав — возможно пропущены компоненты."
                ),
            ))
        elif unit_price > hi * 1.3:
            # Severely above benchmark — ERROR
            errors.append(ValidationError(
                severity=Severity.ERROR,
                check_name="benchmark",
                message=(
                    f"Цена {unit_price:,.0f} руб/ед ВЫШЕ бенчмарка "
                    f"[{lo:,.0f}-{hi:,.0f}] на {(unit_price / hi - 1) * 100:.0f}%. "
                    f"Проверь — возможно лишние позиции или завышенные цены."
                ),
            ))
        elif unit_price < lo * 0.9:
            # Moderately below benchmark — WARNING
            errors.append(ValidationError(
                severity=Severity.WARNING,
                check_name="benchmark",
                message=(
                    f"Цена {unit_price:,.0f} руб/ед чуть ниже бенчмарка "
                    f"[{lo:,.0f}-{hi:,.0f}]."
                ),
            ))
        elif unit_price > hi * 1.1:
            # Moderately above benchmark — WARNING
            errors.append(ValidationError(
                severity=Severity.WARNING,
                check_name="benchmark",
                message=(
                    f"Цена {unit_price:,.0f} руб/ед чуть выше бенчмарка "
                    f"[{lo:,.0f}-{hi:,.0f}]."
                ),
            ))

        return errors

    # ------------------------------------------------------------------
    # Check 2: work/material ratio
    # ------------------------------------------------------------------
    def check_work_material_ratio(
        self,
        position: PricedPosition,
        domain: str,
    ) -> list[ValidationError]:
        work_total = 0.0
        material_total = 0.0

        for pi in position.items:
            item_cost = pi.composition.quantity * pi.unit_price
            if item_cost <= 0:
                continue
            if pi.composition.type in (
                CompositionType.WORK,
                CompositionType.LABOR,
                CompositionType.MACHINERY,
            ):
                work_total += item_cost
            elif is_work_item(pi.composition.name, pi.composition.unit):
                work_total += item_cost
            else:
                material_total += item_cost

        total = work_total + material_total
        if total <= 0:
            return []

        work_ratio = work_total / total
        ratio_lo, ratio_hi = get_work_material_ratio(domain)

        tolerance = 0.15
        errors: list[ValidationError] = []

        if work_ratio < ratio_lo - tolerance:
            errors.append(ValidationError(
                severity=Severity.ERROR,
                check_name="work_material_ratio",
                message=(
                    f"Доля работ {work_ratio * 100:.0f}% слишком мала "
                    f"(норма {ratio_lo * 100:.0f}-{ratio_hi * 100:.0f}%). "
                    f"Возможно пропущены работы (монтаж, укладка, демонтаж)."
                ),
            ))
        elif work_ratio > ratio_hi + tolerance:
            errors.append(ValidationError(
                severity=Severity.ERROR,
                check_name="work_material_ratio",
                message=(
                    f"Доля работ {work_ratio * 100:.0f}% слишком велика "
                    f"(норма {ratio_lo * 100:.0f}-{ratio_hi * 100:.0f}%). "
                    f"Проверь — возможно завышены трудозатраты или занижены материалы."
                ),
            ))

        return errors

    # ------------------------------------------------------------------
    # Check 3: unit conversion sanity
    # ------------------------------------------------------------------
    def check_unit_conversion(
        self,
        position: PricedPosition,
        template_id: str,
        vor_unit: str,
    ) -> list[ValidationError]:
        red_flag = _UNIT_RED_FLAGS.get(template_id)
        if red_flag is None:
            return []

        unit_price = self._calc_unit_price(position)
        if unit_price <= 0:
            return []

        errors: list[ValidationError] = []
        if unit_price > red_flag:
            errors.append(ValidationError(
                severity=Severity.ERROR,
                check_name="unit_conversion",
                message=(
                    f"Цена {unit_price:,.0f} руб/{vor_unit or 'ед'} > red_flag "
                    f"{red_flag:,.0f}. Подозрение на ошибку конверсии единиц "
                    f"(м³ применено как м²). "
                    f"Проверь единицы измерения всех материалов."
                ),
            ))

        return errors

    # ------------------------------------------------------------------
    # Check 4: required components present
    # ------------------------------------------------------------------
    def check_required_components(
        self,
        position: PricedPosition,
        domain: str,
        template_id: str,
    ) -> list[ValidationError]:
        components = get_required_components(domain, template_id)
        if not components:
            return []

        item_names = [pi.composition.name for pi in position.items]
        errors = []
        for component_pattern in components:
            if not component_present(component_pattern, item_names):
                errors.append(ValidationError(
                    severity=Severity.ERROR,
                    check_name="required_component",
                    message=(
                        f"Отсутствует обязательный компонент: '{component_pattern}'. "
                        f"Добавь в состав работ."
                    ),
                ))
        return errors

    # ------------------------------------------------------------------
    # Check 5: no anomalous prices
    # ------------------------------------------------------------------
    def check_anomalous_prices(
        self,
        position: PricedPosition,
    ) -> list[ValidationError]:
        errors = []
        total_cost = 0.0

        for i, pi in enumerate(position.items):
            item_cost = pi.composition.quantity * pi.unit_price

            if pi.unit_price == 0 and pi.composition.type != CompositionType.LABOR:
                errors.append(ValidationError(
                    severity=Severity.ERROR,
                    check_name="anomalous_price",
                    message=(
                        f"Нулевая цена: '{pi.composition.name}' ({pi.composition.unit}). Найди цену."
                    ),
                    item_idx=i,
                ))

            if pi.unit_price < 0:
                errors.append(ValidationError(
                    severity=Severity.ERROR,
                    check_name="anomalous_price",
                    message=(
                        f"Отрицательная цена: '{pi.composition.name}' = {pi.unit_price:,.0f} руб."
                    ),
                    item_idx=i,
                ))

            if pi.composition.type == CompositionType.MATERIAL and pi.unit_price > 500_000:
                errors.append(ValidationError(
                    severity=Severity.ERROR,
                    check_name="anomalous_price",
                    message=(
                        f"Аномально высокая цена: '{pi.composition.name}' "
                        f"= {pi.unit_price:,.0f} руб/{pi.composition.unit}. "
                        f"Проверь единицу измерения."
                    ),
                    item_idx=i,
                ))

            total_cost += item_cost

        if total_cost > 0:
            for i, pi in enumerate(position.items):
                item_cost = pi.composition.quantity * pi.unit_price
                if item_cost > total_cost * 0.80:
                    errors.append(ValidationError(
                        severity=Severity.WARNING,
                        check_name="anomalous_price",
                        message=(
                            f"Доминирующая позиция: '{pi.composition.name}' "
                            f"= {item_cost/total_cost*100:.0f}% от итого. "
                            f"Проверь, не завышена ли цена."
                        ),
                        item_idx=i,
                    ))

        return errors

    # ------------------------------------------------------------------
    # Check 6: no duplicates
    # ------------------------------------------------------------------
    def check_duplicates(
        self,
        position: PricedPosition,
    ) -> list[ValidationError]:
        errors = []
        # (norm_name, norm_unit) -> first-seen index
        seen: dict[tuple[str, str], int] = {}

        for i, pi in enumerate(position.items):
            norm_name, norm_unit = self._normalize_for_dedup_parts(
                pi.composition.name, pi.composition.unit,
            )

            dup_idx = None
            # Exact match — clear duplicate
            for (ex_name, ex_unit), idx in seen.items():
                if ex_unit != norm_unit:
                    continue
                # Exact or prefix match on name (one spec is a superset of another)
                # e.g. "бетон в25 п4 f150" vs "бетон в25 п4 f150 w6"
                if (norm_name == ex_name
                        or norm_name.startswith(ex_name + " ")
                        or ex_name.startswith(norm_name + " ")):
                    dup_idx = idx
                    break

            if dup_idx is not None:
                errors.append(ValidationError(
                    severity=Severity.ERROR,
                    check_name="duplicate",
                    message=(
                        f"Дубль: '{pi.composition.name}' ({pi.composition.unit}) "
                        f"совпадает с позицией #{dup_idx+1}. Объедини или удали."
                    ),
                    item_idx=i,
                ))
            else:
                seen[(norm_name, norm_unit)] = i

        return errors

    @staticmethod
    def _normalize_for_dedup_parts(name: str, unit: str) -> tuple[str, str]:
        """Return (normalized_name, normalized_unit) for duplicate detection."""
        n = name.lower().strip()
        n = re.sub(r'\s+', ' ', n).strip()
        return n, unit.lower().strip()

    @staticmethod
    def _normalize_for_dedup(name: str, unit: str) -> str:
        """Normalize name+unit for duplicate detection.

        Preserves classification markers (B25, D500, d12, F150, W6, EI45)
        that distinguish genuinely different materials.
        """
        n = name.lower().strip()
        n = re.sub(r'\s+', ' ', n).strip()
        return f"{n}|{unit.lower().strip()}"

    # ------------------------------------------------------------------
    # Check 7: cross-position consistency
    # ------------------------------------------------------------------
    def check_cross_position_consistency(
        self,
        positions: list[PricedPosition],
    ) -> list[ValidationError]:
        """Check that the same material has consistent prices across positions.

        Flags materials where max/min price ratio exceeds 1.25 (25% deviation).
        """
        from collections import defaultdict

        material_prices: dict[str, list[tuple[float, int]]] = defaultdict(list)
        for pos in positions:
            for pi in pos.items:
                if pi.composition.type == CompositionType.MATERIAL and pi.unit_price > 0:
                    key = pi.composition.name.lower().strip()
                    material_prices[key].append((pi.unit_price, pos.original_idx))

        errors = []
        for name, prices in material_prices.items():
            if len(prices) < 2:
                continue
            values = [p[0] for p in prices]
            min_p, max_p = min(values), max(values)
            if min_p > 0 and max_p / min_p > 1.25:
                rows = [str(p[1]) for p in prices]
                errors.append(ValidationError(
                    severity=Severity.WARNING,
                    check_name="cross_position",
                    message=(
                        f"Непоследовательная цена: '{name}' — "
                        f"от {min_p:,.0f} до {max_p:,.0f} руб "
                        f"(разброс {(max_p/min_p - 1)*100:.0f}%) "
                        f"в позициях {', '.join(rows[:5])}"
                    ),
                ))

        return errors

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _calc_unit_price(position: PricedPosition) -> float:
        """Sum all line items: qty * unit_price."""
        return sum(
            pi.composition.quantity * pi.unit_price
            for pi in position.items
        )

"""Rule-based pricer — applies expert_rules to all VOR positions.

For each position, finds the best matching rule by keywords,
calculates price using FER + extra materials, checks benchmark.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from vor.agent.expert_rules import PRICING_RULES
from vor.agent.fer_pricer import FerPricer

logger = logging.getLogger("vor_agent.rule_pricer")

# Keywords that indicate a line item is WORK (labor), not material
_WORK_KEYWORDS = [
    'монтаж', 'демонтаж', 'укладк', 'работ', 'вибрирован', 'армирован',
    'заглажив', 'подача', 'пусконаладк', 'сварк', 'резк', 'нанесен',
    'окраск', 'окрас', 'оклейк', 'инъектирован', 'испытан', 'регистрац',
    'планировк', 'укатк', 'посев', 'посадочн', 'уплотнен', 'сверлен',
    'снятие', 'герметизац', 'изоляц',
    # Услуги / services
    'вывоз', 'транспорт', 'перевозк', 'перебазировк',
    'охран', 'уборк', 'содержан', 'сопровожден', 'обслужив',
    'срубк', 'распушовк', 'разработк', 'засыпк',
    'полив', 'подъём', 'подъем', 'доставк',
]
# Keywords for MECHANISMS (equipment)
_MECH_KEYWORDS = [
    'кран', 'вибратор', 'виброрейк', 'бетононасос', 'подъёмник', 'подъемник',
    'экскаватор', 'бульдозер', 'компрессор', 'молот', 'маш-ч',
    'гидромолот', 'вибропогруж',
]


def _is_work_item(name: str, unit: str) -> bool:
    """Classify whether an extras line item is work/labor (vs material)."""
    nl = name.lower()
    ul = unit.lower() if unit else ''
    # Materials that contain work-like keywords but are actually materials
    if any(kw in nl for kw in ['теплоизоляц', 'звукоизоляц', 'гидроизоляц', 'пароизоляц']):
        # These are materials even though they contain "изоляц"
        # Unless the name starts with "работа" or "монтаж"
        if not any(nl.startswith(prefix) for prefix in ['работа', 'монтаж', 'устройство']):
            return False
    # Mechanism items are work-adjacent (counted as work)
    if any(kw in nl for kw in _MECH_KEYWORDS) or 'маш-ч' in ul:
        return True
    return any(kw in nl for kw in _WORK_KEYWORDS)


@dataclass
class RulePricingResult:
    idx: int
    name: str
    unit: str
    qty: float
    rule_id: str
    work_cost: float = 0
    material_cost: float = 0
    total: float = 0
    per_unit: float = 0
    bench_lo: float = 0
    bench_hi: float = 0
    bench_ok: bool = False
    matched: bool = False


def _calc_qty(expr: str, qty: float, defaults: dict) -> float:
    """Safely calculate quantity from expression string.

    Supports: qty, qty*N, qty/N, qty*N*M, thickness*N
    No eval() — parses manually.
    """
    if isinstance(expr, (int, float)):
        return float(expr)

    s = str(expr).strip()

    # Direct number
    try:
        return float(s)
    except ValueError:
        pass

    # Replace known variables
    s = s.replace('qty', str(qty))
    for k, v in defaults.items():
        s = s.replace(k, str(v))

    # Simple arithmetic: only *, /, +, - with numbers
    # Split by operators and compute left-to-right
    try:
        # Handle multiplication chains like "3712.0*1.02"
        parts = re.split(r'([*/+-])', s)
        result = float(parts[0].strip())
        i = 1
        while i < len(parts) - 1:
            op = parts[i].strip()
            val = float(parts[i + 1].strip())
            if op == '*':
                result *= val
            elif op == '/':
                result /= val
            elif op == '+':
                result += val
            elif op == '-':
                result -= val
            i += 2
        return result
    except (ValueError, IndexError, ZeroDivisionError):
        return qty


def match_rule(name: str, unit: str) -> dict | None:
    """Find best matching pricing rule for a VOR position."""
    name_lower = name.lower()
    best = None
    best_score = 0

    for rule in PRICING_RULES:
        score = 0

        # Check required keywords (ALL must match)
        keywords = rule.get('keywords', [])
        if keywords:
            if all(kw in name_lower for kw in keywords):
                score += len(keywords) * 10
            else:
                continue

        # Check any keywords (at least ONE must match)
        keywords_any = rule.get('keywords_any', [])
        if keywords_any:
            matched_any = [kw for kw in keywords_any if re.search(kw, name_lower)]
            if matched_any:
                score += len(matched_any) * 5
            elif not keywords:
                continue

        # STRICT unit_any enforcement: if rule specifies unit_any, position unit MUST be in list
        unit_any = rule.get('unit_any', [])
        if unit_any:
            unit_norm = unit.lower().split('_')[0].split('\r')[0].strip()
            if unit_norm not in [u.lower() for u in unit_any]:
                continue

        # Unit match — HARD FILTER unless rule has unit_flex=True
        rule_unit = rule.get('unit')
        if rule_unit:
            if rule_unit != unit and not rule.get('unit_flex'):
                continue  # strict: unit must match
            if rule_unit == unit:
                score += 3

        if score > best_score:
            best_score = score
            best = rule

    return best


def price_all_positions(items: list, fp: FerPricer, on_position_priced=None) -> list[RulePricingResult]:
    """Price all VOR items using expert rules."""
    results = []
    for idx, item in enumerate(items):
        if not item.quantity or item.quantity <= 0 or not item.name:
            continue

        # Skip parent/summary positions (total=0 in original VOR)
        # Parents have total=0 in raw_data — they sum their children
        if hasattr(item, 'raw_data') and item.raw_data:
            total_val = item.raw_data.get('total')
            if total_val == 0:
                continue  # this is a parent row, skip it

        qty = item.quantity
        name = item.name
        # Normalize unit: strip Excel artifacts like "_x000d_" and parenthetical suffixes
        raw_unit = item.unit or ''
        unit = raw_unit.split('_')[0].split('\r')[0].split('(')[0].strip()

        rule = match_rule(name, unit)

        if not rule:
            r = RulePricingResult(idx=idx, name=name[:55], unit=unit, qty=qty, rule_id='NO_MATCH')
            if on_position_priced:
                on_position_priced(r)
            results.append(r)
            continue

        r = RulePricingResult(idx=idx, name=name[:55], unit=unit, qty=qty, rule_id=rule['id'])
        r.matched = True
        r.bench_lo = rule.get('bench', (0, 0))[0]
        r.bench_hi = rule.get('bench', (0, 0))[1]

        defaults = rule.get('defaults', {})

        # Calculate ГЭСН work cost
        gesn_codes = []
        for code, qty_expr in rule.get('gesn', []):
            gesn_qty = _calc_qty(qty_expr, qty, defaults)
            gesn_codes.append((code, gesn_qty))

        # Calculate extras, classifying as work or material
        extras_materials = []
        extras_work_total = 0.0
        for mat_name, mat_unit, qty_expr, price in rule.get('extras', []):
            mat_qty = _calc_qty(qty_expr, qty, defaults)
            line_total = mat_qty * price
            if _is_work_item(mat_name, mat_unit):
                extras_work_total += line_total
            else:
                extras_materials.append((mat_name, mat_unit, mat_qty, price))

        # Use FerPricer for ГЭСН + material extras only
        priced = fp.price_position(idx, name, unit, qty, gesn_codes, extras_materials or None)
        # Add classified work cost from extras
        r.work_cost = priced.total_work + extras_work_total
        r.material_cost = priced.total_materials
        r.total = priced.total + extras_work_total
        r.per_unit = r.total / qty if qty else 0
        r.bench_ok = r.bench_lo <= r.per_unit <= r.bench_hi

        if on_position_priced:
            on_position_priced(r)

        results.append(r)

    return results

"""Reasoning Document Generator — produces human-readable analysis reports.

Generates two output documents from the reasoning engine's results:

1. **VOR_reasoning.md** — Full reasoning document with per-item chain of thought.
2. **VOR_findings.md** — Executive summary of discoveries, warnings, and actions.

These documents serve three purposes:
- Transparency: the user sees exactly WHY each code was chosen.
- Audit trail: a senior estimator can review and correct AI decisions.
- Quality assurance: cross-check results and findings highlight issues.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from vor.models import (
    Finding,
    FindingCategory,
    FindingSeverity,
    GesnMatch,
    PriceResult,
    ReasoningItem,
    VorItem,
    VorResult,
)

logger = logging.getLogger(__name__)

# Confidence level display markers
_CONFIDENCE_MARKERS = {
    "green": "[ВЫСОКАЯ]",
    "yellow": "[СРЕДНЯЯ]",
    "red": "[НИЗКАЯ]",
}


def generate_reasoning_document(result: VorResult) -> str:
    """Generate the full reasoning document (VOR_reasoning.md).

    Structure:
      1. Header with timestamp and model info
      2. VOR Plan (Stage A output)
      3. Per-item reasoning chains (Stage C output)
      4. Findings and warnings
      5. Cross-check results (Stage D output)
    """
    lines: list[str] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # ─── Header ───────────────────────────────────────────────
    lines.append("# Отчёт о расценке ВОР — Ход рассуждений AI")
    lines.append(f"\nДата: {now}")
    lines.append(f"Позиций в ВОР: {len(result.items)}")
    lines.append(f"Подобрано расценок: {len(result.matches)}")

    stats = result.stats
    if stats:
        green = stats.get("green", 0)
        yellow = stats.get("yellow", 0)
        red = stats.get("red", 0)
        lines.append(f"Уверенность: {green} высокая, {yellow} средняя, {red} низкая")
        total_cost = stats.get("total_cost_fer_2025", 0)
        if total_cost:
            lines.append(f"Общая стоимость (база 2000): {total_cost:,.2f} руб.")
        elapsed = stats.get("elapsed_seconds", 0)
        if elapsed:
            lines.append(f"Время анализа: {elapsed:.0f} сек.")

    lines.append("\n---\n")

    # ─── Stage A: Plan ────────────────────────────────────────
    if result.vor_plan:
        lines.append("## 1. Обзор ВОР (план анализа)\n")
        lines.append(result.vor_plan)
        lines.append("\n---\n")

    # ─── Stage C: Per-item reasoning ──────────────────────────
    lines.append("## 2. Расценка позиций — ход мысли\n")

    # Group by section
    match_map = {m.item_idx: m for m in result.matches}
    price_map = {p.item_idx: p for p in result.prices}
    reasoning_map = {r.item_idx: r for r in result.reasoning_items}

    current_section = ""
    for i, item in enumerate(result.items):
        if item.section and item.section != current_section:
            current_section = item.section
            lines.append(f"\n### Раздел: {current_section}\n")

        match = match_map.get(i)
        price = price_map.get(i)
        ri = reasoning_map.get(i)

        lines.append(f"#### Позиция {i + 1}: {item.name}\n")

        # Reasoning chain
        if ri and ri.reasoning_chain:
            lines.append("**Ход мысли:**")
            lines.append(ri.reasoning_chain)
            lines.append("")

        # Model elements found
        if ri and ri.model_elements_found:
            lines.append(f"**В модели:** {ri.model_elements_found}")

        # Decomposition
        if ri and ri.decomposition:
            decomp = ri.decomposition
            lines.append(f"**Декомпозиция:** Стена «{decomp.source_type_name}» разбита на слои:")
            for layer in decomp.layers:
                lines.append(
                    f"  - {layer.material} {layer.thickness_mm:.0f}мм "
                    f"({layer.function}) -> сборник {layer.gesn_collection}"
                )

        # Chosen code
        if match and match.gesn_code:
            conf_marker = _CONFIDENCE_MARKERS.get(match.confidence_level, "")
            lines.append(f"**Выбранный код:** {match.gesn_code} — {match.gesn_name}")
            lines.append(f"**Уверенность:** {conf_marker} ({match.confidence:.0%})")
            lines.append(f"**Единица ГЭСН:** {match.gesn_unit}")

            # Alternatives
            if match.alternatives:
                alt_str = "; ".join(
                    f"{a.get('gesn_code', '')} ({a.get('gesn_name', '')[:40]})"
                    for a in match.alternatives[:3]
                )
                lines.append(f"**Альтернативы:** {alt_str}")
        else:
            lines.append("**Код ГЭСН:** НЕ НАЙДЕН")

        # Price
        if price:
            lines.append(f"**Количество:** {price.quantity:.3f} {item.unit}")
            lines.append(f"**Расценка (база 2000):** {price.fer_direct_cost:.2f} / {item.unit}")
            lines.append(f"**Стоимость:** {price.total_base:,.2f} руб.")
        elif item.quantity:
            lines.append(f"**Количество (из ВОР):** {item.quantity:.3f} {item.unit}")

        # Adjustments
        if ri and ri.adjustments:
            lines.append("**Корректировки:**")
            for adj in ri.adjustments:
                lines.append(f"  - {adj}")

        # Generated sub-items
        if ri and ri.generated_items:
            lines.append("**Доп. позиции (от декомпозиции):**")
            for gi in ri.generated_items:
                lines.append(
                    f"  - {gi.get('name', '?')}: ГЭСН {gi.get('gesn_code', '?')} "
                    f"[{gi.get('unit', '?')}] — {gi.get('reasoning', '')}"
                )

        # Finding references
        if ri and ri.finding_refs:
            lines.append("**Связанные замечания:** см. раздел 3, пункты: "
                         + ", ".join(str(f + 1) for f in ri.finding_refs))

        lines.append("")  # blank line between items

    lines.append("\n---\n")

    # ─── Findings ─────────────────────────────────────────────
    if result.findings:
        lines.append("## 3. Замечания и рекомендации\n")
        for fi, finding in enumerate(result.findings):
            severity_icon = {
                FindingSeverity.ERROR: "[!!!]",
                FindingSeverity.WARNING: "[!]",
                FindingSeverity.INFO: "[i]",
            }.get(finding.severity, "")

            lines.append(f"{fi + 1}. {severity_icon} **{finding.title}**")
            lines.append(f"   Категория: {finding.category.value}")
            lines.append(f"   {finding.description}")
            if finding.suggested_action:
                lines.append(f"   Рекомендация: {finding.suggested_action}")
            if finding.suggested_gesn:
                lines.append(f"   Предлагаемый ГЭСН: {finding.suggested_gesn}")
            if finding.affected_items:
                items_str = ", ".join(str(x + 1) for x in finding.affected_items)
                lines.append(f"   Затронутые позиции: {items_str}")
            lines.append("")

        lines.append("\n---\n")

    # ─── Stage D: Cross-check ─────────────────────────────────
    if result.cross_check:
        lines.append("## 4. Перепроверка (AI контроль качества)\n")
        lines.append(result.cross_check)
        lines.append("")

    return "\n".join(lines)


def generate_findings_document(result: VorResult) -> str:
    """Generate the executive findings summary (VOR_findings.md).

    This is a shorter document focused on actionable items:
    - Items added by AI (not in original VOR)
    - Multi-layer decompositions
    - Contradictions found
    - Missing information
    """
    lines: list[str] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    lines.append("# Краткий отчёт: Замечания AI по ВОР")
    lines.append(f"\nДата: {now}")
    lines.append(f"Позиций в ВОР: {len(result.items)}")
    lines.append(f"Замечаний: {len(result.findings)}")
    lines.append("")

    if not result.findings:
        lines.append("Замечаний не обнаружено.  ВОР выглядит полным и непротиворечивым.")
        return "\n".join(lines)

    # Group findings by category
    by_category: dict[str, list[tuple[int, Finding]]] = {}
    for fi, finding in enumerate(result.findings):
        cat = finding.category.value
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append((fi, finding))

    # Section 1: Errors (must fix)
    errors = [
        (fi, f) for fi, f in enumerate(result.findings)
        if f.severity == FindingSeverity.ERROR
    ]
    if errors:
        lines.append("## Критические замечания (необходимо исправить)\n")
        for fi, finding in errors:
            lines.append(f"- **{finding.title}**")
            lines.append(f"  {finding.description[:200]}")
            if finding.suggested_action:
                lines.append(f"  -> {finding.suggested_action}")
            lines.append("")

    # Section 2: Multi-layer decompositions
    multi_layer = by_category.get("multi_layer", [])
    if multi_layer:
        lines.append("## Многослойные конструкции\n")
        lines.append("Следующие элементы модели содержат несколько материалов.  ")
        lines.append("Каждый слой рекомендуется выделить в отдельную позицию ВОР:\n")
        for fi, finding in multi_layer:
            lines.append(f"- {finding.title}")
            lines.append(f"  {finding.description[:200]}")
            lines.append("")

    # Section 3: Missing items
    missing_cats = ["missing_item", "implicit_work"]
    missing = []
    for cat in missing_cats:
        missing.extend(by_category.get(cat, []))
    if missing:
        lines.append("## Отсутствующие позиции\n")
        lines.append("AI обнаружил работы, которые должны быть в ВОР, но отсутствуют:\n")
        for fi, finding in missing:
            lines.append(f"- **{finding.title}**")
            lines.append(f"  {finding.description[:200]}")
            if finding.suggested_gesn:
                lines.append(f"  Предлагаемый ГЭСН: {finding.suggested_gesn}")
            lines.append("")

    # Section 4: Warnings
    warnings = [
        (fi, f) for fi, f in enumerate(result.findings)
        if f.severity == FindingSeverity.WARNING and f.category not in (
            FindingCategory.MULTI_LAYER,
            FindingCategory.MISSING_ITEM,
            FindingCategory.IMPLICIT_WORK,
        )
    ]
    if warnings:
        lines.append("## Предупреждения\n")
        for fi, finding in warnings:
            lines.append(f"- **{finding.title}**")
            lines.append(f"  {finding.description[:200]}")
            if finding.suggested_action:
                lines.append(f"  -> {finding.suggested_action}")
            lines.append("")

    # Section 5: Info
    infos = [
        (fi, f) for fi, f in enumerate(result.findings)
        if f.severity == FindingSeverity.INFO and f.category not in (
            FindingCategory.MULTI_LAYER,
        )
    ]
    if infos:
        lines.append("## Информация\n")
        for fi, finding in infos:
            lines.append(f"- {finding.title}: {finding.description[:150]}")
            lines.append("")

    # Summary statistics
    lines.append("\n---\n")
    lines.append("## Статистика замечаний\n")
    lines.append(f"| Категория | Кол-во |")
    lines.append(f"|-----------|--------|")
    for cat_name, items_list in sorted(by_category.items()):
        lines.append(f"| {cat_name} | {len(items_list)} |")

    error_count = sum(1 for f in result.findings if f.severity == FindingSeverity.ERROR)
    warn_count = sum(1 for f in result.findings if f.severity == FindingSeverity.WARNING)
    info_count = sum(1 for f in result.findings if f.severity == FindingSeverity.INFO)
    lines.append("")
    lines.append(f"Критических: {error_count}, Предупреждений: {warn_count}, Информация: {info_count}")

    # Generated items summary
    gen_items = []
    for ri in result.reasoning_items:
        for gi in ri.generated_items:
            gen_items.append(gi)
    if gen_items:
        lines.append(f"\n## Доп. позиции, предложенные AI ({len(gen_items)})\n")
        lines.append("| # | Наименование | ГЭСН | Ед. | Обоснование |")
        lines.append("|---|-------------|------|-----|-------------|")
        for gi_idx, gi in enumerate(gen_items):
            lines.append(
                f"| {gi_idx + 1} | {gi.get('name', '?')[:40]} | "
                f"{gi.get('gesn_code', '?')} | {gi.get('unit', '?')} | "
                f"{gi.get('reasoning', '')[:50]} |"
            )

    return "\n".join(lines)

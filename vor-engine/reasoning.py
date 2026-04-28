"""VOR Reasoning Engine — LLM-powered construction estimating brain.

This module implements the four-stage reasoning process:

  Stage A: Understanding the VOR (high-level plan)
  Stage B: Exploring the model (focused queries via passport + bridge)
  Stage C: Matching with reasoning (per-section GESN matching with chain-of-thought)
  Stage D: Cross-checking (consistency review of the complete result)

Design principles:
  - Batch by section to keep LLM calls within budget (max 10-15 for a 50-item VOR).
  - Use deterministic analysis (analyzer.py) for everything that doesn't need LLM.
  - LLM is used for ambiguous matching, natural-language reasoning chains, and
    the cross-check that catches what scripts miss.
  - Every LLM call returns structured reasoning that goes into the reasoning
    document, so the user sees the AI's thought process.

Cost/time budget (50-item VOR):
  - Stage A: 1 LLM call (~$0.02, ~3s)
  - Stage B: 0 LLM calls (deterministic from passport)
  - Stage C: 5-8 LLM calls, one per section (~$0.03 each, ~3s each)
  - Stage D: 1 LLM call (~$0.03, ~3s)
  - Total: 7-10 LLM calls, ~$0.25, ~30-45s
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

from vor.models import (
    ElementDecomposition,
    Finding,
    FindingCategory,
    FindingSeverity,
    GesnMatch,
    PositionBreakdown,
    ReasoningItem,
    ResourceLine,
    VorItem,
    VorSection,
    WorkBreakdown,
)
from vor.analyzer import (
    ModelSummary,
    analyze_model_passport,
    classify_vor_section,
    detect_implicit_work,
    detect_multi_layer_walls,
    detect_unit_mismatches,
    get_waste_coefficient,
)

logger = logging.getLogger(__name__)

# Type aliases
LlmCallback = Callable[[str, str], Coroutine[Any, Any, str]]
# async def llm_callback(system_prompt: str, user_prompt: str) -> str

ProgressCallback = Callable[[str, float, str], None]


# ---------------------------------------------------------------------------
# Prompts for each stage
# ---------------------------------------------------------------------------

_STAGE_A_SYSTEM = """\
Ты — опытный инженер-сметчик с 20-летним стажем.  Тебе дана ведомость объёмов \
работ (ВОР) и краткое описание модели здания.

Твоя задача — написать ПЛАН анализа:
1. Тип здания и масштаб проекта (этажность, назначение).
2. Какие разделы работ присутствуют.
3. Ключевые наблюдения — что бросается в глаза:
   - Есть ли леса/подмости?
   - Есть ли армирование при бетонных работах?
   - Есть ли утеплитель при кладке стен?
   - Есть ли гидроизоляция при подземных уровнях?
   - Есть ли противопожарные мероприятия?
4. Потенциальные проблемы и пропуски.

Ответ в формате Markdown, кратко (500-800 слов).  Не нумеруй позиции — \
это обзор, не перечисление всех строк.  Пиши по-русски."""

_STAGE_C_SYSTEM = """\
Ты — опытный инженер-сметчик с 20-летним стажем.  Тебе дана группа позиций из ВОР \
(одного раздела) и список кандидатов из базы ГЭСН для каждой позиции.

ТВОЯ ЗАДАЧА — для КАЖДОЙ позиции ВОР подобрать ВСЕ необходимые работы ГЭСН.

Одна позиция ВОР обычно включает:
- Основную работу (труд + процесс)
- Сопутствующие работы (перемычки при кладке, армирование при бетоне, и т.д.)
- Каждая работа ГЭСН — это отдельный код

ВАЖНО: Учитывай коэффициенты расхода материалов (потери/отходы):
- Бетон: +2% (коэфф. 1.02)
- Арматура: +5-8% обрезки (1.05-1.08)
- Газобетон/блоки: +10% бой (1.10)
- Кирпич: +10% бой (1.10)
- Утеплитель минвата: +15% обрезки (1.15)
- Утеплитель XPS: +4% (1.04)
- Расходники (клей, раствор): +10% (1.10)
- Мембраны/плёнки: +15-20% нахлёсты (1.15-1.20)
- Крепёж (дюбели): +5-10% запас (1.05-1.10)
- Инертные (песок/щебень): +8-20% усадка (1.08-1.20)
- Трубы/кабели: +2% обрезки (1.02)
Указывай waste_pct как средний процент отходов для основного материала позиции.

Для КАЖДОЙ позиции:
1. Подбери ОСНОВНОЙ код ГЭСН и объясни выбор.
2. Подбери СОПУТСТВУЮЩИЕ работы если они необходимы (перемычки, армирование, \
утепление, гидроизоляция, штукатурка — всё что входит в состав этой позиции).
3. Оцени уверенность: HIGH / MEDIUM / LOW.

Также определи ДОПНИКИ по разделу — работы которых НЕТ в ВОР, но они НЕОБХОДИМЫ:
- По СНиП/СП/ГОСТ (леса при высоте > 4м, гидроизоляция подвала, и т.д.)
- По логике строительства (если есть бетон — нужна арматура и опалубка)
- По модели здания (если подземные уровни — нужна гидроизоляция фундамента)
- По практике строительства (краны для высотных работ, временные дороги)

ФОРМАТ ответа — JSON:
```json
{
  "items": [
    {
      "item_idx": 0,
      "works": [
        {
          "gesn_code": "08-02-001-01",
          "role": "основная",
          "reasoning": "Кладка из блоков ячеистого бетона, сборник 08..."
        },
        {
          "gesn_code": "07-01-021-01",
          "role": "сопутствующая",
          "reasoning": "Перемычки ж/б для оконных и дверных проёмов"
        }
      ],
      "confidence": "HIGH",
      "waste_pct": 3,
      "notes": ""
    }
  ],
  "supplements": [
    {
      "name": "Леса строительные приставные",
      "gesn_code": "08-07-001-01",
      "unit": "м2",
      "reasoning": "Высота кладки > 4м, требуется по СП 12-135-2003",
      "quantity_note": "По площади фасада"
    }
  ]
}
```

Ответь ТОЛЬКО валидным JSON, без оборачивающего текста."""

_STAGE_E_SYSTEM = """\
Ты — опытный инженер-сметчик.  Тебе дан список позиций ВОР с подобранными \
работами ГЭСН и их ресурсами из базы.

Для КАЖДОЙ позиции проанализируй ресурсы:

1. КЛАССИФИЦИРУЙ материалы:
   - "основной" — главный материал позиции, определяющий стоимость:
     * Для бетонных работ: бетон, арматура
     * Для кладки: блоки/кирпич
     * Для утепления: утеплитель (минвата, XPS, пеностекло)
     * Для гидроизоляции: мембрана/мастика
     * Для полов: стяжка/покрытие
   - "вспомогательный" — расходники и мелочь:
     * Раствор, клей, вода, гвозди
     * Сетка кладочная, монтажная пена
     * Крепёж (дюбели, анкера, хомуты)
     * Герметик, грунтовка, праймер
     * Расходники по виду работ

2. ПРОВЕРЬ полноту:
   - Все ли основные материалы учтены?
   - Есть ли пропущенные ресурсы?
   - Краны/механизмы — нужны ли для этой позиции?
   - Доставка — учтена ли (для тяжёлых материалов: бетон, блоки, металл)?

3. НАПИШИ комментарий-обоснование:
   - Методика расчёта количества машин (по нормативу ГЭСН)
   - Коэфф. расхода: бетон +2%, арматура +8%, блоки +10%, утеплитель +4-15%
   - Почему выбраны именно эти нормативы
   - Особенности позиции

ФОРМАТ ответа — JSON:
```json
{
  "positions": [
    {
      "item_idx": 0,
      "material_classification": {
        "07.1.03.02-0001": "основной",
        "11.1.03.01-0064": "вспомогательный",
        "01.7.03.01-0001": "вспомогательный"
      },
      "missing_resources": [],
      "comment": "Расценка ГЭСН 08-02-001-01 для кладки из ячеистобетонных блоков..."
    }
  ]
}
```

Ответь ТОЛЬКО валидным JSON, без оборачивающего текста."""

_STAGE_D_SYSTEM = """\
Ты — главный сметчик, проверяющий работу младшего коллеги.  Тебе дана сводка \
ВОР с подобранными расценками и объёмами.

Проверь на:
1. Полноту — все ли работы учтены? Нет ли пропущенных позиций?
2. Непротиворечивость — совпадают ли единицы? Нет ли дублей?
3. Правдоподобность — разумны ли объёмы? Стоимость на м2 здания в рамках нормы?
4. Армирование — при бетонных работах есть ли арматура?
5. Отделка — учтены ли штукатурка, покраска, полы?

Ответ в формате Markdown (300-500 слов).  Список найденных проблем — нумерованный.  \
Если всё в порядке — подтверди и объясни почему.  Пиши по-русски."""


# ---------------------------------------------------------------------------
# Main engine class
# ---------------------------------------------------------------------------


class ReasoningEngine:
    """Orchestrates multi-stage LLM reasoning for VOR pricing.

    Usage::

        engine = ReasoningEngine(
            gesn_db_path="data/gesn.db",
            llm_callback=my_llm_call,
        )
        result = await engine.run(
            items=parsed_vor_items,
            model_passport=passport_dict,
            on_progress=progress_fn,
        )
    """

    def __init__(
        self,
        gesn_db_path: str | Path,
        llm_callback: LlmCallback,
    ):
        self.gesn_db_path = str(gesn_db_path)
        self._llm = llm_callback

    async def run(
        self,
        items: list[VorItem],
        model_passport: Optional[dict[str, Any]] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> ReasoningResult:
        """Execute the full four-stage reasoning pipeline.

        Returns a ReasoningResult with all findings, reasoning items, and
        the high-level plan / cross-check text.
        """
        start = time.monotonic()
        findings: list[Finding] = []
        reasoning_items: list[ReasoningItem] = []

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # ─── Deterministic pre-analysis (no LLM) ──────────────────
        _progress("analyzing", 0.05, "Анализирую модель...")
        model_summary = (
            analyze_model_passport(model_passport) if model_passport else ModelSummary()
        )

        # Detect multi-layer walls
        decompositions = detect_multi_layer_walls(model_summary.wall_types)
        for decomp in decompositions:
            findings.append(Finding(
                category=FindingCategory.MULTI_LAYER,
                severity=FindingSeverity.INFO,
                title=f"Многослойная стена: {decomp.source_type_name}",
                description=(
                    f"Тип стены «{decomp.source_type_name}» содержит {len(decomp.layers)} слоёв: "
                    + ", ".join(
                        f"{l.material} {l.thickness_mm:.0f}мм ({l.function})"
                        for l in decomp.layers
                    )
                    + f".  Количество в модели: {decomp.instance_count} шт.  "
                    "Каждый слой — отдельная позиция в ВОР."
                ),
                suggested_action="Декомпозировать на отдельные позиции по слоям",
            ))

        # Detect implicit work
        implicit_findings = detect_implicit_work(model_summary, items)
        findings.extend(implicit_findings)

        # ─── Stage A: Understanding the VOR ───────────────────────
        _progress("stage_a", 0.10, "AI анализирует ВОР...")
        vor_plan = await self._stage_a(items, model_summary)

        # ─── Stage B: Group items into sections ───────────────────
        _progress("stage_b", 0.20, "Группирую позиции по разделам...")
        sections = self._group_into_sections(items)

        # ─── Stage C: Section-by-section reasoning ────────────────
        total_sections = len(sections)
        all_matches: list[GesnMatch] = []
        all_supplements: list[dict] = []  # Raw supplement dicts from LLM
        # Map item_idx -> list of work dicts [{gesn_code, role, reasoning}]
        item_works_map: dict[int, list[dict]] = {}

        for sec_idx, section in enumerate(sections):
            pct = 0.25 + 0.35 * (sec_idx / max(total_sections, 1))
            _progress(
                "stage_c",
                pct,
                f"Подбираю расценки: {section.section_name} ({sec_idx + 1}/{total_sections})...",
            )

            sec_matches, sec_reasoning, sec_works, sec_supplements = await self._stage_c(
                section, items, model_summary, decompositions
            )
            all_matches.extend(sec_matches)
            reasoning_items.extend(sec_reasoning)
            for idx, works in sec_works.items():
                item_works_map[idx] = works
            all_supplements.extend(sec_supplements)

        # Detect unit mismatches from the matches we just produced
        match_dicts = [
            {"item_idx": m.item_idx, "gesn_unit": m.gesn_unit}
            for m in all_matches
        ]
        unit_findings = detect_unit_mismatches(items, match_dicts)
        findings.extend(unit_findings)

        # Link findings to reasoning items
        for fi, finding in enumerate(findings):
            for ri in reasoning_items:
                if ri.item_idx in finding.affected_items:
                    ri.finding_refs.append(fi)

        # ─── Stage E: Resource breakdown + reasoning ──────────────
        _progress("stage_e", 0.65, "Собираю ресурсную раскладку...")
        breakdowns = self._build_breakdowns(items, item_works_map, all_matches)

        # Add supplement positions as breakdowns
        for sup in all_supplements:
            sup_breakdown = self._build_supplement_breakdown(sup, items)
            if sup_breakdown:
                breakdowns.append(sup_breakdown)

        # Resource reasoning (LLM classifies materials, checks completeness)
        for sec_idx, section in enumerate(sections):
            pct = 0.70 + 0.10 * (sec_idx / max(total_sections, 1))
            _progress(
                "stage_e",
                pct,
                f"Анализирую ресурсы: {section.section_name}...",
            )
            await self._stage_e(section, items, breakdowns)

        # ─── Stage D: Cross-check ────────────────────────────────
        _progress("stage_d", 0.85, "AI перепроверяет результат...")
        cross_check = await self._stage_d(items, all_matches, findings, model_summary)

        elapsed = time.monotonic() - start
        _progress("done", 1.0, f"Анализ завершён за {elapsed:.0f} сек")

        return ReasoningResult(
            matches=all_matches,
            reasoning_items=reasoning_items,
            findings=findings,
            vor_plan=vor_plan,
            cross_check=cross_check,
            elapsed_seconds=round(elapsed, 1),
            breakdowns=breakdowns,
        )

    # ===================================================================
    # Stage A: Understanding the VOR
    # ===================================================================

    async def _stage_a(
        self,
        items: list[VorItem],
        model_summary: ModelSummary,
    ) -> str:
        """Generate a high-level plan by having the LLM read the entire VOR."""
        # Build a compact representation of the VOR
        vor_lines: list[str] = []
        current_section = ""
        for i, item in enumerate(items):
            if item.section != current_section:
                current_section = item.section
                vor_lines.append(f"\n### {current_section}")
            vor_lines.append(f"  {i + 1}. {item.name} [{item.unit}]")

        # Build model summary text
        model_text = self._format_model_summary(model_summary)

        user_prompt = (
            "## ВОР (Ведомость объёмов работ)\n"
            + "\n".join(vor_lines)
            + f"\n\n## Модель здания\n{model_text}"
            + f"\n\nВсего позиций: {len(items)}"
        )

        try:
            result = await self._llm(_STAGE_A_SYSTEM, user_prompt)
            return result
        except Exception as e:
            logger.warning("Stage A LLM call failed: %s", e)
            return f"(Не удалось сгенерировать план анализа: {e})"

    # ===================================================================
    # Stage B + C: Section-level reasoning with GESN candidates
    # ===================================================================

    def _group_into_sections(self, items: list[VorItem]) -> list[VorSection]:
        """Group VOR items by section for batched LLM processing."""
        sections_map: dict[str, VorSection] = {}
        for i, item in enumerate(items):
            sec_name = item.section or "Без раздела"
            if sec_name not in sections_map:
                sections_map[sec_name] = VorSection(
                    section_name=sec_name,
                    gesn_collection_hint=classify_vor_section(sec_name),
                )
            sections_map[sec_name].item_indices.append(i)
        return list(sections_map.values())

    async def _stage_c(
        self,
        section: VorSection,
        items: list[VorItem],
        model_summary: ModelSummary,
        decompositions: list[ElementDecomposition],
    ) -> tuple[list[GesnMatch], list[ReasoningItem], dict[int, list[dict]], list[dict]]:
        """Run reasoning for one section: find GESN candidates, ask LLM to choose.

        Returns:
            - matches: GesnMatch list (primary code per item, for backward compat)
            - reasoning_items: ReasoningItem list
            - item_works: dict mapping item_idx -> list of work dicts
            - supplements: list of supplement dicts for this section
        """
        matches: list[GesnMatch] = []
        reasoning_items: list[ReasoningItem] = []
        item_works: dict[int, list[dict]] = {}
        supplements: list[dict] = []

        # Fetch GESN candidates for all items in this section (deterministic)
        conn = sqlite3.connect(self.gesn_db_path)
        conn.row_factory = sqlite3.Row

        items_with_candidates: list[dict] = []
        for idx in section.item_indices:
            item = items[idx]
            candidates = self._find_gesn_candidates(item, conn, section.gesn_collection_hint)
            items_with_candidates.append({
                "item_idx": idx,
                "name": item.name,
                "unit": item.unit,
                "section": item.section,
                "candidates": candidates,
            })

        conn.close()

        # Build LLM prompt with all items + candidates for this section
        user_prompt = self._build_section_prompt(
            section, items_with_candidates, model_summary, decompositions
        )

        # Call LLM — new format returns {items: [...], supplements: [...]}
        try:
            raw_response = await self._llm(_STAGE_C_SYSTEM, user_prompt)
            logger.debug(
                "Stage C raw LLM response for section '%s' (length=%d): %s",
                section.section_name,
                len(raw_response),
                raw_response[:1000],
            )
            parsed_obj = self._parse_stage_c_v3_response(raw_response)
            parsed = parsed_obj.get("items", [])
            supplements = parsed_obj.get("supplements", [])
            if not parsed:
                logger.warning(
                    "Stage C: JSON parsing returned empty for section '%s'. "
                    "Falling back to keyword matching.",
                    section.section_name,
                )
        except Exception as e:
            logger.warning(
                "Stage C LLM call failed for section '%s': %s. "
                "Falling back to keyword matching.",
                section.section_name,
                e,
            )
            parsed = []

        # Convert LLM response into GesnMatch + ReasoningItem + works map
        llm_map = {item["item_idx"]: item for item in parsed}
        cand_map = {d["item_idx"]: d["candidates"] for d in items_with_candidates}

        for item_data in items_with_candidates:
            idx = item_data["item_idx"]
            item = items[idx]
            llm_item = llm_map.get(idx)

            if llm_item and llm_item.get("works"):
                # New v3 format: multiple works per item
                works_list = llm_item["works"]
                confidence_str = llm_item.get("confidence", "MEDIUM")
                conf_value, conf_level = _parse_confidence(confidence_str)

                # Primary work = first in list
                primary = works_list[0]
                gesn_code = primary.get("gesn_code", "")
                reasoning_text = primary.get("reasoning", "")

                # Collect all reasoning texts
                all_reasoning = [
                    f"[{w.get('role', '?')}] {w.get('gesn_code', '?')}: {w.get('reasoning', '')}"
                    for w in works_list
                ]
                combined_reasoning = "\n".join(all_reasoning)

                # Look up GESN name from candidates
                gesn_name, gesn_unit = self._lookup_candidate_name(
                    gesn_code, cand_map.get(idx, [])
                )

                matches.append(GesnMatch(
                    item_idx=idx,
                    gesn_code=gesn_code,
                    gesn_name=gesn_name,
                    gesn_unit=gesn_unit,
                    confidence=conf_value,
                    confidence_level=conf_level,
                    alternatives=[
                        {"gesn_code": w["gesn_code"], "gesn_name": "", "gesn_unit": ""}
                        for w in works_list[1:]
                        if w.get("gesn_code")
                    ][:5],
                    reasoning=combined_reasoning,
                ))

                # Store works for breakdown building
                item_works[idx] = works_list

                # Build ReasoningItem
                ri = ReasoningItem(
                    item_idx=idx,
                    item_name=item.name,
                    reasoning_chain=combined_reasoning,
                    gesn_code=gesn_code,
                    gesn_name=gesn_name,
                    confidence=conf_value,
                    confidence_level=conf_level,
                    generated_items=[
                        {"name": w.get("reasoning", ""), "gesn_code": w.get("gesn_code", "")}
                        for w in works_list[1:]
                    ],
                )

                waste_pct = llm_item.get("waste_pct", 0)
                if waste_pct > 0:
                    ri.adjustments.append(f"Коэффициент отхода: +{waste_pct}%")

                reasoning_items.append(ri)

            elif llm_item and llm_item.get("chosen_gesn"):
                # Legacy v2 format fallback: single chosen_gesn
                gesn_code = llm_item["chosen_gesn"]
                confidence_str = llm_item.get("confidence", "MEDIUM")
                conf_value, conf_level = _parse_confidence(confidence_str)
                reasoning_text = llm_item.get("reasoning", "")
                gesn_name, gesn_unit = self._lookup_candidate_name(
                    gesn_code, cand_map.get(idx, [])
                )

                matches.append(GesnMatch(
                    item_idx=idx,
                    gesn_code=gesn_code,
                    gesn_name=gesn_name,
                    gesn_unit=gesn_unit,
                    confidence=conf_value,
                    confidence_level=conf_level,
                    reasoning=reasoning_text,
                ))

                item_works[idx] = [{"gesn_code": gesn_code, "role": "основная", "reasoning": reasoning_text}]

                ri = ReasoningItem(
                    item_idx=idx,
                    item_name=item.name,
                    reasoning_chain=reasoning_text,
                    gesn_code=gesn_code,
                    gesn_name=gesn_name,
                    confidence=conf_value,
                    confidence_level=conf_level,
                )
                waste_pct = llm_item.get("waste_pct", 0)
                if waste_pct > 0:
                    ri.adjustments.append(f"Коэффициент отхода: +{waste_pct}%")
                reasoning_items.append(ri)

            else:
                # LLM did not provide a choice; fall back to best candidate
                if item_data["candidates"]:
                    best = item_data["candidates"][0]
                    matches.append(GesnMatch(
                        item_idx=idx,
                        gesn_code=best["code"],
                        gesn_name=best["name"],
                        gesn_unit=best["unit"],
                        confidence=0.3,
                        confidence_level="red",
                        reasoning="AI не смог сделать уверенный выбор; подобрано автоматически",
                    ))
                    item_works[idx] = [{"gesn_code": best["code"], "role": "основная", "reasoning": "авто"}]
                else:
                    matches.append(GesnMatch(
                        item_idx=idx,
                        gesn_code="",
                        gesn_name="",
                        gesn_unit="",
                        confidence=0.0,
                        confidence_level="red",
                        reasoning="Не найдено подходящих кодов ГЭСН",
                    ))

                reasoning_items.append(ReasoningItem(
                    item_idx=idx,
                    item_name=item.name,
                    reasoning_chain="AI не предоставил обоснование для этой позиции.",
                    confidence=0.0,
                    confidence_level="red",
                ))

        return matches, reasoning_items, item_works, supplements

    def _lookup_candidate_name(
        self, gesn_code: str, candidates: list[dict]
    ) -> tuple[str, str]:
        """Look up GESN name and unit from candidate list."""
        for cand in candidates:
            if cand["code"] == gesn_code:
                return cand["name"], cand["unit"]
        # Fallback: look up from DB
        try:
            conn = sqlite3.connect(self.gesn_db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name, measure_unit FROM works WHERE code = ? LIMIT 1",
                (gesn_code,),
            )
            row = cursor.fetchone()
            conn.close()
            if row:
                return row["name"] or "", row["measure_unit"] or ""
        except Exception:
            pass
        return "", ""

    # ===================================================================
    # Stage E: Resource breakdown + reasoning
    # ===================================================================

    def _build_breakdowns(
        self,
        items: list[VorItem],
        item_works_map: dict[int, list[dict]],
        matches: list[GesnMatch],
    ) -> list[PositionBreakdown]:
        """Build PositionBreakdown for each VOR item using works from Stage C."""
        from vor.pricer import build_work_breakdown

        match_map = {m.item_idx: m for m in matches}
        breakdowns: list[PositionBreakdown] = []

        for idx, item in enumerate(items):
            works_data = item_works_map.get(idx, [])
            match = match_map.get(idx)
            quantity = item.quantity or 0.0

            work_breakdowns: list[WorkBreakdown] = []
            for wd in works_data:
                gesn_code = wd.get("gesn_code", "")
                if not gesn_code:
                    continue
                try:
                    wb = build_work_breakdown(
                        gesn_code=gesn_code,
                        work_quantity=quantity,
                        gesn_db_path=self.gesn_db_path,
                    )
                    wb.reasoning = wd.get("reasoning", "")
                    work_breakdowns.append(wb)
                except Exception as e:
                    logger.warning("Failed to build breakdown for %s: %s", gesn_code, e)

            total_cost = sum(w.total_cost for w in work_breakdowns)

            breakdowns.append(PositionBreakdown(
                item_idx=idx,
                item_name=item.name,
                unit=item.unit,
                quantity=quantity,
                works=work_breakdowns,
                total_cost=round(total_cost, 2),
                confidence=match.confidence if match else 0.0,
                confidence_level=match.confidence_level if match else "red",
            ))

        return breakdowns

    def _build_supplement_breakdown(
        self,
        supplement: dict,
        items: list[VorItem],
    ) -> PositionBreakdown | None:
        """Build a PositionBreakdown for a supplement (допник) item."""
        from vor.pricer import build_work_breakdown

        gesn_code = supplement.get("gesn_code", "")
        name = supplement.get("name", "")
        if not gesn_code and not name:
            return None

        reasoning = supplement.get("reasoning", "")
        unit = supplement.get("unit", "")
        quantity_note = supplement.get("quantity_note", "")

        work_breakdowns: list[WorkBreakdown] = []
        if gesn_code:
            try:
                # Use quantity 1.0 as placeholder; quantity_note explains how to calculate
                wb = build_work_breakdown(
                    gesn_code=gesn_code,
                    work_quantity=1.0,
                    gesn_db_path=self.gesn_db_path,
                )
                wb.reasoning = reasoning
                work_breakdowns.append(wb)
            except Exception as e:
                logger.warning("Failed to build supplement breakdown for %s: %s", gesn_code, e)

        total_cost = sum(w.total_cost for w in work_breakdowns)

        return PositionBreakdown(
            item_idx=-1,  # Not linked to an existing VOR item
            item_name=f"ДОПНИК: {name}",
            unit=unit,
            quantity=0.0,
            works=work_breakdowns,
            total_cost=round(total_cost, 2),
            comment=f"{reasoning}. {quantity_note}".strip(". "),
            is_supplement=True,
            supplement_reason=reasoning,
            confidence=0.5,
            confidence_level="yellow",
        )

    async def _stage_e(
        self,
        section: VorSection,
        items: list[VorItem],
        breakdowns: list[PositionBreakdown],
    ) -> None:
        """Run resource reasoning for one section.

        LLM classifies materials (main/auxiliary), checks completeness,
        and writes comments. Modifies breakdowns in place.
        """
        # Collect breakdowns for this section
        section_breakdowns = [
            b for b in breakdowns
            if b.item_idx in section.item_indices and b.works
        ]
        if not section_breakdowns:
            return

        # Build prompt with resources for each position
        lines: list[str] = []
        lines.append(f"## Раздел: {section.section_name}\n")

        for bd in section_breakdowns:
            lines.append(f"### Позиция {bd.item_idx + 1}: {bd.item_name} ({bd.unit}, кол-во: {bd.quantity})")
            for wb in bd.works:
                lines.append(f"\nРабота: {wb.gesn_code} — {wb.gesn_name}")
                lines.append("Ресурсы из базы:")
                all_resources = wb.labor_lines + wb.materials + wb.machinery
                for rl in all_resources:
                    price_str = f"{rl.unit_price:.2f}₽" if rl.price_found else "цена не найдена"
                    lines.append(
                        f"  - [{rl.resource_type}] {rl.resource_code}: {rl.name} "
                        f"| {rl.measure_unit} | норма: {rl.norm_quantity} | {price_str}"
                    )
            lines.append("")

        user_prompt = "\n".join(lines)

        try:
            raw_response = await self._llm(_STAGE_E_SYSTEM, user_prompt)
            parsed = self._parse_json_response(raw_response)
            positions = parsed.get("positions", [])
        except Exception as e:
            logger.warning("Stage E LLM call failed for section '%s': %s", section.section_name, e)
            return

        # Apply LLM classification and comments
        pos_map = {p["item_idx"]: p for p in positions if isinstance(p, dict)}

        for bd in section_breakdowns:
            pos_data = pos_map.get(bd.item_idx)
            if not pos_data:
                continue

            # Apply material classification
            classification = pos_data.get("material_classification", {})
            for wb in bd.works:
                for rl in wb.materials:
                    cls = classification.get(rl.resource_code, "")
                    if cls in ("основной", "main"):
                        rl.is_main = True
                    elif cls in ("вспомогательный", "auxiliary", "aux"):
                        rl.is_main = False

            # Set comment
            comment = pos_data.get("comment", "")
            if comment:
                bd.comment = comment

    # ===================================================================
    # Stage D: Cross-check
    # ===================================================================

    async def _stage_d(
        self,
        items: list[VorItem],
        matches: list[GesnMatch],
        findings: list[Finding],
        model_summary: ModelSummary,
    ) -> str:
        """Have the LLM review the complete result for consistency."""
        # Build summary of what was matched
        summary_lines: list[str] = []
        match_map = {m.item_idx: m for m in matches}
        for i, item in enumerate(items):
            m = match_map.get(i)
            code = m.gesn_code if m else "—"
            conf = m.confidence_level if m else "—"
            qty = item.quantity if item.quantity else "—"
            summary_lines.append(
                f"  {i + 1}. {item.name} | {item.unit} | кол-во: {qty} | "
                f"ГЭСН: {code} | уверенность: {conf}"
            )

        # Summarize findings
        finding_lines = []
        for f in findings:
            finding_lines.append(f"- [{f.severity.value}] {f.title}: {f.description[:120]}")

        user_prompt = (
            "## Сводка ВОР\n"
            + "\n".join(summary_lines)
            + f"\n\n## Модель\nВысота: {model_summary.building_height_m:.1f} м, "
            f"элементов: {model_summary.total_elements}, "
            f"подземных уровней: {len(model_summary.below_grade_levels)}\n"
            f"\n## Уже обнаруженные проблемы ({len(findings)}):\n"
            + "\n".join(finding_lines[:15])
            + f"\n\nВсего позиций: {len(items)}, подобрано расценок: {len(matches)}"
        )

        try:
            result = await self._llm(_STAGE_D_SYSTEM, user_prompt)
            return result
        except Exception as e:
            logger.warning("Stage D LLM call failed: %s", e)
            return f"(Не удалось выполнить перепроверку: {e})"

    # ===================================================================
    # Helper methods
    # ===================================================================

    def _find_gesn_candidates(
        self,
        item: VorItem,
        conn: sqlite3.Connection,
        collection_hint: str = "",
    ) -> list[dict]:
        """Find top GESN candidates for a VOR item.

        Uses keyword search from the existing matcher, but with optional
        collection hint to narrow the search.  Returns up to 8 candidates.
        """
        import re as _re
        from vor.matcher import _stem_russian, _STOP_WORDS, _GESN_CODE_RE

        cursor = conn.cursor()

        # Strategy 1: Exact code extraction
        m = _GESN_CODE_RE.search(item.name)
        if m:
            code = m.group(1)
            cursor.execute(
                """SELECT w.code, w.name, w.measure_unit
                   FROM works w WHERE w.code = ? LIMIT 1""",
                (code,),
            )
            row = cursor.fetchone()
            if row:
                return [{"code": row["code"], "name": row["name"] or "", "unit": row["measure_unit"] or ""}]

        # Strategy 2: Keyword search with collection hint
        raw_words = _re.findall(r"[а-яёА-ЯЁa-zA-Z0-9]+", item.name)
        stems = []
        for w in raw_words:
            low = w.lower()
            if low in _STOP_WORDS or len(low) < 3:
                continue
            stems.append(_stem_russian(low))

        if not stems:
            return []

        like_clauses = " OR ".join(["w.name LIKE ?"] * len(stems))
        params: list[str] = [f"%{s}%" for s in stems]

        # Optionally filter by collection
        collection_filter = ""
        if collection_hint:
            # Support multi-collection hints like "16-17"
            codes = [c.strip() for c in collection_hint.split("-") if c.strip().isdigit()]
            if codes:
                placeholders = ",".join("?" * len(codes))
                collection_filter = f" AND w.collection_code IN ({placeholders})"
                params.extend(codes)

        query = f"""
            SELECT DISTINCT w.code, w.name, w.measure_unit
            FROM works w
            WHERE w.name != '' AND ({like_clauses}){collection_filter}
            LIMIT 300
        """
        cursor.execute(query, params)
        rows = cursor.fetchall()

        if not rows:
            # Retry without collection filter
            if collection_filter:
                query_fallback = f"""
                    SELECT DISTINCT w.code, w.name, w.measure_unit
                    FROM works w
                    WHERE w.name != '' AND ({like_clauses})
                    LIMIT 300
                """
                cursor.execute(query_fallback, [f"%{s}%" for s in stems])
                rows = cursor.fetchall()

        if not rows:
            return []

        # Score candidates
        scored: list[dict] = []
        for row in rows:
            row_name_lower = (row["name"] or "").lower()
            hits = sum(1 for s in stems if s in row_name_lower)
            score = hits / len(stems) if stems else 0.0
            scored.append({
                "code": row["code"],
                "name": row["name"] or "",
                "unit": row["measure_unit"] or "",
                "score": score,
            })

        scored.sort(key=lambda c: (-c["score"], c["code"]))
        return scored[:8]

    def _build_section_prompt(
        self,
        section: VorSection,
        items_with_candidates: list[dict],
        model_summary: ModelSummary,
        decompositions: list[ElementDecomposition],
    ) -> str:
        """Build the user prompt for Stage C LLM call."""
        lines: list[str] = []
        lines.append(f"## Раздел: {section.section_name}")

        if section.gesn_collection_hint:
            lines.append(f"Сборник ГЭСН: {section.gesn_collection_hint}")

        # Model context relevant to this section
        if model_summary.wall_types and any(
            kw in section.section_name.lower()
            for kw in ("стен", "кладк", "перегород")
        ):
            lines.append(f"\nТипы стен в модели ({len(model_summary.wall_types)}):")
            for wt in model_summary.wall_types[:10]:
                lines.append(f"  - {wt['type_name']} ({wt['count']} шт)")

        # Decompositions relevant to this section
        if decompositions:
            lines.append("\nМногослойные стены:")
            for d in decompositions:
                layer_desc = " + ".join(
                    f"{l.material} {l.thickness_mm:.0f}мм" for l in d.layers
                )
                lines.append(f"  - {d.source_type_name}: {layer_desc} ({d.instance_count} шт)")

        lines.append(f"\n## Позиции ({len(items_with_candidates)}):\n")

        for item_data in items_with_candidates:
            idx = item_data["item_idx"]
            lines.append(f"### Позиция {idx + 1}: {item_data['name']}")
            lines.append(f"Единица: {item_data['unit']}")

            if item_data["candidates"]:
                lines.append("Кандидаты ГЭСН:")
                for c in item_data["candidates"][:5]:
                    lines.append(
                        f"  - {c['code']}: {c['name'][:80]} [{c['unit']}] "
                        f"(score: {c.get('score', 0):.2f})"
                    )
            else:
                lines.append("Кандидаты ГЭСН: НЕ НАЙДЕНЫ")
            lines.append("")

        return "\n".join(lines)

    def _parse_stage_c_response(self, raw: str) -> list[dict]:
        """Parse the LLM Stage C JSON response.

        Tolerant of markdown code fences and minor formatting issues.
        Uses a multi-strategy approach that never crashes:
          1. Try json.loads on cleaned text
          2. Try extracting JSON from markdown code blocks (```json ... ```)
          3. Try regex to find array pattern [...]
          4. If ALL fail, log warning and return empty list (caller falls back
             to keyword matching)
        """
        import re

        text = raw.strip()

        # --- Strategy 1: Strip markdown fences and try direct parse ---
        cleaned = text
        if cleaned.startswith("```"):
            # Remove opening fence (may be ```json, ```, etc.)
            first_newline = cleaned.find("\n")
            if first_newline > 0:
                cleaned = cleaned[first_newline + 1:]
            # Remove closing fence
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()

        try:
            result = json.loads(cleaned)
            if isinstance(result, list):
                return result
            elif isinstance(result, dict):
                # Maybe the LLM wrapped in an object
                for key in ("items", "results", "positions"):
                    if key in result and isinstance(result[key], list):
                        return result[key]
                return [result]
        except (json.JSONDecodeError, ValueError):
            pass

        # --- Strategy 2: Extract from markdown code blocks ---
        code_block_match = re.search(
            r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL
        )
        if code_block_match:
            try:
                block_text = code_block_match.group(1).strip()
                result = json.loads(block_text)
                if isinstance(result, list):
                    return result
                elif isinstance(result, dict):
                    for key in ("items", "results", "positions"):
                        if key in result and isinstance(result[key], list):
                            return result[key]
                    return [result]
            except (json.JSONDecodeError, ValueError):
                pass

        # --- Strategy 3: Regex to find array pattern [...] ---
        array_match = re.search(r'\[.*\]', text, re.DOTALL)
        if array_match:
            try:
                result = json.loads(array_match.group(0))
                if isinstance(result, list):
                    return result
            except (json.JSONDecodeError, ValueError):
                pass

        # --- All strategies failed ---
        logger.warning(
            "Failed to parse Stage C response as JSON (length=%d). "
            "Raw response (first 500 chars): %s",
            len(raw),
            raw[:500],
        )
        return []

    def _parse_stage_c_v3_response(self, raw: str) -> dict:
        """Parse the v3 Stage C response: {items: [...], supplements: [...]}.

        Falls back to v2 format (plain array) if the response is a list.
        """
        parsed = self._parse_json_response(raw)

        if isinstance(parsed, dict):
            # Expected v3 format
            if "items" in parsed:
                return parsed
            # Maybe wrapped differently
            for key in ("positions", "results"):
                if key in parsed and isinstance(parsed[key], list):
                    return {"items": parsed[key], "supplements": parsed.get("supplements", [])}
            # Single item?
            if "item_idx" in parsed:
                return {"items": [parsed], "supplements": []}
            return parsed

        if isinstance(parsed, list):
            # v2 fallback: plain array of items
            return {"items": parsed, "supplements": []}

        return {"items": [], "supplements": []}

    def _parse_json_response(self, raw: str) -> dict | list:
        """Generic JSON response parser with markdown fence handling."""
        import re

        text = raw.strip()

        # Strategy 1: Strip markdown fences
        cleaned = text
        if cleaned.startswith("```"):
            first_newline = cleaned.find("\n")
            if first_newline > 0:
                cleaned = cleaned[first_newline + 1:]
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()

        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            pass

        # Strategy 2: Extract from markdown code blocks
        code_block_match = re.search(
            r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL
        )
        if code_block_match:
            try:
                return json.loads(code_block_match.group(1).strip())
            except (json.JSONDecodeError, ValueError):
                pass

        # Strategy 3: Find JSON object or array
        for pattern in [r'\{.*\}', r'\[.*\]']:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(0))
                except (json.JSONDecodeError, ValueError):
                    pass

        logger.warning("Failed to parse JSON response (length=%d)", len(raw))
        return {}

    def _format_model_summary(self, summary: ModelSummary) -> str:
        """Format ModelSummary into a compact text for LLM prompts."""
        lines: list[str] = []
        lines.append(f"Элементов: {summary.total_elements}")

        if summary.levels:
            level_names = [f"{l['name']} ({l['elevation_m']:+.2f}м)" for l in summary.levels]
            lines.append(f"Уровни ({len(summary.levels)}): {', '.join(level_names)}")

        if summary.below_grade_levels:
            lines.append(f"Подземные уровни: {', '.join(summary.below_grade_levels)}")

        if summary.building_height_m > 0:
            lines.append(f"Высота здания: ~{summary.building_height_m:.1f} м")

        if summary.wall_types:
            lines.append(f"Типов стен: {len(summary.wall_types)}")
            for wt in summary.wall_types[:5]:
                lines.append(f"  - {wt['type_name']} ({wt['count']} шт)")

        if summary.window_count:
            lines.append(f"Окон: {summary.window_count}")
        if summary.door_count:
            lines.append(f"Дверей: {summary.door_count}")

        cat_str = ", ".join(
            f"{k}: {v}" for k, v in sorted(
                summary.categories_summary.items(),
                key=lambda x: -x[1],
            )[:8]
        )
        if cat_str:
            lines.append(f"Категории: {cat_str}")

        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


@dataclass
class ReasoningResult:
    """Output of the ReasoningEngine.run() method."""

    matches: list[GesnMatch] = field(default_factory=list)
    reasoning_items: list[ReasoningItem] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    vor_plan: str = ""
    cross_check: str = ""
    elapsed_seconds: float = 0.0
    breakdowns: list[PositionBreakdown] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Confidence parsing helper
# ---------------------------------------------------------------------------


def _parse_confidence(level_str: str) -> tuple[float, str]:
    """Convert LLM confidence string to numeric + level."""
    s = level_str.strip().upper()
    if s in ("HIGH", "ВЫСОКАЯ", "ВЫСОК"):
        return 0.85, "green"
    elif s in ("MEDIUM", "СРЕДНЯЯ", "СРЕДН"):
        return 0.55, "yellow"
    elif s in ("LOW", "НИЗКАЯ", "НИЗК"):
        return 0.25, "red"
    else:
        # Try to parse as a number
        try:
            v = float(s)
            if v > 1:
                v = v / 100  # Percent to fraction
            if v >= 0.7:
                return v, "green"
            elif v >= 0.4:
                return v, "yellow"
            else:
                return v, "red"
        except (ValueError, TypeError):
            return 0.5, "yellow"


# ===========================================================================
# Public prompt constants for multi-agent reuse
# ===========================================================================

STAGE_A_SYSTEM = _STAGE_A_SYSTEM
STAGE_C_SYSTEM = _STAGE_C_SYSTEM
STAGE_D_SYSTEM = _STAGE_D_SYSTEM
STAGE_E_SYSTEM = _STAGE_E_SYSTEM


# ===========================================================================
# Public helper functions for multi-agent reuse
# ===========================================================================


def find_gesn_candidates(
    item: VorItem,
    conn: sqlite3.Connection,
    collection_hint: str = "",
) -> list[dict]:
    """Find GESN candidates for a VOR item. Public wrapper.

    Delegates to the same logic as ``ReasoningEngine._find_gesn_candidates``.
    The private method does not use any instance state, so we can call it
    on a lightweight throwaway instance.
    """
    # _find_gesn_candidates only uses self for method dispatch, not self state.
    # Create a minimal instance to call the method.
    engine = object.__new__(ReasoningEngine)
    return engine._find_gesn_candidates(item, conn, collection_hint)


def parse_stage_c_response(raw_response: str) -> dict:
    """Parse a Stage C v3 LLM response into ``{items: [...], supplements: [...]}``.

    Public wrapper around ``ReasoningEngine._parse_stage_c_v3_response``.
    This is a pure-function (no instance state needed).
    """
    engine = object.__new__(ReasoningEngine)
    return engine._parse_stage_c_v3_response(raw_response)


def build_breakdowns(
    items: list[VorItem],
    item_works_map: dict[int, list[dict]],
    matches: list[GesnMatch],
    gesn_db_path: str,
) -> list[PositionBreakdown]:
    """Build ``PositionBreakdown`` list for VOR items. Public wrapper.

    Delegates to ``ReasoningEngine._build_breakdowns``.

    Parameters
    ----------
    gesn_db_path:
        Path to the GESN SQLite database (replaces ``self.gesn_db_path``).
    """
    engine = object.__new__(ReasoningEngine)
    engine.gesn_db_path = gesn_db_path
    return engine._build_breakdowns(items, item_works_map, matches)


def build_section_prompt(
    section: VorSection,
    items_with_candidates: list[dict],
    model_summary: ModelSummary,
    decompositions: list[ElementDecomposition],
) -> str:
    """Build the user prompt for a Stage C LLM call. Public wrapper.

    Delegates to ``ReasoningEngine._build_section_prompt``.
    This is a pure-function (no instance state needed).
    """
    engine = object.__new__(ReasoningEngine)
    return engine._build_section_prompt(
        section, items_with_candidates, model_summary, decompositions
    )


def build_supplement_breakdown(
    supplement: dict,
    items: list[VorItem],
    gesn_db_path: str,
) -> PositionBreakdown | None:
    """Build a ``PositionBreakdown`` for a supplement (допник) item. Public wrapper.

    Delegates to ``ReasoningEngine._build_supplement_breakdown``.

    Parameters
    ----------
    gesn_db_path:
        Path to the GESN SQLite database (replaces ``self.gesn_db_path``).
    """
    engine = object.__new__(ReasoningEngine)
    engine.gesn_db_path = gesn_db_path
    return engine._build_supplement_breakdown(supplement, items)

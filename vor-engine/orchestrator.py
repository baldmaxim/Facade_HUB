"""Multi-agent orchestrator for VOR pricing.

Coordinates parallel expert agents, each specializing in a construction domain.
Follows the same pipeline as ReasoningEngine but distributes Stage C to experts.
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

from vor.models import (
    AgentResult,
    ExpertDomain,
    Finding,
    FindingCategory,
    FindingSeverity,
    GesnMatch,
    PositionBreakdown,
    ReasoningItem,
    VorItem,
    VorSection,
)
from vor.analyzer import (
    ModelSummary,
    analyze_model_passport,
    detect_implicit_work,
    detect_multi_layer_walls,
    detect_unit_mismatches,
)
from vor.agents.classifier import classify_items
from vor.agents.registry import ExpertRegistry
from vor.config import VorConfig, default_config
from vor.providers.base import PriceProvider
from vor.reasoning import (
    STAGE_A_SYSTEM,
    STAGE_D_SYSTEM,
    ReasoningResult,
)

logger = logging.getLogger(__name__)

LlmCallback = Callable[[str, str], Coroutine[Any, Any, str]]
ProgressCallback = Callable[[str, float, str], None]


class MultiAgentOrchestrator:
    """Coordinates multi-agent VOR pricing.

    Pipeline:
    1. Pre-analysis (deterministic) -- detect multi-layer walls, implicit work
    2. Stage A -- LLM understands VOR (1 call)
    3. Classify sections to expert domains
    4. Dispatch to experts in parallel (asyncio.gather)
    5. Merge expert results
    6. Stage D -- cross-check with expert provenance (1 LLM call)
    7. Return ReasoningResult (same interface as ReasoningEngine)
    """

    def __init__(
        self,
        provider: PriceProvider,
        llm_callback: LlmCallback,
        config: VorConfig | None = None,
        project_root: str | Path | None = None,
    ):
        self._provider = provider
        self._llm = llm_callback
        self._config = config or default_config()
        self._project_root = project_root
        self._registry = ExpertRegistry(
            provider=provider,
            llm_callback=llm_callback,
            config=self._config,
            project_root=project_root,
        )

    async def run(
        self,
        items: list[VorItem],
        model_passport: Optional[dict[str, Any]] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> ReasoningResult:
        """Execute multi-agent VOR pricing pipeline."""
        start = time.monotonic()
        findings: list[Finding] = []
        all_matches: list[GesnMatch] = []
        all_reasoning: list[ReasoningItem] = []
        all_breakdowns: list[PositionBreakdown] = []
        all_supplements: list[dict] = []
        all_item_works: dict[int, list[dict]] = {}

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # --- 1. Pre-analysis (deterministic) ---
        _progress("analyzing", 0.05, "Анализирую ВОР...")
        model_summary = (
            analyze_model_passport(model_passport) if model_passport else ModelSummary()
        )
        decompositions = detect_multi_layer_walls(model_summary.wall_types)
        for decomp in decompositions:
            findings.append(Finding(
                category=FindingCategory.MULTI_LAYER,
                severity=FindingSeverity.INFO,
                title=f"Многослойная стена: {decomp.source_type_name}",
                description=(
                    f"Тип стены «{decomp.source_type_name}» содержит "
                    f"{len(decomp.layers)} слоёв: "
                    + ", ".join(
                        f"{l.material} {l.thickness_mm:.0f}мм ({l.function})"
                        for l in decomp.layers
                    )
                    + f". Количество: {decomp.instance_count} шт."
                ),
                suggested_action="Декомпозировать на отдельные позиции по слоям",
            ))
        implicit_findings = detect_implicit_work(model_summary, items)
        findings.extend(implicit_findings)

        # --- 2. Stage A: Understand VOR ---
        _progress("stage_a", 0.10, "AI анализирует ВОР...")
        vor_plan = await self._stage_a(items, model_summary)

        # --- 3. Classify individual items to domains ---
        _progress("classifying", 0.15, "LLM классифицирует позиции...")
        from vor.agents.classifier import admit_items_llm
        allowed_domains = {ExpertDomain(d) for d in self._config.active_domains} if self._config.active_domains else None
        _, admission_decisions, assignments = await admit_items_llm(
            items, self._llm, allowed_domains=allowed_domains
        )
        admitted_count = sum(1 for decision in admission_decisions.values() if decision.admit)
        rejected_count = len(admission_decisions) - admitted_count
        domain_names = [
            f"{d.value}({len(idxs)})" for d, idxs in assignments.items()
        ]
        logger.info(
            "Item assignments: %s | admitted=%d rejected=%d",
            ", ".join(domain_names),
            admitted_count,
            rejected_count,
        )

        # --- 3b. Filter to active domains if configured ---
        active_domains_cfg = self._config.active_domains
        if active_domains_cfg:
            active_set = set()
            for d_name in active_domains_cfg:
                try:
                    active_set.add(ExpertDomain(d_name))
                except ValueError:
                    logger.warning("Unknown active_domain: %r, ignoring", d_name)
            filtered = {d: idxs for d, idxs in assignments.items() if d in active_set}
            skipped_count = sum(
                len(idxs) for d, idxs in assignments.items() if d not in active_set
            )
            if skipped_count:
                skipped_domains = [
                    d.value for d in assignments if d not in active_set
                ]
                logger.info(
                    "Active domains filter (v4): keeping %s, skipping %d items "
                    "from disabled domains %s",
                    [d.value for d in filtered],
                    skipped_count,
                    skipped_domains,
                )
            assignments = filtered

        # --- 4. Dispatch to experts in parallel ---
        _progress("experts", 0.20, f"Запускаю {len(assignments)} экспертов...")
        agent_results = await self._dispatch_parallel(
            assignments, items, model_summary, decompositions, _progress,
            admission_decisions=admission_decisions,
        )

        # --- 5. Merge results ---
        _progress("merging", 0.75, "Объединяю результаты экспертов...")
        for result in agent_results:
            all_matches.extend(result.matches)
            all_reasoning.extend(result.reasoning_items)
            findings.extend(result.findings)
            all_breakdowns.extend(result.breakdowns)
            all_supplements.extend(result.supplements)
            for idx, works in result.item_works.items():
                if idx in all_item_works:
                    logger.warning(
                        "Item idx=%d already has works from another expert, "
                        "keeping existing (first expert wins)", idx,
                    )
                else:
                    all_item_works[idx] = works

        # Sort by item_idx for consistent output
        all_matches.sort(key=lambda m: m.item_idx)
        all_reasoning.sort(key=lambda r: r.item_idx)
        all_breakdowns.sort(key=lambda b: b.item_idx)

        # Detect unit mismatches
        match_dicts = [
            {"item_idx": m.item_idx, "gesn_unit": m.gesn_unit}
            for m in all_matches
        ]
        unit_findings = detect_unit_mismatches(items, match_dicts)
        findings.extend(unit_findings)

        # Link findings to reasoning items
        for fi, finding in enumerate(findings):
            for ri in all_reasoning:
                if ri.item_idx in finding.affected_items:
                    ri.finding_refs.append(fi)

        # --- 6. Stage D: Cross-check ---
        _progress("stage_d", 0.85, "AI перепроверяет результат...")
        cross_check = await self._stage_d_enhanced(
            items, all_matches, findings, model_summary, assignments
        )

        elapsed = time.monotonic() - start
        _progress("done", 1.0, f"Анализ завершён за {elapsed:.0f} сек")

        return ReasoningResult(
            matches=all_matches,
            reasoning_items=all_reasoning,
            findings=findings,
            vor_plan=vor_plan,
            cross_check=cross_check,
            elapsed_seconds=round(elapsed, 1),
            breakdowns=all_breakdowns,
        )

    # ===================================================================
    # V5: Two-cycle pricing pipeline (Redesign v3)
    # ===================================================================

    async def run_v5(
        self,
        excel_bytes: bytes,
        items: list[VorItem],
        model_passport: Optional[dict[str, Any]] = None,
        on_progress: Optional[ProgressCallback] = None,
        on_section_complete=None,
    ) -> list["PricedSection"]:
        """Execute V5 multi-agent VOR pricing pipeline.

        Uses process_v5() on each expert (two-cycle pricing) and returns
        a list of PricedSection instead of ReasoningResult.

        Args:
            excel_bytes: Original Excel bytes (passed through, unused here
                         but included in the API for future use).
            items: Parsed VorItem list.
            model_passport: Optional model passport dict.
            on_progress: Optional progress callback.

        Returns:
            List of PricedSection objects from all experts.
        """
        from vor.models import PricedSection

        start = time.monotonic()

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # --- 1. Pre-analysis ---
        _progress("analyzing", 0.05, "Анализирую ВОР (v5)...")
        model_summary = (
            analyze_model_passport(model_passport) if model_passport else ModelSummary()
        )

        # Stage A removed for V5: each expert has its own encyclopedia and
        # the composition cycle does its own analysis, so a global LLM plan
        # adds latency and tokens without benefit.

        # --- 2. Classify individual items to domains ---
        _progress("classifying", 0.10, "LLM классифицирует позиции...")
        from vor.agents.classifier import admit_items_llm, classify_items
        admission_decisions: dict[int, Any] = {}
        try:
            allowed_domains = {ExpertDomain(d) for d in self._config.active_domains} if self._config.active_domains else None
            _, admission_decisions, assignments = await admit_items_llm(
                items, self._llm, allowed_domains=allowed_domains
            )
        except Exception as e:
            logger.error("Classifier crashed: %s. Using keyword fallback.", e)
            allowed_domains = {ExpertDomain(d) for d in self._config.active_domains} if self._config.active_domains else None
            assignments = classify_items(items, allowed_domains=allowed_domains)
        admitted_count = sum(1 for decision in admission_decisions.values() if decision.admit)
        rejected_count = len(admission_decisions) - admitted_count
        domain_names = [
            f"{d.value}({len(idxs)})" for d, idxs in assignments.items()
        ]
        logger.info(
            "V5 item assignments: %s | admitted=%d rejected=%d",
            ", ".join(domain_names),
            admitted_count,
            rejected_count,
        )

        # --- 2b. Filter to active domains if configured ---
        active_domains_cfg = self._config.active_domains
        if active_domains_cfg:
            active_set = set()
            for d_name in active_domains_cfg:
                try:
                    active_set.add(ExpertDomain(d_name))
                except ValueError:
                    logger.warning("Unknown active_domain: %r, ignoring", d_name)
            filtered = {d: idxs for d, idxs in assignments.items() if d in active_set}
            skipped_count = sum(
                len(idxs) for d, idxs in assignments.items() if d not in active_set
            )
            if skipped_count:
                skipped_domains = [
                    d.value for d in assignments if d not in active_set
                ]
                logger.info(
                    "Active domains filter: keeping %s, skipping %d items "
                    "from disabled domains %s",
                    [d.value for d in filtered],
                    skipped_count,
                    skipped_domains,
                )
            assignments = filtered

        # --- 3. Dispatch experts in parallel with process_v5() ---
        # Send classification_done BEFORE the experts progress (must be monotonic)
        total_classified = sum(len(idxs) for idxs in assignments.values())
        _progress(
            "classification_done", 0.15,
            f"Классификация завершена: {len(assignments)} доменов, "
            f"{total_classified} позиций. Запуск расценки...",
        )
        # Notify dashboard about section assignments WITH position names and preview
        if on_section_complete:
            try:
                assignments_detail = {}
                for d, idxs in assignments.items():
                    valid_positions = [
                        {"idx": i, "name": items[i].name[:80], "unit": items[i].unit}
                        for i in idxs if i < len(items)
                    ]
                    assignments_detail[d.value] = {
                        "count": len(idxs),
                        "positions": valid_positions,
                        "preview": [p["name"] for p in valid_positions[:5]],
                        "domain_label": d.value,
                        "total_classified": total_classified,
                    }
                on_section_complete("__sections__", None, None, None,
                                    assignments=assignments_detail)
            except Exception:
                pass
        _progress("experts", 0.20, f"Запускаю {len(assignments)} экспертов (v5)...")

        priced_sections = await self._dispatch_parallel_v5(
            assignments, items, model_summary, _progress,
            admission_decisions=admission_decisions,
            on_section_complete=on_section_complete,
        )

        elapsed = time.monotonic() - start
        total_positions = sum(len(s.positions) for s in priced_sections)
        _progress(
            "done", 1.0,
            f"V5 анализ завершён за {elapsed:.0f} сек: "
            f"{total_positions} позиций в {len(priced_sections)} разделах",
        )
        logger.info(
            "V5 orchestrator complete: %d sections, %d positions, %.1fs",
            len(priced_sections), total_positions, elapsed,
        )

        return priced_sections

    async def _dispatch_parallel_v5(
        self,
        assignments: dict[ExpertDomain, list[int]],
        items: list[VorItem],
        model_summary: ModelSummary,
        _progress: ProgressCallback,
        admission_decisions: dict[int, Any] | None = None,
        on_section_complete=None,
    ) -> list["PricedSection"]:
        """Run all experts in parallel using process_v5(). Failed experts
        produce empty PricedSection with error in verification report.

        Each expert wrapper reports progress immediately on completion
        (not deferred until after gather returns).
        """
        from vor.models import PricedSection, VerificationReport

        domain_list = list(assignments.keys())
        total = len(domain_list)

        completed = {"count": 0}  # mutable container for monotonic progress

        async def _run_expert_v5(
            expert, domain: ExpertDomain, indices: list[int], idx: int,
        ) -> PricedSection:
            """Wrapper: run a single expert, report progress on completion,
            and convert exceptions into fallback PricedSection."""
            try:
                if admission_decisions is not None:
                    result = await expert.process_v5(
                        indices, items, model_summary,
                        admission_decisions=admission_decisions,
                    )
                else:
                    result = await expert.process_v5(indices, items, model_summary)
            except Exception as exc:
                logger.error("Expert %s (v5) failed: %s", domain.value, exc)
                result = PricedSection(
                    domain=domain,
                    positions=[],
                    section_total_formula="",
                    verification=VerificationReport(
                        section_total=0.0,
                        market_range=(0.0, 0.0),
                        red_flags=[
                            f"Эксперт {domain.value} не смог обработать: {exc}"
                        ],
                        coverage_pct=0.0,
                        passed=False,
                    ),
                )

            # Report progress immediately when this expert finishes
            completed["count"] += 1
            pct = 0.20 + 0.60 * (completed["count"] / total)
            _progress("experts", pct, f"Эксперт {domain.value} (v5) завершил")

            # Notify caller with section result for live dashboard
            if on_section_complete:
                try:
                    on_section_complete(domain.value, result, indices, items)
                except Exception:
                    pass

            return result

        tasks = []
        for idx, (domain, indices) in enumerate(assignments.items()):
            expert = self._registry.create_expert(domain)
            tasks.append(_run_expert_v5(expert, domain, indices, idx))

        priced_sections: list[PricedSection] = list(
            await asyncio.gather(*tasks)
        )

        return priced_sections

    # ===================================================================
    # Stage A: same as ReasoningEngine
    # ===================================================================

    async def _stage_a(
        self, items: list[VorItem], model_summary: ModelSummary
    ) -> str:
        """Generate high-level VOR plan (1 LLM call)."""
        vor_lines: list[str] = []
        current_section = ""
        for i, item in enumerate(items):
            if item.section != current_section:
                current_section = item.section
                vor_lines.append(f"\n### {current_section}")
            vor_lines.append(f"  {i + 1}. {item.name} [{item.unit}]")

        model_text = self._format_model_summary(model_summary)
        user_prompt = (
            "## ВОР (Ведомость объёмов работ)\n"
            + "\n".join(vor_lines)
            + f"\n\n## Модель здания\n{model_text}"
            + f"\n\nВсего позиций: {len(items)}"
        )

        try:
            return await self._llm(STAGE_A_SYSTEM, user_prompt)
        except Exception as e:
            logger.warning("Stage A failed: %s", e)
            return f"(Ошибка Stage A: {e})"

    # ===================================================================
    # Parallel expert dispatch
    # ===================================================================

    async def _dispatch_parallel(
        self,
        assignments: dict[ExpertDomain, list[int]],
        items: list[VorItem],
        model_summary: ModelSummary,
        decompositions,
        _progress,
        admission_decisions: dict[int, Any] | None = None,
    ) -> list[AgentResult]:
        """Run all experts in parallel. Failed experts don't block others."""
        tasks = []
        domain_list = list(assignments.keys())

        for domain, indices in assignments.items():
            expert = self._registry.create_expert(domain)
            tasks.append(
                expert.process(
                    indices, items, model_summary, decompositions,
                    admission_decisions=admission_decisions,
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        agent_results: list[AgentResult] = []
        for i, result in enumerate(results):
            domain = domain_list[i]
            if isinstance(result, Exception):
                logger.error("Expert %s failed: %s", domain.value, result)
                # Create fallback red-confidence matches
                fallback = AgentResult(
                    domain=domain,
                    error=str(result),
                )
                indices = assignments[domain]
                for idx in indices:
                    if idx < len(items):
                        fallback.matches.append(GesnMatch(
                            item_idx=idx,
                            gesn_code="",
                            gesn_name="",
                            gesn_unit="",
                            confidence=0.0,
                            confidence_level="red",
                            reasoning=(
                                f"Эксперт {domain.value} не смог обработать: "
                                f"{result}"
                            ),
                        ))
                agent_results.append(fallback)
            else:
                agent_results.append(result)

            pct = 0.20 + 0.55 * ((i + 1) / len(domain_list))
            _progress("experts", pct, f"Эксперт {domain.value} завершил")

        return agent_results

    # ===================================================================
    # Stage D: Enhanced cross-check with expert provenance
    # ===================================================================

    async def _stage_d_enhanced(
        self,
        items: list[VorItem],
        matches: list[GesnMatch],
        findings: list[Finding],
        model_summary: ModelSummary,
        assignments: dict[ExpertDomain, list[int]],
    ) -> str:
        """Cross-check with expert provenance info."""
        lines = ["## Сводка расценки ВОР\n"]

        # Expert provenance
        lines.append("### Распределение по экспертам:")
        for domain, indices in assignments.items():
            lines.append(f"- **{domain.value}**: {len(indices)} позиций")

        # Matches summary
        lines.append(f"\n### Результаты ({len(matches)} позиций):")
        green = sum(1 for m in matches if m.confidence_level == "green")
        yellow = sum(1 for m in matches if m.confidence_level == "yellow")
        red = sum(1 for m in matches if m.confidence_level == "red")
        lines.append(f"- Уверенные (green): {green}")
        lines.append(f"- Средние (yellow): {yellow}")
        lines.append(f"- Низкие (red): {red}")

        # Key matches for review
        lines.append("\n### Позиции для проверки:")
        for m in matches[:20]:
            if m.item_idx < len(items):
                item = items[m.item_idx]
                lines.append(
                    f"  {m.item_idx + 1}. {item.name} "
                    f"-> [{m.gesn_code}] ({m.confidence_level})"
                )

        # Findings summary
        if findings:
            lines.append(f"\n### Находки ({len(findings)}):")
            for f in findings[:10]:
                lines.append(f"  - [{f.severity.value}] {f.title}")

        user_prompt = "\n".join(lines)

        try:
            return await self._llm(STAGE_D_SYSTEM, user_prompt)
        except Exception as e:
            logger.warning("Stage D failed: %s", e)
            return f"(Ошибка кросс-проверки: {e})"

    # ===================================================================
    # Helpers
    # ===================================================================

    def _format_model_summary(self, ms: ModelSummary) -> str:
        """Format model summary for LLM prompt."""
        parts = []
        if ms.building_height_m > 0:
            parts.append(f"- Высота здания: {ms.building_height_m:.1f} м")
        if ms.levels:
            parts.append(f"- Этажей: {len(ms.levels)}")
        if ms.below_grade_levels:
            parts.append(
                f"- Подземных уровней: {len(ms.below_grade_levels)}"
            )
        if ms.total_elements > 0:
            parts.append(f"- Элементов в модели: {ms.total_elements}")
        if not parts:
            parts.append("- Модель не подключена (паспорт отсутствует)")
        return "\n".join(parts)

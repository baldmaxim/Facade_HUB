"""VOR pipeline orchestrator — runs the complete auto-pricing flow.

Two modes of operation:

1. **MVP mode** (``run``): Deterministic keyword matching, fast, no LLM.
   Same as the original pipeline.  Use when LLM is unavailable or for
   quick-and-dirty estimates.

2. **Smart mode** (``run_smart``): LLM-powered reasoning engine with
   chain-of-thought, model intelligence, multi-layer decomposition,
   implicit work detection, and reasoning document generation.
   Produces Excel + reasoning documents.

Usage::

    from vor.pipeline import VorPipeline

    pipeline = VorPipeline(gesn_db_path="data/gesn.db")

    # MVP mode (original)
    result = await pipeline.run(file_bytes=excel_bytes)

    # Smart mode (new)
    result = await pipeline.run_smart(
        file_bytes=excel_bytes,
        llm_callback=my_llm_fn,
        model_passport=passport_data,
    )
    # result.reasoning_items, result.findings, result.vor_plan, result.cross_check
    # Use reporter.generate_reasoning_document(result) for .md output
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

from vor.models import VorItem, GesnMatch, QuantityPlan, PriceResult, VorResult
from vor.parser import parse_vor_excel
from vor.matcher import match_gesn_items
from vor.planner import plan_quantities
from vor.extractor import generate_extraction_code, extract_quantities_from_results
from vor.pricer import calculate_prices
from vor.generator import generate_vor_excel, generate_vor_excel_v3

logger = logging.getLogger(__name__)

# Type for progress callback: (stage: str, progress: float 0-1, message: str) -> None
ProgressCallback = Callable[[str, float, str], None]

# Type for bridge callback: async (method: str, params: dict) -> dict
BridgeCallback = Callable[..., Any]

# Type for LLM callback: async (system: str, user: str) -> str
LlmCallback = Callable[[str, str], Coroutine[Any, Any, str]]


class VorPipeline:
    """Orchestrates the complete VOR auto-pricing flow."""

    def __init__(
        self,
        gesn_db_path: str | Path = "data/gesn.db",
    ):
        self.gesn_db_path = str(gesn_db_path)

    # ===================================================================
    # Original MVP mode (unchanged)
    # ===================================================================

    async def run(
        self,
        file_bytes: bytes,
        bridge_callback: Optional[BridgeCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
        model_passport: Optional[dict] = None,
    ) -> VorResult:
        """Run the complete VOR pipeline (MVP, deterministic mode).

        Args:
            file_bytes: Uploaded Excel file bytes
            bridge_callback: Optional async callback for Revit code execution.
                           If None, quantities are set to 0 (no Revit connection).
            on_progress: Optional callback for progress updates.
            model_passport: Optional model passport data for smarter planning.

        Returns:
            VorResult with all processing results.
        """
        errors: list[dict] = []
        start_time = time.monotonic()

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # Step 1: Parse Excel
        _progress("parsing", 0.05, "Разбираю ВОР...")
        try:
            items = parse_vor_excel(file_bytes)
        except Exception as e:
            logger.error("VOR parsing failed: %s", e)
            return VorResult(
                items=[],
                matches=[],
                plans=[],
                prices=[],
                errors=[
                    {"item_idx": -1, "stage": "parsing", "message": f"Ошибка парсинга: {e}"}
                ],
                stats={"error": str(e)},
            )

        if not items:
            return VorResult(
                items=[],
                matches=[],
                plans=[],
                prices=[],
                errors=[
                    {"item_idx": -1, "stage": "parsing", "message": "ВОР пуст или не распознан"}
                ],
                stats={"total_items": 0},
            )

        _progress("parsing", 0.10, f"Найдено {len(items)} позиций")
        logger.info("VOR parsed: %d items", len(items))

        # Step 2: Match GESN codes
        _progress("matching", 0.15, "Подбираю коды ГЭСН...")
        try:
            matches = match_gesn_items(items, self.gesn_db_path)
        except Exception as e:
            logger.error("GESN matching failed: %s", e)
            matches = []
            errors.append({"item_idx": -1, "stage": "matching", "message": str(e)})

        _progress("matching", 0.35, f"Подобрано {len(matches)} кодов ГЭСН")

        # Step 3: Plan quantity extraction
        _progress("planning", 0.40, "Планирую извлечение объёмов...")
        try:
            plans = plan_quantities(matches, items)
        except Exception as e:
            logger.error("Quantity planning failed: %s", e)
            plans = []
            errors.append({"item_idx": -1, "stage": "planning", "message": str(e)})

        # Step 4: Extract quantities from Revit (if bridge available)
        quantities: dict[int, float] = {}

        if bridge_callback:
            _progress("extracting", 0.45, "Извлекаю объёмы из модели Revit...")
            code_map = generate_extraction_code(plans)

            total_categories = len(code_map)
            for cat_idx, (category, code) in enumerate(code_map.items()):
                pct = 0.45 + 0.30 * (cat_idx / max(total_categories, 1))
                _progress("extracting", pct, f"Обрабатываю {category}...")

                try:
                    result = await bridge_callback("execute", {"code": code, "timeout_ms": 15000})
                    revit_results = {category: result}
                    cat_quantities = extract_quantities_from_results(plans, revit_results)
                    quantities.update(cat_quantities)
                except Exception as e:
                    logger.warning("Revit extraction failed for %s: %s", category, e)
                    errors.append({
                        "item_idx": -1,
                        "stage": "extracting",
                        "message": f"Ошибка извлечения {category}: {e}",
                    })
                    # Fall back to VOR pre-filled quantities for items in failed category
                    for plan in plans:
                        if hasattr(plan, 'category') and plan.category == category:
                            item_idx = plan.item_idx if hasattr(plan, 'item_idx') else None
                            if item_idx is not None and item_idx not in quantities:
                                item = items[item_idx] if item_idx < len(items) else None
                                if item and item.quantity is not None and item.quantity > 0:
                                    quantities[item_idx] = item.quantity
                                    logger.info(
                                        "Using VOR quantity %.2f for item %d (bridge failed)",
                                        item.quantity, item_idx,
                                    )
        else:
            _progress("extracting", 0.75, "Нет подключения к Revit — объёмы не извлечены")
            # Use pre-filled quantities from VOR if available
            for i, item in enumerate(items):
                if item.quantity is not None and item.quantity > 0:
                    quantities[i] = item.quantity

        # Step 5: Calculate prices
        _progress("pricing", 0.80, "Рассчитываю стоимость...")
        try:
            prices = calculate_prices(matches, quantities, self.gesn_db_path)
        except Exception as e:
            logger.error("Pricing failed: %s", e)
            prices = []
            errors.append({"item_idx": -1, "stage": "pricing", "message": str(e)})

        _progress("pricing", 0.90, "Формирую результат...")

        # Compute stats
        green = sum(1 for m in matches if m.confidence_level == "green")
        yellow = sum(1 for m in matches if m.confidence_level == "yellow")
        red = sum(1 for m in matches if m.confidence_level == "red")
        not_matched = len(items) - len(matches)
        total_cost = sum(p.total_base for p in prices)

        elapsed = time.monotonic() - start_time

        stats = {
            "total_items": len(items),
            "matched": len(matches),
            "green": green,
            "yellow": yellow,
            "red": red,
            "not_matched": not_matched,
            "total_cost_fer_2025": round(total_cost, 2),
            "items_with_quantity": len(quantities),
            "elapsed_seconds": round(elapsed, 1),
        }

        result = VorResult(
            items=items,
            matches=matches,
            plans=plans,
            prices=prices,
            errors=errors,
            stats=stats,
        )

        _progress("done", 1.0, f"Готово! {len(matches)} позиций расценено за {elapsed:.0f} сек")
        logger.info("VOR pipeline complete: %s", stats)

        return result

    # ===================================================================
    # Smart mode (v2) — LLM-powered reasoning
    # ===================================================================

    async def run_smart(
        self,
        file_bytes: bytes,
        llm_callback: LlmCallback,
        bridge_callback: Optional[BridgeCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
        model_passport: Optional[dict] = None,
    ) -> VorResult:
        """Run the VOR pipeline with LLM reasoning engine.

        This is the "smart" mode that uses multi-stage LLM reasoning:
          Stage A: Understand the VOR (1 LLM call)
          Stage B: Explore the model (deterministic from passport)
          Stage C: Match with reasoning (1 LLM call per section)
          Stage D: Cross-check (1 LLM call)

        Plus deterministic analysis for multi-layer detection, implicit
        work, unit mismatches, and other domain rules.

        Args:
            file_bytes: Uploaded Excel file bytes.
            llm_callback: async (system_prompt, user_prompt) -> response_text.
            bridge_callback: Optional Revit bridge for live quantity extraction.
            on_progress: Optional progress callback.
            model_passport: Optional raw model passport dict.

        Returns:
            VorResult with reasoning_items, findings, vor_plan, cross_check
            populated in addition to the standard fields.
        """
        from vor.reasoning import ReasoningEngine

        errors: list[dict] = []
        start_time = time.monotonic()

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # ─── Step 1: Parse Excel (same as MVP) ───────────────
        _progress("parsing", 0.02, "Разбираю ВОР...")
        try:
            items = parse_vor_excel(file_bytes)
        except Exception as e:
            logger.error("VOR parsing failed: %s", e)
            return VorResult(
                items=[],
                errors=[{"item_idx": -1, "stage": "parsing", "message": f"Ошибка парсинга: {e}"}],
                stats={"error": str(e)},
            )

        if not items:
            return VorResult(
                items=[],
                errors=[{"item_idx": -1, "stage": "parsing", "message": "ВОР пуст или не распознан"}],
                stats={"total_items": 0},
            )

        _progress("parsing", 0.05, f"Найдено {len(items)} позиций")
        logger.info("VOR parsed (smart mode): %d items", len(items))

        # ─── Step 2: Reasoning Engine (Stages A-D) ───────────
        engine = ReasoningEngine(
            gesn_db_path=self.gesn_db_path,
            llm_callback=llm_callback,
        )

        def _reasoning_progress(stage: str, pct: float, msg: str) -> None:
            # Map reasoning engine progress (0-1) to pipeline range (0.05-0.65)
            mapped_pct = 0.05 + pct * 0.60
            _progress(stage, mapped_pct, msg)

        breakdowns = []
        try:
            reasoning_result = await engine.run(
                items=items,
                model_passport=model_passport,
                on_progress=_reasoning_progress,
            )
            matches = reasoning_result.matches
            reasoning_items = reasoning_result.reasoning_items
            findings = reasoning_result.findings
            vor_plan = reasoning_result.vor_plan
            cross_check = reasoning_result.cross_check
            breakdowns = reasoning_result.breakdowns
        except Exception as e:
            logger.error("Reasoning engine failed, falling back to MVP: %s", e)
            errors.append({"item_idx": -1, "stage": "reasoning", "message": str(e)})
            # Fallback to deterministic matching
            matches = match_gesn_items(items, self.gesn_db_path)
            reasoning_items = []
            findings = []
            vor_plan = ""
            cross_check = ""

        return await self._finalize_result(
            items=items,
            matches=matches,
            reasoning_items=reasoning_items,
            findings=findings,
            vor_plan=vor_plan,
            cross_check=cross_check,
            breakdowns=breakdowns,
            errors=errors,
            start_time=start_time,
            mode="smart",
            _progress=_progress,
            bridge_callback=bridge_callback,
        )

    # ===================================================================
    # Shared finalization (steps 3-6 for smart & multiagent modes)
    # ===================================================================

    async def _finalize_result(
        self,
        items: list[VorItem],
        matches: list[GesnMatch],
        reasoning_items: list,
        findings: list,
        vor_plan: str,
        cross_check: str,
        breakdowns: list,
        errors: list[dict],
        start_time: float,
        mode: str,
        _progress: ProgressCallback | Callable,
        bridge_callback: Optional[BridgeCallback] = None,
    ) -> VorResult:
        """Shared finalization: plan quantities, extract quantities,
        calculate prices, compute stats, and build VorResult.

        Used by both ``run_smart`` and ``run_multiagent`` after their
        respective reasoning steps.
        """
        # ─── Step 3: Plan quantities (deterministic) ─────────
        _progress("planning", 0.67, "Планирую извлечение объёмов...")
        try:
            plans = plan_quantities(matches, items)
        except Exception as e:
            logger.error("Quantity planning failed: %s", e)
            plans = []
            errors.append({"item_idx": -1, "stage": "planning", "message": str(e)})

        # ─── Step 4: Extract quantities from Revit ───────────
        quantities: dict[int, float] = {}

        if bridge_callback:
            _progress("extracting", 0.70, "Извлекаю объёмы из модели Revit...")
            code_map = generate_extraction_code(plans)

            total_categories = len(code_map)
            for cat_idx, (category, code) in enumerate(code_map.items()):
                pct = 0.70 + 0.15 * (cat_idx / max(total_categories, 1))
                _progress("extracting", pct, f"Обрабатываю {category}...")

                try:
                    result = await bridge_callback("execute", {"code": code, "timeout_ms": 15000})
                    revit_results = {category: result}
                    cat_quantities = extract_quantities_from_results(plans, revit_results)
                    quantities.update(cat_quantities)
                except Exception as e:
                    logger.warning("Revit extraction failed for %s: %s", category, e)
                    errors.append({
                        "item_idx": -1,
                        "stage": "extracting",
                        "message": f"Ошибка извлечения {category}: {e}",
                    })
        else:
            _progress("extracting", 0.85, "Нет подключения к Revit — объёмы не извлечены")
            for i, item in enumerate(items):
                if item.quantity is not None and item.quantity > 0:
                    quantities[i] = item.quantity

        # ─── Step 5: Calculate prices (FER aggregate) ─────────
        _progress("pricing", 0.88, "Рассчитываю стоимость...")
        try:
            prices = calculate_prices(matches, quantities, self.gesn_db_path)
        except Exception as e:
            logger.error("Pricing failed: %s", e)
            prices = []
            errors.append({"item_idx": -1, "stage": "pricing", "message": str(e)})

        # ─── Step 6: Compute stats ────────────────────────────
        _progress("finishing", 0.95, "Формирую отчёт...")

        green = sum(1 for m in matches if m.confidence_level == "green")
        yellow = sum(1 for m in matches if m.confidence_level == "yellow")
        red = sum(1 for m in matches if m.confidence_level == "red")
        not_matched = len(items) - len(matches)
        total_cost_fer = sum(p.total_base for p in prices)
        total_cost_resources = sum(b.total_cost for b in breakdowns)

        elapsed = time.monotonic() - start_time

        stats = {
            "total_items": len(items),
            "matched": len(matches),
            "green": green,
            "yellow": yellow,
            "red": red,
            "not_matched": not_matched,
            "total_cost_fer_2025": round(total_cost_fer, 2),
            "total_cost_resources": round(total_cost_resources, 2),
            "items_with_quantity": len(quantities),
            "elapsed_seconds": round(elapsed, 1),
            "mode": mode,
            "findings_count": len(findings),
            "reasoning_items_count": len(reasoning_items),
            "breakdowns_count": len(breakdowns),
        }

        result = VorResult(
            items=items,
            matches=matches,
            plans=plans,
            prices=prices,
            errors=errors,
            stats=stats,
            reasoning_items=reasoning_items,
            findings=findings,
            vor_plan=vor_plan,
            cross_check=cross_check,
            breakdowns=breakdowns,
        )

        _progress(
            "done", 1.0,
            f"Готово! {len(matches)} позиций, "
            f"{len(findings)} замечаний за {elapsed:.0f} сек",
        )
        logger.info("VOR %s pipeline complete: %s", mode, stats)

        return result

    # ===================================================================
    # Convenience methods
    # ===================================================================

    async def run_and_generate(
        self,
        file_bytes: bytes,
        bridge_callback: Optional[BridgeCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> tuple[VorResult, bytes]:
        """Run pipeline AND generate Excel output (MVP mode).

        Returns:
            Tuple of (VorResult, excel_bytes)
        """
        result = await self.run(file_bytes, bridge_callback, on_progress)

        excel_bytes = generate_vor_excel(result)

        return result, excel_bytes

    async def run_smart_and_generate(
        self,
        file_bytes: bytes,
        llm_callback: LlmCallback,
        bridge_callback: Optional[BridgeCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
        model_passport: Optional[dict] = None,
    ) -> tuple[VorResult, bytes, str, str]:
        """Run smart pipeline AND generate all outputs.

        Returns:
            Tuple of (VorResult, excel_bytes, reasoning_md, findings_md)
        """
        from vor.reporter import generate_reasoning_document, generate_findings_document

        result = await self.run_smart(
            file_bytes=file_bytes,
            llm_callback=llm_callback,
            bridge_callback=bridge_callback,
            on_progress=on_progress,
            model_passport=model_passport,
        )

        # Use v3 generator if breakdowns are available, else fall back to v2
        if result.breakdowns:
            excel_bytes = generate_vor_excel_v3(result)
        else:
            excel_bytes = generate_vor_excel(result)
        reasoning_md = generate_reasoning_document(result)
        findings_md = generate_findings_document(result)

        return result, excel_bytes, reasoning_md, findings_md

    # ===================================================================
    # V5 mode — two-cycle pricing with VorAssembler (Redesign v3)
    # ===================================================================

    async def run_multiagent_v5(
        self,
        excel_bytes: bytes,
        provider: "PriceProvider",
        llm_callback: LlmCallback,
        config: Optional["VorConfig"] = None,
        on_progress: Optional[ProgressCallback] = None,
        project_root: Optional[str] = None,
        on_section_complete=None,
    ) -> bytes:
        """V5 pipeline: parse → classify → expert dispatch (process_v5) → assemble Excel.

        This is the Redesign v3 pipeline that:
        - Takes raw excel_bytes instead of pre-parsed items
        - Uses process_v5() (two-cycle pricing) instead of process()
        - Uses VorAssembler instead of generator
        - Returns priced Excel bytes (not VorResult)

        Args:
            excel_bytes: Raw bytes of the original .xlsx file.
            provider: PriceProvider instance for GESN search and resources.
            llm_callback: async (system_prompt, user_prompt) -> response_text.
            config: Optional VorConfig.  Uses defaults when ``None``.
            on_progress: Optional progress callback.
            project_root: Optional project root for encyclopedia loading.

        Returns:
            Priced Excel bytes ready to save/send.
        """
        from vor.agents.orchestrator import MultiAgentOrchestrator
        from vor.assembler import VorAssembler
        from vor.models import PricedSection

        start_time = time.monotonic()

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # --- Step 1: Parse Excel ---
        _progress("parsing", 0.02, "Разбираю ВОР...")
        try:
            items = parse_vor_excel(excel_bytes)
        except Exception as e:
            logger.error("VOR parsing failed (v5): %s", e)
            raise ValueError(f"Ошибка парсинга ВОР: {e}") from e

        if not items:
            raise ValueError("ВОР пуст или не распознан")

        _progress("parsing", 0.05, f"Найдено {len(items)} позиций")
        logger.info("VOR parsed (v5 mode): %d items", len(items))

        # --- Step 2: Multi-agent orchestrator v5 ---
        orchestrator = MultiAgentOrchestrator(
            provider=provider,
            llm_callback=llm_callback,
            config=config,
            project_root=project_root,
        )

        def _orchestrator_progress(stage: str, pct: float, msg: str) -> None:
            # Map orchestrator progress (0-1) to pipeline range (0.05-0.80)
            mapped_pct = 0.05 + pct * 0.75
            _progress(stage, mapped_pct, msg)

        try:
            priced_sections: list[PricedSection] = await orchestrator.run_v5(
                excel_bytes=excel_bytes,
                items=items,
                on_progress=_orchestrator_progress,
                on_section_complete=on_section_complete,
            )
        except Exception as e:
            logger.error("V5 orchestrator failed: %s", e)
            raise RuntimeError(
                f"Ошибка мультиагентной расценки v5: {e}"
            ) from e

        # --- Step 3: Validate pricing results ---
        total_positions = sum(len(s.positions) for s in priced_sections)
        expected = len(items)
        coverage_pct = (total_positions / expected * 100) if expected > 0 else 0

        if total_positions == 0:
            logger.warning(
                "V5 pipeline: no positions priced by any expert "
                "(%d sections, all empty)", len(priced_sections),
            )
        elif coverage_pct < 50:
            logger.warning(
                "V5 pipeline: low coverage %.0f%% (%d/%d items priced)",
                coverage_pct, total_positions, expected,
            )

        # Log per-section stats
        for s in priced_sections:
            v = s.verification
            if v and not v.passed:
                logger.warning(
                    "Section %s FAILED verification: coverage=%.0f%%, "
                    "flags=%d, total=%.0f",
                    s.domain.value if hasattr(s, 'domain') else '?',
                    v.coverage_pct, len(v.red_flags), v.section_total,
                )

        # --- Step 4: Assemble priced Excel ---
        _progress("assembling", 0.85, "Собираю расценённый Excel...")
        try:
            assembler = VorAssembler()
            result_bytes = assembler.assemble(excel_bytes, priced_sections)
        except Exception as e:
            logger.error("VorAssembler failed: %s", e)
            raise RuntimeError(f"Ошибка сборки Excel: {e}") from e

        elapsed = time.monotonic() - start_time
        total_positions = sum(
            len(s.positions) for s in priced_sections
        )
        _progress(
            "done",
            1.0,
            f"Готово! {total_positions} позиций расценено за {elapsed:.0f} сек",
        )
        logger.info(
            "VOR v5 pipeline complete: %d items, %d sections, "
            "%d priced positions, %.1fs",
            len(items),
            len(priced_sections),
            total_positions,
            elapsed,
        )

        return result_bytes

    # ===================================================================
    # Multi-agent mode (v4) — parallel expert agents
    # ===================================================================

    async def run_multiagent(
        self,
        file_bytes: bytes,
        provider: "PriceProvider",
        llm_callback: LlmCallback,
        config: Optional["VorConfig"] = None,
        on_progress: Optional[ProgressCallback] = None,
        model_passport: Optional[dict] = None,
        project_root: Optional[str] = None,
    ) -> VorResult:
        """Run the VOR pipeline with multi-agent orchestration.

        This mode distributes work to domain-specialized expert agents
        that run in parallel, then merges results.  The overall pipeline
        is the same as ``run_smart`` but Stage C is replaced by parallel
        expert dispatch.

        Args:
            file_bytes: Uploaded Excel file bytes.
            provider: PriceProvider instance for GESN search and resources.
            llm_callback: async (system_prompt, user_prompt) -> response_text.
            config: Optional VorConfig.  Uses defaults when ``None``.
            on_progress: Optional progress callback.
            model_passport: Optional raw model passport dict.
            project_root: Optional project root for encyclopedia loading.

        Returns:
            VorResult with reasoning_items, findings, vor_plan, cross_check,
            and breakdowns populated in addition to the standard fields.
        """
        from vor.agents.orchestrator import MultiAgentOrchestrator

        errors: list[dict] = []
        start_time = time.monotonic()

        def _progress(stage: str, pct: float, msg: str) -> None:
            if on_progress:
                try:
                    on_progress(stage, pct, msg)
                except Exception:
                    pass

        # --- Step 1: Parse Excel ---
        _progress("parsing", 0.02, "Разбираю ВОР...")
        try:
            items = parse_vor_excel(file_bytes)
        except Exception as e:
            logger.error("VOR parsing failed: %s", e)
            return VorResult(
                items=[],
                errors=[
                    {"item_idx": -1, "stage": "parsing",
                     "message": f"Ошибка парсинга: {e}"}
                ],
                stats={"error": str(e)},
            )

        if not items:
            return VorResult(
                items=[],
                errors=[
                    {"item_idx": -1, "stage": "parsing",
                     "message": "ВОР пуст или не распознан"}
                ],
                stats={"total_items": 0},
            )

        _progress("parsing", 0.05, f"Найдено {len(items)} позиций")
        logger.info("VOR parsed (multiagent mode): %d items", len(items))

        # --- Step 2: Multi-agent orchestrator ---
        orchestrator = MultiAgentOrchestrator(
            provider=provider,
            llm_callback=llm_callback,
            config=config,
            project_root=project_root,
        )

        def _orchestrator_progress(stage: str, pct: float, msg: str) -> None:
            # Map orchestrator progress (0-1) to pipeline range (0.05-0.65)
            mapped_pct = 0.05 + pct * 0.60
            _progress(stage, mapped_pct, msg)

        breakdowns = []
        try:
            reasoning_result = await orchestrator.run(
                items=items,
                model_passport=model_passport,
                on_progress=_orchestrator_progress,
            )
            matches = reasoning_result.matches
            reasoning_items = reasoning_result.reasoning_items
            findings = reasoning_result.findings
            vor_plan = reasoning_result.vor_plan
            cross_check = reasoning_result.cross_check
            breakdowns = reasoning_result.breakdowns
        except Exception as e:
            logger.error(
                "Multi-agent orchestrator failed, falling back to MVP: %s", e
            )
            errors.append(
                {"item_idx": -1, "stage": "orchestrator", "message": str(e)}
            )
            # Fallback to deterministic matching
            matches = match_gesn_items(items, self.gesn_db_path)
            reasoning_items = []
            findings = []
            vor_plan = ""
            cross_check = ""

        return await self._finalize_result(
            items=items,
            matches=matches,
            reasoning_items=reasoning_items,
            findings=findings,
            vor_plan=vor_plan,
            cross_check=cross_check,
            breakdowns=breakdowns,
            errors=errors,
            start_time=start_time,
            mode="multiagent",
            _progress=_progress,
        )

    async def run_multiagent_and_generate(
        self,
        file_bytes: bytes,
        provider: "PriceProvider",
        llm_callback: LlmCallback,
        config: Optional["VorConfig"] = None,
        on_progress: Optional[ProgressCallback] = None,
        model_passport: Optional[dict] = None,
        project_root: Optional[str] = None,
    ) -> tuple[VorResult, bytes, str, str]:
        """Run multi-agent pipeline AND generate all outputs.

        Returns:
            Tuple of (VorResult, excel_bytes, reasoning_md, findings_md)
        """
        from vor.reporter import (
            generate_reasoning_document,
            generate_findings_document,
        )

        result = await self.run_multiagent(
            file_bytes=file_bytes,
            provider=provider,
            llm_callback=llm_callback,
            config=config,
            on_progress=on_progress,
            model_passport=model_passport,
            project_root=project_root,
        )

        # Use v3 generator if breakdowns are available, else fall back to v2
        if result.breakdowns:
            excel_bytes = generate_vor_excel_v3(result)
        else:
            excel_bytes = generate_vor_excel(result)
        reasoning_md = generate_reasoning_document(result)
        findings_md = generate_findings_document(result)

        return result, excel_bytes, reasoning_md, findings_md

"""Expert agent -- domain-specialized VOR pricing agent."""
from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Callable, Coroutine

import yaml

from vor.analyzer import ModelSummary
from vor.deterministic_core import (
    DeterministicDomainCore,
    DeterministicGuidance,
)
from vor.models import (
    AdmissionDecision,
    AgentResult,
    CompositionItem,
    CompositionType,
    ElementDecomposition,
    ExpertDomain,
    Finding,
    GesnMatch,
    PositionBreakdown,
    PricedItem,
    PricedPosition,
    PricedSection,
    ReasoningItem,
    ResourceLine,
    VerificationReport,
    VorItem,
    WorkBreakdown,
)
from vor.constants import (
    FER_INDEX_2025, FSSC_INDEX_2025, LABOR_INDEX_2025, STANDARD_LABOR_RATE,
)
from vor.providers.base import PriceProvider
from vor.agents.validation import PositionValidator, Severity, ValidationError
from vor.reasoning import STAGE_C_SYSTEM

logger = logging.getLogger(__name__)

LlmCallback = Callable[[str, str], Coroutine[Any, Any, str]]

_PRICE_RANGES_PATH = Path(__file__).resolve().parent.parent / "price_ranges.yaml"
try:
    _PRICE_RANGES = yaml.safe_load(_PRICE_RANGES_PATH.read_text(encoding="utf-8")) or {}
except Exception:
    _PRICE_RANGES = {}

_MATERIAL_PRICE_RANGES = _PRICE_RANGES.get("materials", {})
_WORK_PRICE_RANGES = _PRICE_RANGES.get("works", {})

_GENERIC_PRICE_LIMITS = {
    CompositionType.MATERIAL: 2_000_000.0,
    CompositionType.MACHINERY: 500_000.0,
    CompositionType.LABOR: 5_000.0,
    CompositionType.WORK: 200_000.0,
}


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert a value to float, handling non-numeric strings like '18559.82 м2'.

    Uses a stricter regex that requires digits at the start of the string,
    preventing extraction of digits from unit strings like 'м2'.
    """
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        s = str(val)
        # Only extract if the string starts with digits (after optional whitespace)
        m = re.match(r'^\s*([\d]+(?:\.[\d]*)?)', s)
        if m:
            return float(m.group(1))
        if s.strip():
            logger.debug("_safe_float: could not extract number from '%s', using default %.1f", s, default)
        return default


# Common unit aliases for compatibility checking
_UNIT_COMPAT = {
    "м2": {"м2", "м²", "кв.м", "кв. м"},
    "м3": {"м3", "м³", "куб.м", "куб. м"},
    "т": {"т", "тн", "тонн"},
    "кг": {"кг", "килогр"},
    "шт": {"шт", "шт."},
    "м": {"м", "м.п.", "пог.м", "п.м"},
    "чел-ч": {"чел-ч", "чел.-ч", "чел.ч"},
    "маш-ч": {"маш-ч", "маш.-ч", "маш.ч"},
}

def _normalize_unit(unit: str) -> str:
    """Normalize a unit string to canonical form, stripping ФССЦ quantity prefixes."""
    u = unit.strip().lower().replace(".", "").replace(" ", "")
    u = u.replace("²", "2").replace("³", "3")
    # Strip ФССЦ quantity prefixes: "100м2" → "м2", "1000м3" → "м3"
    u = re.sub(r'^\d+', '', u)
    for canonical, aliases in _UNIT_COMPAT.items():
        norm_aliases = {a.replace(".", "").replace(" ", "").lower() for a in aliases}
        if u in norm_aliases:
            return canonical
    return u

def _units_compatible(unit_a: str, unit_b: str) -> bool:
    """Check if two units are compatible (same canonical form)."""
    if not unit_a or not unit_b:
        return True  # can't validate, assume OK
    return _normalize_unit(unit_a) == _normalize_unit(unit_b)


def _get_unit_multiplier(raw_unit: str) -> float:
    """Extract ФССЦ unit multiplier from unit strings like '100 м2', '1000 м3'.

    Returns how many base units the price covers.
    E.g., '100 м2' means price is per 100 м2, so divide by 100.
    """
    if not raw_unit:
        return 1.0
    m = re.match(r'^(\d+)\s*[а-яa-z]', raw_unit.strip(), re.IGNORECASE)
    if m:
        return float(m.group(1))
    return 1.0


class ExpertAgent:
    """Domain-specialized expert for VOR pricing.

    Each expert wraps the Stage C reasoning logic with domain-specific context:
    - Encyclopedia knowledge embedded in system prompt
    - GESN candidate search filtered by domain collections
    - Domain-specific waste coefficients
    """

    def __init__(
        self,
        domain: ExpertDomain,
        provider: PriceProvider,
        llm_callback: LlmCallback,
        encyclopedia_text: str = "",
        collections: list[str] | None = None,
        waste_defaults: dict[str, float] | None = None,
    ):
        self.domain = domain
        self._provider = provider
        self._llm = llm_callback
        self._encyclopedia = encyclopedia_text
        self._collections = collections or []
        self._waste_defaults = waste_defaults or {}
        self._system_prompt: str | None = None

        # LRU caches to avoid repeated expensive DB lookups
        self._price_cache: dict[str, tuple[float | None, str]] = {}  # resource_code -> (price, unit)
        self._fer_price_cache: dict[str, Any] = {}  # gesn_code -> PriceRecord or None
        self._fer_prefix_cache: dict[str, Any] = {}  # prefix -> PriceRecord or None
        self._name_price_cache: dict[str, tuple[float | None, str]] = {}  # material_name -> (price, unit)
        self._deterministic_core = DeterministicDomainCore()

    async def process(
        self,
        item_indices: list[int],
        items: list[VorItem],
        model_summary: ModelSummary | None = None,
        decompositions: list[ElementDecomposition] | None = None,
        admission_decisions: dict[int, AdmissionDecision] | None = None,
    ) -> AgentResult:
        """Process assigned VOR items. Main entry point.

        1. Search GESN candidates via provider (filtered by collections)
        2. Build LLM prompt with encyclopedia + candidates
        3. Call LLM for GESN matching
        4. Parse response into matches + reasoning items
        5. Build resource breakdowns via provider
        6. Return AgentResult
        """
        start = time.monotonic()
        matches: list[GesnMatch] = []
        reasoning_items: list[ReasoningItem] = []
        findings: list[Finding] = []
        breakdowns: list[PositionBreakdown] = []
        supplements: list[dict] = []
        item_works: dict[int, list[dict]] = {}

        try:
            item_indices = self._filter_item_indices_for_domain(
                item_indices, items, admission_decisions
            )
            if not item_indices:
                return AgentResult(domain=self.domain)

            # Step 1: Find GESN candidates for each item
            items_with_candidates = await self._find_all_candidates(
                item_indices, items
            )

            # Step 2-3: Build and call LLM
            system_prompt = self._build_system_prompt()
            user_prompt = self._build_user_prompt(
                items_with_candidates, items, model_summary, decompositions
            )

            raw_response = await self._llm(system_prompt, user_prompt)

            # Step 4: Parse LLM response
            parsed = self._parse_response(raw_response)

            # Step 5: Build matches and reasoning items from parsed response
            for parsed_item in parsed.get("items", []):
                idx = parsed_item.get("item_idx")
                if idx is None:
                    continue
                # Map relative index to absolute
                if isinstance(idx, int) and idx < len(item_indices):
                    abs_idx = item_indices[idx]
                elif isinstance(idx, int) and idx in item_indices:
                    # Recovery: LLM returned a GLOBAL index that happens to be in this batch
                    abs_idx = idx
                    logger.info(
                        "Recovered item_idx=%d as global index (found in item_indices)",
                        idx,
                    )
                else:
                    abs_idx = idx

                if not isinstance(abs_idx, int) or abs_idx < 0 or abs_idx >= len(items):
                    logger.warning("Invalid item_idx %s from LLM, skipping", idx)
                    continue

                works = parsed_item.get("works", [])
                confidence_str = str(
                    parsed_item.get("confidence", "MEDIUM")
                ).upper()

                # Determine confidence value
                if confidence_str in ("HIGH", "ВЫСОКАЯ"):
                    conf_val, conf_level = 0.85, "green"
                elif confidence_str in ("LOW", "НИЗКАЯ"):
                    conf_val, conf_level = 0.30, "red"
                else:
                    conf_val, conf_level = 0.55, "yellow"

                # Primary GESN match (first work)
                primary_code = ""
                primary_name = ""
                if works:
                    primary_code = works[0].get("gesn_code", "")
                    primary_name = works[0].get("name", works[0].get("gesn_name", ""))

                match = GesnMatch(
                    item_idx=abs_idx,
                    gesn_code=primary_code,
                    gesn_name=primary_name,
                    gesn_unit=(
                        items[abs_idx].unit if abs_idx < len(items) else ""
                    ),
                    confidence=conf_val,
                    confidence_level=conf_level,
                    reasoning=(
                        json.dumps(works, ensure_ascii=False) if works else ""
                    ),
                )
                matches.append(match)
                item_works[abs_idx] = works

                reasoning_items.append(
                    ReasoningItem(
                        item_idx=abs_idx,
                        item_name=(
                            items[abs_idx].name if abs_idx < len(items) else ""
                        ),
                        reasoning_chain=match.reasoning,
                        gesn_code=primary_code,
                        confidence=conf_val,
                        confidence_level=conf_level,
                    )
                )

            # Parse supplements
            for sup in parsed.get("supplements", []):
                supplements.append(sup)

            # Step 6: Build breakdowns via provider
            for abs_idx, works in item_works.items():
                if abs_idx >= len(items):
                    continue
                item = items[abs_idx]
                position_works: list[WorkBreakdown] = []
                total_cost = 0.0

                for work in works:
                    code = work.get("gesn_code", "")
                    if not code:
                        continue

                    # Get resources from provider
                    quantity = item.quantity or 0.0
                    resources = await self._provider.get_resources(
                        code, quantity
                    )

                    mat_lines: list[ResourceLine] = []
                    mach_lines: list[ResourceLine] = []
                    labor_lines: list[ResourceLine] = []
                    work_cost = 0.0

                    for r in resources:
                        line = ResourceLine(
                            resource_code=r.resource_code,
                            name=r.name,
                            resource_type=r.resource_type,
                            measure_unit=r.unit,
                            norm_quantity=r.norm_quantity,
                            total_quantity=r.total_quantity,
                            unit_price=r.unit_price or 0.0,
                            total_price=r.total_price,
                            price_found=r.price_found,
                        )
                        work_cost += r.total_price
                        if r.resource_type in (
                            "material",
                            "material_unaccounted",
                        ):
                            mat_lines.append(line)
                        elif r.resource_type == "machinery":
                            mach_lines.append(line)
                        else:
                            labor_lines.append(line)

                    wb = WorkBreakdown(
                        gesn_code=code,
                        gesn_name=work.get("name", work.get("gesn_name", "")),
                        measure_unit=item.unit,
                        quantity=quantity,
                        materials=mat_lines,
                        machinery=mach_lines,
                        labor_lines=labor_lines,
                        total_cost=work_cost,
                        reasoning=work.get("reasoning", ""),
                    )
                    position_works.append(wb)
                    total_cost += work_cost

                match_for_item = next(
                    (m for m in matches if m.item_idx == abs_idx), None
                )
                breakdown = PositionBreakdown(
                    item_idx=abs_idx,
                    item_name=item.name,
                    unit=item.unit,
                    quantity=item.quantity or 0.0,
                    works=position_works,
                    total_cost=total_cost,
                    confidence=(
                        match_for_item.confidence if match_for_item else 0.0
                    ),
                    confidence_level=(
                        match_for_item.confidence_level
                        if match_for_item
                        else "red"
                    ),
                )
                breakdowns.append(breakdown)

        except Exception as e:
            logger.error(
                "Expert %s failed: %s", self.domain.value, e, exc_info=True
            )
            # Create red-confidence matches for all items as fallback
            for idx in item_indices:
                if idx < len(items):
                    matches.append(
                        GesnMatch(
                            item_idx=idx,
                            gesn_code="",
                            gesn_name="",
                            gesn_unit="",
                            confidence=0.0,
                            confidence_level="red",
                            reasoning=f"Ошибка эксперта {self.domain.value}: {e}",
                        )
                    )

        elapsed = time.monotonic() - start
        return AgentResult(
            domain=self.domain,
            matches=matches,
            reasoning_items=reasoning_items,
            findings=findings,
            breakdowns=breakdowns,
            supplements=supplements,
            item_works=item_works,
            elapsed_seconds=round(elapsed, 2),
        )

    async def _find_all_candidates(
        self,
        item_indices: list[int],
        items: list[VorItem],
    ) -> list[dict]:
        """Find GESN candidates for each item using provider."""
        result = []
        for idx in item_indices:
            item = items[idx]
            merged_candidates: dict[str, Any] = {}
            collections = self._collections or [""]
            for collection in collections:
                candidates = await self._provider.search_norms(
                    item.name,
                    collection=collection,
                    limit=5,
                )
                for candidate in candidates:
                    previous = merged_candidates.get(candidate.code)
                    if previous is None or candidate.score > previous.score:
                        merged_candidates[candidate.code] = candidate
            candidates = sorted(
                merged_candidates.values(),
                key=lambda candidate: candidate.score,
                reverse=True,
            )[:5]
            result.append(
                {
                    "item_idx": idx,
                    "name": item.name,
                    "unit": item.unit,
                    "section": item.section,
                    "candidates": [
                        {
                            "code": c.code,
                            "name": c.name,
                            "unit": c.unit,
                            "score": c.score,
                        }
                        for c in candidates
                    ],
                }
            )
        return result

    def _build_system_prompt(self) -> str:
        """Build system prompt = base Stage C + domain encyclopedia."""
        if self._system_prompt is not None:
            return self._system_prompt

        base = STAGE_C_SYSTEM

        if self._encyclopedia:
            prompt = (
                base
                + "\n\n"
                + "## ДОМЕННАЯ ЭКСПЕРТИЗА\n\n"
                + f"Ты специалист по разделу: **{self.domain.value}**.\n"
                + "Ниже -- твоя энциклопедия знаний. Используй её для:\n"
                + "- Валидации выбранных расценок\n"
                + "- Проверки типичных ценовых диапазонов\n"
                + "- Определения правильных единиц измерения\n"
                + "- Обнаружения красных флагов\n\n"
                + self._encyclopedia
            )
        else:
            prompt = base

        self._system_prompt = prompt
        return prompt

    def _build_user_prompt(
        self,
        items_with_candidates: list[dict],
        items: list[VorItem],
        model_summary: ModelSummary | None,
        decompositions: list[ElementDecomposition] | None,
    ) -> str:
        """Build user prompt with items and GESN candidates."""
        section_name = (
            items[items_with_candidates[0]["item_idx"]].section
            if items_with_candidates
            else "Без раздела"
        )
        lines = [f"## Раздел: {section_name}\n"]

        for i, ic in enumerate(items_with_candidates):
            idx = ic["item_idx"]
            item = items[idx] if idx < len(items) else None
            lines.append(f"\n### Позиция {i}: {ic['name']}")
            lines.append(f"- Единица: {ic['unit']}")
            if item and item.quantity:
                lines.append(f"- Объём: {item.quantity}")

            if ic["candidates"]:
                lines.append("\nКандидаты ГЭСН:")
                for j, cand in enumerate(ic["candidates"]):
                    lines.append(
                        f"  {j + 1}. [{cand['code']}] {cand['name']}"
                        f" ({cand['unit']}) -- score {cand['score']:.2f}"
                    )
            else:
                lines.append("\nКандидатов ГЭСН не найдено в базе.")

        return "\n".join(lines)

    def _parse_response(self, raw: str) -> dict:
        """Parse LLM JSON response. Tolerant to markdown fences and malformed JSON."""
        if not raw or not raw.strip():
            return {"items": [], "supplements": []}

        text = raw.strip()

        # Remove ```json ... ``` wrapper
        if "```" in text:
            blocks = re.findall(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
            if blocks:
                text = blocks[0].strip()

        # Fix trailing commas — common LLM mistake
        text = re.sub(r",\s*([}\]])", r"\1", text)

        # Try to parse as JSON
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON object in text
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    obj = json.loads(text[start:end])
                except json.JSONDecodeError:
                    logger.warning(
                        "Failed to parse LLM response as JSON. First 500 chars: %s",
                        text[:500],
                    )
                    return {"items": [], "supplements": []}
            else:
                return {"items": [], "supplements": []}

        # Normalize structure
        if isinstance(obj, list):
            return {"items": obj, "supplements": []}
        if isinstance(obj, dict):
            if "items" not in obj and "supplements" not in obj:
                return {"items": [obj], "supplements": []}
            return obj

        return {"items": [], "supplements": []}

    # ===================================================================
    # V5: Two-cycle pricing (Redesign v3) — new methods below
    # ===================================================================

    async def process_v5(
        self,
        item_indices: list[int],
        items: list[VorItem],
        model_summary: ModelSummary | None = None,
        decompositions: list[ElementDecomposition] | None = None,
        admission_decisions: dict[int, AdmissionDecision] | None = None,
    ) -> PricedSection:
        """Process assigned VOR items using the 3-cycle approach.

        Cycle 1: COMPOSITION — LLM determines what works, materials, machinery
        Cycle 2: PRICING — programmatic price lookup for each composition element
        Cycle 3: VERIFICATION — deterministic self-check

        Returns a fully PricedSection with VerificationReport.
        """
        start = time.monotonic()
        try:
            item_indices = self._filter_item_indices_for_domain(
                item_indices, items, admission_decisions
            )
            if not item_indices:
                return PricedSection(
                    domain=self.domain,
                    positions=[],
                    section_total_formula="",
                    verification=VerificationReport(
                        section_total=0.0,
                        market_range=(0.0, 0.0),
                        red_flags=[f"Эксперт {self.domain.value}: admission gate не пропустил ни одной позиции"],
                        coverage_pct=0.0,
                        passed=False,
                    ),
                )

            # Step 1: Find GESN candidates (reuse existing method)
            items_with_candidates = await self._find_all_candidates(
                item_indices, items
            )

            positions = await self._determine_composition(
                item_indices, items, items_with_candidates
            )
            positions = self._apply_domain_fallbacks(
                item_indices, items, positions
            )
            positions.sort(key=lambda position: position.original_idx)

            # Enrichment + pricing now done inside _validate_and_iterate for ALL domains.

            # Cycle 3: Verify all positions from ALL batches in this expert's section.
            # (positions is accumulated across batches in _determine_composition)
            verification = self._verify_result(positions)

            # If no positions were produced but we had items, flag it
            if not positions and item_indices:
                verification.red_flags.append(
                    f"Ошибка эксперта {self.domain.value}: все позиции потеряны (0/{len(item_indices)})"
                )
                verification.passed = False

            elapsed = time.monotonic() - start
            logger.info(
                "Expert %s process_v5 completed in %.2fs: %d positions, "
                "coverage %.0f%%, passed=%s",
                self.domain.value,
                elapsed,
                len(positions),
                verification.coverage_pct,
                verification.passed,
            )

            return PricedSection(
                domain=self.domain,
                positions=positions,
                section_total_formula="",  # filled by assembler
                verification=verification,
            )

        except Exception as e:
            logger.error(
                "Expert %s process_v5 failed: %s",
                self.domain.value,
                e,
                exc_info=True,
            )
            elapsed = time.monotonic() - start
            return PricedSection(
                domain=self.domain,
                positions=[],
                section_total_formula="",
                verification=VerificationReport(
                    section_total=0.0,
                    market_range=(0.0, 0.0),
                    red_flags=[f"Ошибка эксперта {self.domain.value}: {e}"],
                    coverage_pct=0.0,
                    passed=False,
                ),
            )

    def _apply_domain_fallbacks(
        self,
        item_indices: list[int],
        items: list[VorItem],
        positions: list[PricedPosition],
    ) -> list[PricedPosition]:
        """Use template positions only as a rescue after the LLM had its chance."""
        if self.domain not in {ExpertDomain.MASONRY, ExpertDomain.CONCRETE}:
            return positions

        positions_by_row = {
            position.original_idx: position
            for position in positions
        }
        final_positions: list[PricedPosition] = []
        fallback_count = 0

        for idx in item_indices:
            item = items[idx]
            current = positions_by_row.get(item.row_num)
            guidance = self._get_domain_guidance(item)

            if current is None:
                fallback = self._build_domain_fallback_position(
                    item,
                    reason="missing_llm_position",
                )
                if fallback is not None:
                    final_positions.append(fallback)
                    fallback_count += 1
                continue

            # Skip fallback for positions approved by the iteration loop
            if current.approved:
                final_positions.append(current)
                continue

            if guidance and self._position_needs_domain_fallback(
                current,
                guidance,
            ):
                fallback = self._build_domain_fallback_position(
                    item,
                    reason="weak_llm_composition",
                )
                if fallback is not None:
                    final_positions.append(fallback)
                    fallback_count += 1
                    continue

            final_positions.append(current)

        if fallback_count:
            logger.info(
                "Expert %s applied %d domain fallbacks after LLM attempt",
                self.domain.value,
                fallback_count,
            )

        return final_positions

    def _filter_item_indices_for_domain(
        self,
        item_indices: list[int],
        items: list[VorItem],
        admission_decisions: dict[int, AdmissionDecision] | None,
    ) -> list[int]:
        if not admission_decisions:
            return item_indices

        filtered: list[int] = []
        rejected = 0
        for idx in item_indices:
            decision = admission_decisions.get(idx)
            if decision is None:
                filtered.append(idx)
                continue
            if decision.admit and decision.admitted_domain == self.domain:
                filtered.append(idx)
            else:
                rejected += 1

        if rejected:
            logger.info(
                "Expert %s rejected %d positions after admission review",
                self.domain.value,
                rejected,
            )
        return filtered

    def _build_domain_fallback_position(
        self,
        item: VorItem,
        *,
        reason: str,
    ) -> PricedPosition | None:
        position = self._deterministic_core.build_position(self.domain, item)
        if position is None:
            return None
        position.notes = f"[llm-fallback] reason={reason}; {position.notes or ''}"
        return position

    def _get_domain_guidance(
        self,
        item: VorItem,
    ) -> DeterministicGuidance | None:
        return self._deterministic_core.build_guidance(self.domain, item)

    def _position_needs_domain_fallback(
        self,
        position: PricedPosition,
        guidance: DeterministicGuidance,
    ) -> bool:
        if not position.items:
            return True

        if len(position.items) < guidance.minimum_items:
            return True

        if not any(
            priced_item.composition.type == CompositionType.WORK
            for priced_item in position.items
        ):
            return True

        names = " ".join(
            (priced_item.composition.name or "").lower()
            for priced_item in position.items
        )
        for keyword_group in guidance.required_keyword_groups:
            if keyword_group and not any(
                keyword in names for keyword in keyword_group
            ):
                return True

        return False

    # Maximum items per LLM call.
    # Gemini 3.1 Pro supports 65K output tokens. At ~500 tokens per position,
    # 25 items ≈ 12.5K tokens — safe margin against truncation/malformed JSON.
    _BATCH_SIZE = 25
    _MAX_ITERATIONS = 4

    async def _determine_composition(
        self,
        item_indices: list[int],
        items: list[VorItem],
        candidates: list[dict],
    ) -> list[PricedPosition]:
        """Cycle 1: COMPOSITION — LLM determines works, materials, machinery.

        Splits large item lists into batches of _BATCH_SIZE to avoid
        LLM response truncation. Each batch gets its own LLM call.
        """
        system_prompt = self._build_composition_system_prompt()

        # Build index→candidate mapping for batch slicing
        cand_by_idx = {c["item_idx"]: c for c in candidates}

        # Split into batches
        all_positions: list[PricedPosition] = []
        for batch_start in range(0, len(item_indices), self._BATCH_SIZE):
            batch_indices = item_indices[batch_start : batch_start + self._BATCH_SIZE]
            batch_candidates = []
            for idx in batch_indices:
                if idx in cand_by_idx:
                    batch_candidates.append(cand_by_idx[idx])
                else:
                    # Include item without GESN candidates — LLM can still determine composition
                    item = items[idx] if idx < len(items) else None
                    if item:
                        batch_candidates.append({
                            "item_idx": idx,
                            "name": item.name,
                            "unit": item.unit,
                            "section": getattr(item, 'section', ''),
                            "candidates": [],
                        })
                        logger.warning(
                            "Item idx=%d '%s' has no GESN candidates, included without suggestions",
                            idx, item.name[:50],
                        )

            user_prompt = self._build_composition_user_prompt(
                batch_candidates, items
            )

            batch_num = batch_start // self._BATCH_SIZE + 1
            total_batches = (len(item_indices) + self._BATCH_SIZE - 1) // self._BATCH_SIZE

            try:
                batch_positions = await self._validate_and_iterate(
                    batch_indices, items, candidates,
                )
                all_positions.extend(batch_positions)
            except Exception as batch_err:
                logger.error(
                    "Expert %s batch %d/%d FAILED (skipping %d positions): %s",
                    self.domain.value, batch_num, total_batches,
                    len(batch_indices), batch_err,
                )
                # Skip this batch — continue with remaining batches
                continue

            if total_batches > 1:
                logger.info(
                    "Expert %s batch %d/%d: %d positions",
                    self.domain.value, batch_num, total_batches,
                    len(batch_positions),
                )

        return all_positions

    async def _validate_and_iterate(
        self,
        batch_indices: list[int],
        items: list[VorItem],
        candidates: list[dict],
    ) -> list[PricedPosition]:
        """Compose + price + validate in a loop, retrying with feedback on errors.

        Each iteration:
        1. LLM generates composition (or retries with error feedback)
        2. Enrich with GESN resources
        3. Price programmatically
        4. Validate with 6 checks
        5. If errors with severity ERROR -> retry (up to _MAX_ITERATIONS)
        """
        system_prompt = self._build_composition_system_prompt()
        cand_by_idx = {c["item_idx"]: c for c in candidates}

        batch_candidates = []
        for idx in batch_indices:
            if idx in cand_by_idx:
                batch_candidates.append(cand_by_idx[idx])
            else:
                item = items[idx] if idx < len(items) else None
                if item:
                    batch_candidates.append({
                        "item_idx": idx, "name": item.name,
                        "unit": item.unit,
                        "section": getattr(item, 'section', ''),
                        "candidates": [],
                    })

        best_positions: list[PricedPosition] | None = None
        best_error_count = float('inf')
        feedback = ""
        last_iteration = 0

        for iteration in range(1, self._MAX_ITERATIONS + 1):
            last_iteration = iteration

            # Step 1: LLM composition
            user_prompt = self._build_composition_user_prompt(batch_candidates, items)
            if feedback:
                user_prompt += f"\n\n## ОШИБКИ ПРЕДЫДУЩЕЙ ИТЕРАЦИИ (исправь!):\n{feedback}"

            try:
                raw_response = await self._llm(system_prompt, user_prompt)
                parsed = self._parse_composition_response(raw_response)
                positions = self._extract_positions(parsed, batch_indices, items)
            except Exception as e:
                logger.error("Iteration %d LLM failed: %s", iteration, e)
                break

            if not positions:
                logger.warning("Iteration %d: no positions extracted", iteration)
                break

            # Detect truncation: if we expected N positions but got much fewer
            expected = len(batch_indices)
            actual = len(positions)
            if actual < expected * 0.5 and iteration < self._MAX_ITERATIONS:
                logger.warning(
                    "Expert %s iteration %d: possible truncation — expected %d, got %d",
                    self.domain.value, iteration, expected, actual,
                )
                feedback = (
                    f"ВНИМАНИЕ: предыдущий ответ обрезан — получено только {actual} из {expected} позиций. "
                    f"Верни ВСЕ {expected} позиций. Сократи notes и quantity_formula если ответ слишком длинный."
                )
                continue

            # Step 2: Enrich with GESN resources
            positions = await self._enrich_with_gesn_resources(positions, items)

            # Step 3: Price
            positions = await self._price_composition(positions, items)

            # Step 4: Validate each position
            all_errors: list[ValidationError] = []
            for pos in positions:
                template_id = self._guess_template_id(pos, items)
                vor_item = self._find_vor_item(pos.original_idx, items)
                vor_unit = vor_item.unit if vor_item else ""

                errors = PositionValidator().check_all(
                    pos, self.domain.value, template_id, vor_unit,
                )
                hard_errors = [e for e in errors if e.severity == Severity.ERROR]
                all_errors.extend(hard_errors)

                pos.iteration = iteration
                pos.validation_errors = [e.message for e in hard_errors]

            error_count = len(all_errors)

            if error_count < best_error_count:
                best_positions = positions
                best_error_count = error_count

            if error_count == 0:
                for pos in positions:
                    pos.approved = True
                    pos.expert_comment = f"Одобрено на итерации {iteration}/{self._MAX_ITERATIONS}"
                logger.info(
                    "Expert %s batch approved on iteration %d",
                    self.domain.value, iteration,
                )
                return positions

            # No improvement — stop early
            if iteration > 1 and error_count >= best_error_count:
                logger.info(
                    "Expert %s iteration %d: no improvement (%d errors), stopping",
                    self.domain.value, iteration, error_count,
                )
                break

            feedback = self._build_validation_feedback(all_errors)
            logger.info(
                "Expert %s iteration %d: %d errors, retrying",
                self.domain.value, iteration, error_count,
            )

        # Best effort
        if best_positions:
            for pos in best_positions:
                if not pos.approved:
                    pos.expert_comment = (
                        f"Лучший результат за {last_iteration} итераций. "
                        f"Ошибки: {'; '.join(pos.validation_errors[:3])}"
                    )
        return best_positions or []

    def _build_validation_feedback(self, errors: list[ValidationError]) -> str:
        lines = []
        for e in errors:
            lines.append(f"- [{e.check_name}] {e.message}")
        return "\n".join(lines)

    def _guess_template_id(self, position: PricedPosition, items: list[VorItem]) -> str:
        vor_item = self._find_vor_item(position.original_idx, items)
        if not vor_item:
            return ""
        guidance = self._get_domain_guidance(vor_item)
        if guidance:
            return guidance.template_key
        return ""

    def _find_vor_item(self, row_num: int, items: list[VorItem]) -> VorItem | None:
        for item in items:
            if item.row_num == row_num:
                return item
        return None

    def _extract_positions(
        self,
        parsed: dict,
        batch_indices: list[int],
        items: list[VorItem],
    ) -> list[PricedPosition]:
        """Extract PricedPositions from parsed LLM response for one batch."""

        positions: list[PricedPosition] = []
        for pos_data in parsed.get("positions", []):
            item_idx = pos_data.get("item_idx")
            if item_idx is None:
                if len(batch_indices) == 1:
                    item_idx = 0
                    logger.info("Inferred item_idx=0 for single-item batch")
                else:
                    logger.warning(
                        "LLM returned position without item_idx in multi-item batch, skipping. "
                        "Data: %s", str(pos_data)[:200],
                    )
                    continue

            # FIX 7: Handle LLM returning string item_idx (e.g. "2")
            if isinstance(item_idx, str):
                try:
                    item_idx = int(item_idx)
                except ValueError:
                    logger.warning("Non-integer item_idx '%s', skipping", item_idx)
                    continue
            if not isinstance(item_idx, int) or item_idx < 0:
                continue

            # Map relative index to absolute (LLM uses 0-based ordinal within batch)
            if item_idx < len(batch_indices):
                abs_idx = batch_indices[item_idx]
            elif item_idx in batch_indices:
                # Recovery: LLM returned a GLOBAL index that happens to be in this batch
                abs_idx = item_idx
                logger.info(
                    "Recovered item_idx=%d as global index (found in batch_indices)",
                    item_idx,
                )
            else:
                logger.warning(
                    "LLM returned item_idx=%d but batch has only %d items, skipping",
                    item_idx, len(batch_indices),
                )
                continue

            if not isinstance(abs_idx, int) or abs_idx < 0 or abs_idx >= len(items):
                logger.warning(
                    "Invalid item_idx %s from composition LLM, skipping",
                    item_idx,
                )
                continue

            composition_items = pos_data.get("composition", [])
            priced_items: list[PricedItem] = []

            for comp_data in composition_items:
                comp_type_str = comp_data.get("type", "work").lower()
                try:
                    comp_type = CompositionType(comp_type_str)
                except ValueError:
                    logger.warning(
                        "Unknown composition type '%s', defaulting to WORK",
                        comp_type_str,
                    )
                    comp_type = CompositionType.WORK

                # Strip GESN unit multipliers: "100 м2" → "м2", "1000 м3" → "м3"
                raw_unit = comp_data.get("unit", "")
                normalized_unit = re.sub(r'^\d+\s+', '', raw_unit.strip())

                comp_item = CompositionItem(
                    type=comp_type,
                    code=comp_data.get("code", ""),
                    name=comp_data.get("name", ""),
                    unit=normalized_unit,
                    quantity=_safe_float(comp_data.get("quantity", 0)),
                    quantity_formula=comp_data.get("quantity_formula", ""),
                )

                priced_items.append(
                    PricedItem(
                        composition=comp_item,
                        unit_price=0.0,  # No prices in Cycle 1
                        price_source="",
                        price_year=0,
                    )
                )

            confidence_str = str(
                pos_data.get("confidence", "MEDIUM")
            ).upper()
            if confidence_str in ("HIGH", "ВЫСОКАЯ"):
                conf_val = 0.85
            elif confidence_str in ("LOW", "НИЗКАЯ"):
                conf_val = 0.30
            else:
                conf_val = 0.55

            # FIX 1: Use Excel row number, not list index
            row_num = items[abs_idx].row_num
            if not isinstance(row_num, int) or row_num <= 0:
                logger.warning(
                    "Item at abs_idx=%d has invalid row_num=%s, skipping position",
                    abs_idx, row_num,
                )
                continue

            positions.append(
                PricedPosition(
                    original_idx=row_num,
                    items=priced_items,
                    confidence=conf_val,
                    notes=pos_data.get("notes", ""),
                )
            )

        return positions

    def _build_composition_system_prompt(self) -> str:
        """Build system prompt for Cycle 1 (composition determination)."""
        prompt = COMPOSITION_SYSTEM_PROMPT

        prompt += (
            "\n\n## РАБОТА С ЭКСПЕРТНЫМИ ПОДСКАЗКАМИ\n\n"
            "В user prompt для части позиций будет блок `Экспертная подсказка`.\n"
            "Используй его как профессиональный skeleton состава, а не как жесткий шаблон.\n"
            "Если текст ВОР, единицы или кандидаты ГЭСН противоречат подсказке, можешь отклониться,"
            " но обязан кратко объяснить причину в поле `notes`.\n"
            "Нельзя возвращать урезанный состав без основных материалов и ключевых процессов,"
            " если подсказка явно показывает обязательные компоненты."
        )

        if self._encyclopedia:
            prompt += (
                "\n\n## ДОМЕННАЯ ЭКСПЕРТИЗА\n\n"
                f"Ты специалист по разделу: **{self.domain.value}**.\n"
                "Используй энциклопедию ниже для определения правильного состава работ.\n\n"
                + self._encyclopedia
            )

        return prompt

    def _build_composition_user_prompt(
        self,
        items_with_candidates: list[dict],
        items: list[VorItem],
    ) -> str:
        """Build user prompt for Cycle 1 with items and GESN candidates."""
        section_name = (
            items[items_with_candidates[0]["item_idx"]].section
            if items_with_candidates
            else "Без раздела"
        )
        lines = [f"## Раздел: {section_name}\n"]

        for i, ic in enumerate(items_with_candidates):
            idx = ic["item_idx"]
            item = items[idx] if idx < len(items) else None
            lines.append(f"\n### Позиция {i}: {ic['name']}")
            lines.append(f"- Единица: {ic['unit']}")
            if item and item.quantity:
                lines.append(f"- Объём: {item.quantity}")
            if item and item.raw_data.get("notes"):
                lines.append(f"- Примечание: {item.raw_data['notes']}")

            guidance = self._get_domain_guidance(item) if item else None
            if guidance:
                lines.extend(self._format_guidance_lines(guidance))

            if ic["candidates"]:
                lines.append("\nКандидаты ГЭСН:")
                for j, cand in enumerate(ic["candidates"]):
                    lines.append(
                        f"  {j + 1}. [{cand['code']}] {cand['name']}"
                        f" ({cand['unit']}) -- score {cand['score']:.2f}"
                    )
            else:
                lines.append("\nКандидатов ГЭСН не найдено в базе.")

        return "\n".join(lines)

    def _format_guidance_lines(
        self,
        guidance: DeterministicGuidance,
    ) -> list[str]:
        lines = ["\nЭкспертная подсказка:"]
        lines.append(
            f"  - archetype: {guidance.template_key} "
            f"(confidence {guidance.confidence:.2f})"
        )
        if guidance.template_name:
            lines.append(f"  - ориентир: {guidance.template_name}")
        if guidance.thickness_m:
            lines.append(
                f"  - толщина: {int(round(guidance.thickness_m * 1000))} мм"
            )
        if guidance.density:
            lines.append(f"  - плотность блока: {guidance.density}")
        if guidance.benchmark:
            min_total, max_total = guidance.benchmark
            lines.append(
                f"  - рыночный benchmark: {int(min_total)}-{int(max_total)} руб/{guidance.template_unit}"
            )
        if guidance.expected_components:
            lines.append(
                "  - ожидаемый skeleton: "
                + "; ".join(guidance.expected_components)
            )
        lines.append(
            f"  - минимальная полнота состава: не менее {guidance.minimum_items} строк"
        )
        lines.append(
            "  - если отклоняешься от этой подсказки, коротко объясни это в notes"
        )
        return lines

    def _parse_composition_response(self, raw: str) -> dict:
        """Parse LLM composition response into dict with 'positions' key."""
        if not raw or not raw.strip():
            return {"positions": []}

        text = raw.strip()

        # Remove ```json ... ``` wrapper
        if "```" in text:
            blocks = re.findall(
                r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL
            )
            if blocks:
                text = blocks[0].strip()

        # Fix trailing commas — common LLM mistake: {"key": "val",}
        text = re.sub(r",\s*([}\]])", r"\1", text)

        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            start_pos = text.find("{")
            end_pos = text.rfind("}") + 1
            if start_pos >= 0 and end_pos > start_pos:
                substring = text[start_pos:end_pos]
                try:
                    obj = json.loads(substring)
                except json.JSONDecodeError:
                    logger.warning(
                        "Failed to parse composition LLM response as JSON. "
                        "First 500 chars: %s",
                        text[:500],
                    )
                    return {"positions": []}
            else:
                logger.warning(
                    "No JSON object found in composition LLM response. "
                    "First 500 chars: %s",
                    text[:500],
                )
                return {"positions": []}

        if isinstance(obj, list):
            return {"positions": obj}
        if isinstance(obj, dict):
            if "positions" not in obj:
                # Maybe single position
                if "composition" in obj:
                    return {"positions": [obj]}
                return {"positions": []}
            return obj

        return {"positions": []}

    async def _enrich_with_gesn_resources(
        self,
        positions: list[PricedPosition],
        items: list[VorItem],
    ) -> list[PricedPosition]:
        """Enrich LLM compositions with resources from ГЭСН database.

        For each WORK item with a ГЭСН code, looks up the full resource table.
        Adds missing materials, machinery, and labor that the LLM didn't include
        (consumables like water, sand, nails, mortar, etc.).

        Called between Cycle 1 (composition) and Cycle 2 (pricing).
        """
        # Cache resources by ГЭСН code to avoid redundant DB calls
        resource_cache: dict[str, list] = {}

        for position in positions:
            if "[det-core]" in (position.notes or ""):
                continue

            work_items_to_add: list[PricedItem] = []

            for priced_item in position.items:
                comp = priced_item.composition
                if comp.type != CompositionType.WORK or not comp.code:
                    continue

                quantity = comp.quantity or 1.0
                cache_key = f"{comp.code}:{quantity}"

                if cache_key in resource_cache:
                    resources = resource_cache[cache_key]
                else:
                    try:
                        resources = await self._provider.get_resources(
                            comp.code, quantity
                        )
                    except Exception:
                        resources = []
                    resource_cache[cache_key] = resources

                if not resources:
                    continue

                # Collect name prefixes already in composition to avoid duplicates
                existing_names = {
                    pi.composition.name.lower()[:30] for pi in position.items
                }
                # Also consider items we're about to add in this position
                for pending in work_items_to_add:
                    existing_names.add(pending.composition.name.lower()[:30])

                for r in resources:
                    # Skip if similar item already exists
                    if r.name.lower()[:30] in existing_names:
                        continue

                    # Map resource_type to CompositionType
                    if r.resource_type in ("material", "material_unaccounted"):
                        comp_type = CompositionType.MATERIAL
                    elif r.resource_type == "machinery":
                        comp_type = CompositionType.MACHINERY
                    elif r.resource_type in ("labor", "labor_operator"):
                        comp_type = CompositionType.LABOR
                    else:
                        continue

                    new_comp = CompositionItem(
                        type=comp_type,
                        code=r.resource_code,
                        name=r.name,
                        unit=r.unit,
                        quantity=r.total_quantity,
                        quantity_formula=(
                            f"ГЭСН норма {r.norm_quantity} × {quantity}"
                        ),
                    )

                    new_priced = PricedItem(
                        composition=new_comp,
                        unit_price=r.unit_price or 0.0,
                        price_source=(
                            "ГЭСН ресурс"
                            if r.price_found
                            else "ГЭСН (цена не найдена)"
                        ),
                        price_year=2025,
                    )

                    work_items_to_add.append(new_priced)
                    existing_names.add(r.name.lower()[:30])

            position.items.extend(work_items_to_add)

        return positions

    async def _price_composition(
        self,
        positions: list[PricedPosition],
        items: list[VorItem],
    ) -> list[PricedPosition]:
        """Cycle 2: PRICING — find prices for each composition element.

        No LLM call. Purely programmatic price lookup via provider.

        Priority order for MATERIAL/MACHINERY:
          1. Encyclopedia (market prices 2024-2025)
          2. ФССЦ by code (resource_prices table)
          3. ФССЦ by name (fuzzy search)

        For WORK:
          - FER price * FER_INDEX_2025 (base 2022 -> current)

        For LABOR:
          - STANDARD_LABOR_RATE (already indexed to 2025)

        Falls back gracefully: if no price found, set unit_price=0 and
        price_source="не найдена".
        """
        for position in positions:
            for priced_item in position.items:
                comp = priced_item.composition
                template_price = (
                    priced_item.unit_price
                    if priced_item.unit_price > 0 and priced_item.price_source
                    else None
                )
                template_source = priced_item.price_source
                unit_price = 0.0
                price_source = "не найдена"
                price_year = 0
                enc_unit = ""
                price_record = None

                try:
                    if comp.type == CompositionType.WORK:
                        # Look up FER price for GESN code, apply index
                        if comp.code:
                            if comp.code in self._fer_price_cache:
                                price_record = self._fer_price_cache[comp.code]
                            else:
                                price_record = await self._provider.get_price(
                                    comp.code
                                )
                                self._fer_price_cache[comp.code] = price_record
                            if price_record and price_record.direct_cost > 0:
                                # Apply unit multiplier: FER may be per "100 м2", divide to get per м2
                                fer_unit = getattr(price_record, 'unit', '')
                                fer_multiplier = _get_unit_multiplier(fer_unit)
                                # Guard: skip index ONLY if price is already at 2025 level
                                # ФСНБ-2022 (price_year=2022) still needs FER_INDEX for inflation + НР+СП
                                if hasattr(price_record, 'price_year') and price_record.price_year >= 2025:
                                    unit_price = round(price_record.direct_cost / fer_multiplier, 2)
                                else:
                                    unit_price = round(
                                        price_record.direct_cost * FER_INDEX_2025 / fer_multiplier, 2
                                    )
                                price_source = "ФЕР×индекс"
                                price_year = 2025
                                if fer_multiplier > 1:
                                    logger.debug(
                                        "FER unit multiplier %g for %s (unit '%s')",
                                        fer_multiplier, comp.code, fer_unit,
                                    )

                    elif comp.type in (
                        CompositionType.MATERIAL,
                        CompositionType.MACHINERY,
                    ):
                        # All ФССЦ prices in DB are base-2022, apply single index
                        _fssc_idx = FSSC_INDEX_2025

                        # Priority 1: Encyclopedia (market prices)
                        enc_price, enc_unit = self._extract_price_from_encyclopedia(
                            comp.name
                        )
                        if enc_price is not None and enc_price > 0:
                            unit_price = enc_price
                            price_source = "энциклопедия"
                            price_year = 2025
                        else:
                            # Priority 2: ФССЦ by code
                            if comp.code:
                                resource_price, res_unit = await self._lookup_resource_price(
                                    comp.code
                                )
                                if resource_price is not None and resource_price > 0:
                                    multiplier = _get_unit_multiplier(res_unit)
                                    unit_price = round(resource_price * _fssc_idx / multiplier, 2)
                                    price_source = "ФССЦ×индекс"
                                    price_year = 2025

                            # Priority 3: ФССЦ by name (fuzzy)
                            if unit_price == 0.0 and comp.name:
                                name_price, name_res_unit = await self._lookup_resource_price_by_name(
                                    comp.name
                                )
                                if name_price is not None and name_price > 0:
                                    multiplier = _get_unit_multiplier(name_res_unit)
                                    unit_price = round(name_price * _fssc_idx / multiplier, 2)
                                    price_source = "ФССЦ (имя)×индекс"
                                    price_year = 2025

                    elif comp.type == CompositionType.LABOR:
                        # Standard labor rates (indexed to 2025)
                        unit_price = STANDARD_LABOR_RATE
                        price_source = "норматив 2025"
                        price_year = 2025

                except Exception as e:
                    logger.warning(
                        "Price lookup failed for %s (%s): %s",
                        comp.code,
                        comp.name,
                        e,
                    )

                # Unit validation: check composition unit vs price lookup unit
                if unit_price > 0 and comp.unit:
                    price_unit = ""
                    if comp.type == CompositionType.WORK and price_record:
                        price_unit = getattr(price_record, 'unit', '')
                    elif comp.type in (CompositionType.MATERIAL, CompositionType.MACHINERY):
                        if price_source == "энциклопедия":
                            price_unit = enc_unit  # from encyclopedia extraction
                        # ФССЦ lookups don't return unit easily, skip validation

                    if price_unit and not _units_compatible(comp.unit, price_unit):
                        logger.warning(
                            "Unit mismatch: comp '%s' (%s) vs price '%s' — zeroing price",
                            comp.name, comp.unit, price_unit,
                        )
                        unit_price = 0.0
                        price_source = "ед.изм. не совпадает"

                if unit_price > 0:
                    unit_price, price_source = self._accept_price_or_zero(
                        comp, unit_price, price_source
                    )

                if unit_price <= 0 and template_price is not None:
                    checked_template_price, checked_template_source = self._accept_price_or_zero(
                        comp, template_price, template_source
                    )
                    unit_price = checked_template_price
                    price_source = checked_template_source
                    price_year = 2025 if checked_template_price > 0 else 0

                priced_item.unit_price = unit_price
                priced_item.price_source = price_source
                priced_item.price_year = price_year

        return positions

    async def _lookup_resource_price(self, resource_code: str) -> tuple[float | None, str]:
        """Look up a single resource price from the provider's resource_prices table.

        Uses the provider's internal _bulk_lookup_prices if available
        (GesnSqliteProvider), otherwise returns (None, "").

        Returns (price, raw_unit) where raw_unit is the unit from the resources
        table (e.g. "100 м2", "м3") for ФССЦ multiplier extraction.
        """
        # Check cache first to avoid repeated DB connections
        if resource_code in self._price_cache:
            return self._price_cache[resource_code]

        import asyncio as _asyncio

        # Try direct bulk lookup if provider supports it
        provider = self._provider
        if hasattr(provider, "_connect") and hasattr(
            provider, "_bulk_lookup_prices"
        ):
            def _lookup_sync() -> tuple[float | None, str]:
                conn = provider._connect()
                try:
                    cursor = conn.cursor()
                    price_map = provider._bulk_lookup_prices(
                        [resource_code], cursor
                    )
                    price: float | None = None
                    if resource_code in price_map:
                        # FIX 4: .get("price") can be None even when key exists
                        raw_price = price_map[resource_code].get("price")
                        price = float(raw_price) if raw_price is not None else None

                    # Look up the resource's measure_unit from resources table
                    raw_unit = ""
                    try:
                        cursor.execute(
                            "SELECT measure_unit FROM resources WHERE code = ? LIMIT 1",
                            (resource_code,),
                        )
                        row = cursor.fetchone()
                        if row:
                            raw_unit = (row["measure_unit"] or "") if isinstance(row, dict) else (row[0] or "")
                    except Exception:
                        pass  # unit lookup is best-effort

                    return price, raw_unit
                finally:
                    conn.close()

            result = await _asyncio.to_thread(_lookup_sync)
        else:
            # Fallback: no direct resource price lookup available
            result = (None, "")

        self._price_cache[resource_code] = result
        return result

    async def _lookup_resource_price_by_name(
        self, material_name: str
    ) -> tuple[float | None, str]:
        """Search ФССЦ by material name, not just code.

        Priority 1: Direct resource_prices table search by name substring
                     (fast SQL LIKE on the 46K resource_prices table).
        Priority 2: Fallback to search_norms() on works table + resource
                     price lookup by code (original logic).

        Returns (price, raw_unit) for ФССЦ multiplier extraction.
        """
        if not material_name:
            return None, ""

        # Check cache first
        if material_name in self._name_price_cache:
            return self._name_price_cache[material_name]

        result: tuple[float | None, str] = (None, "")
        try:
            # Priority 1: Direct resource_prices name search
            # Extract key search terms (meaningful words >= 3 chars)
            search_terms = [w for w in material_name.lower().split() if len(w) >= 3]
            # Use up to 2 keywords for better precision (e.g. "клей газобетон" not just "клей")
            search_query = " ".join(search_terms[:2]) if search_terms else material_name

            if hasattr(self._provider, 'search_resources_by_name'):
                resources = self._provider.search_resources_by_name(search_query, limit=5)
                if resources:
                    # Pick best match: prefer resources whose name contains more
                    # words from material_name
                    best: dict | None = None
                    best_score = 0
                    for res in resources:
                        res_name = (res.get("name") or "").lower()
                        score = sum(1 for term in search_terms if term in res_name)
                        if score > best_score:
                            best_score = score
                            best = res
                    min_score = 2 if len(search_terms) >= 2 else 1
                    min_ratio = 0.6 if len(search_terms) >= 3 else 0.5
                    score_ratio = (best_score / len(search_terms)) if search_terms else 0.0
                    if (
                        best
                        and best["price"] > 0
                        and best_score >= min_score
                        and score_ratio >= min_ratio
                    ):
                        result = (best["price"], best.get("measure_unit", ""))
                        self._name_price_cache[material_name] = result
                        return result

            # Priority 2: search_norms fallback (original logic —
            # searches works table, then looks up resource price by code).
            # Skip if direct resource search already ran — search_norms is slow
            # (embedding-based) and rarely finds better prices than direct SQL.
            candidates = None
            if not hasattr(self._provider, 'search_resources_by_name'):
                candidates = await self._provider.search_norms(
                    material_name, limit=3
                )
            if candidates:
                for candidate in candidates:
                    if candidate.code:
                        price, raw_unit = await self._lookup_resource_price(candidate.code)
                        if price is not None and price > 0:
                            result = (price, raw_unit)
                            break
        except Exception as e:
            logger.debug(
                "Name-based resource price lookup failed for '%s': %s",
                material_name,
                e,
            )

        self._name_price_cache[material_name] = result
        return result

    def _match_expected_price_range(
        self,
        comp: CompositionItem,
    ) -> tuple[float, float] | None:
        if (
            comp.type == CompositionType.WORK
            and self.domain not in {ExpertDomain.CONCRETE, ExpertDomain.MASONRY}
        ):
            return None

        ranges = (
            _WORK_PRICE_RANGES
            if comp.type == CompositionType.WORK
            else _MATERIAL_PRICE_RANGES
        )
        if not ranges:
            return None

        name_lower = (comp.name or "").lower()
        unit = _normalize_unit(comp.unit or "")

        for _, range_def in ranges.items():
            keywords = [str(x).lower() for x in range_def.get("keywords", [])]
            if keywords and not any(keyword in name_lower for keyword in keywords):
                continue

            expected_unit = str(range_def.get("unit", "") or "")
            if expected_unit and unit and not _units_compatible(unit, expected_unit):
                continue

            min_price = float(range_def.get("min", 0) or 0)
            max_price = float(range_def.get("max", 0) or 0)
            if max_price > 0:
                return min_price, max_price

        return None

    def _accept_price_or_zero(
        self,
        comp: CompositionItem,
        unit_price: float,
        price_source: str,
    ) -> tuple[float, str]:
        if unit_price <= 0:
            return 0.0, price_source

        generic_limit = _GENERIC_PRICE_LIMITS.get(comp.type, 1_000_000.0)
        if unit_price > generic_limit:
            logger.warning(
                "Rejecting %s price for '%s': %.2f > generic limit %.2f (%s)",
                comp.type.value,
                comp.name,
                unit_price,
                generic_limit,
                price_source,
            )
            return 0.0, f"отклонена sanity-check ({price_source})"

        expected_range = self._match_expected_price_range(comp)
        if expected_range is None:
            return unit_price, price_source

        min_price, max_price = expected_range
        if unit_price < min_price or unit_price > max_price:
            logger.warning(
                "Rejecting %s price for '%s': %.2f outside %.2f-%.2f (%s)",
                comp.type.value,
                comp.name,
                unit_price,
                min_price,
                max_price,
                price_source,
            )
            return 0.0, f"отклонена range-check ({price_source})"

        return unit_price, price_source

    def _extract_price_from_encyclopedia(
        self, material_name: str
    ) -> tuple[float | None, str]:
        """Search encyclopedia text for a price matching the material name.

        Returns (price, unit) or (None, "") if not found.

        Encyclopedias contain patterns like:
          "газобетон D500 200мм: 3,500-4,000 руб/м²"
          "бетон B25: 7,234 руб/м³"
          "Арматура в деле: 65000-80000 руб/т"
          "800-1200 руб"
        """
        if not self._encyclopedia or not material_name:
            return None, ""

        # Build search keywords from material name
        raw_words = re.findall(r"[а-яёА-ЯЁa-zA-Z0-9]+", material_name)
        keywords = [w.lower() for w in raw_words if len(w) >= 3]

        if not keywords:
            return None, ""

        # Search line by line for a line containing the material name
        best_price: float | None = None
        best_unit = ""
        best_hits = 0

        for line in self._encyclopedia.split("\n"):
            line_lower = line.lower()

            # Count keyword hits in this line
            hits = sum(1 for kw in keywords if kw in line_lower)
            if hits < max(1, len(keywords) // 2):
                continue  # Not enough overlap

            # Extract prices from this line
            for match in _PRICE_PATTERN.finditer(line):
                low_raw = match.group(1)
                high_raw = match.group(2)
                unit_raw = match.group(3) or ""

                low_val = _parse_enc_price(low_raw)
                high_val = _parse_enc_price(high_raw) if high_raw else low_val

                if low_val <= 0:
                    continue

                # Use midpoint for ranges, or the single value
                price = (low_val + high_val) / 2.0 if high_val > low_val else low_val

                # Prefer lines with more keyword hits
                if hits > best_hits or (hits == best_hits and best_price is None):
                    best_price = price
                    best_unit = unit_raw
                    best_hits = hits

        return best_price, best_unit

    def _verify_result(
        self, positions: list[PricedPosition]
    ) -> VerificationReport:
        """Cycle 3: VERIFICATION — deterministic self-check.

        No LLM call. Checks:
        - section_total = sum of all position totals
        - coverage_pct = positions with at least one priced item / total
        - Red flags: zero-total positions, suspiciously low/high prices
        """
        if not positions:
            return VerificationReport(
                section_total=0.0,
                market_range=(0.0, 0.0),
                red_flags=["Нет расценённых позиций"],
                coverage_pct=0.0,
                passed=False,
            )

        section_total = 0.0
        priced_count = 0
        red_flags: list[str] = []

        for pos in positions:
            pos_total = 0.0
            has_priced_item = False

            for pi in pos.items:
                item_total = pi.composition.quantity * pi.unit_price
                pos_total += item_total

                if pi.unit_price > 0:
                    has_priced_item = True

                # Flag suspiciously high unit price by type
                price_limit = {
                    CompositionType.MATERIAL: 500_000,
                    CompositionType.MACHINERY: 100_000,
                    CompositionType.LABOR: 3_000,
                    CompositionType.WORK: 1_000_000,
                }.get(pi.composition.type, 1_000_000)
                if pi.unit_price > price_limit:
                    red_flags.append(
                        f"Позиция {pos.original_idx}: подозрительно "
                        f"высокая цена {pi.composition.type.value} "
                        f"{pi.composition.name} = {pi.unit_price:,.0f} "
                        f"(лимит {price_limit:,})"
                    )

                # Flag suspiciously large quantities for machinery
                if (pi.composition.type == CompositionType.MACHINERY
                        and pi.composition.quantity > 100_000):
                    red_flags.append(
                        f"Позиция {pos.original_idx}: подозрительно "
                        f"большое кол-во маш-ч: {pi.composition.name} "
                        f"= {pi.composition.quantity:,.0f}"
                    )

            section_total += pos_total

            if has_priced_item:
                priced_count += 1

            # Flag positions with zero total
            if pos_total == 0:
                red_flags.append(
                    f"Позиция {pos.original_idx} без стоимости"
                )

            # Flag positions with abnormally high total (>50M per position)
            if pos_total > 50_000_000:
                red_flags.append(
                    f"Позиция {pos.original_idx}: итого {pos_total:,.0f} руб "
                    f"(>50M — проверить)"
                )

        # Flag suspiciously low section total
        if section_total < 1000 and len(positions) > 0:
            red_flags.append("Подозрительно низкий итог раздела")

        # Cross-position consistency check
        cross_errors = PositionValidator().check_cross_position_consistency(positions)
        for ce in cross_errors:
            red_flags.append(ce.message)

        coverage_pct = (
            (priced_count / len(positions)) * 100 if positions else 0.0
        )

        # Estimate market range (rough heuristic; refined with encyclopedia later)
        market_low = section_total * 0.5
        market_high = section_total * 2.0

        # Critical red flags that cause verification failure
        critical_flags = [
            f for f in red_flags
            if (
                "без стоимости" in f
                or "низкий итог" in f
                or "подозрительно высокая цена" in f
                or "(>50M" in f
            )
        ]

        passed = coverage_pct >= 80.0 and len(critical_flags) == 0

        return VerificationReport(
            section_total=round(section_total, 2),
            market_range=(round(market_low, 2), round(market_high, 2)),
            red_flags=red_flags,
            coverage_pct=round(coverage_pct, 2),
            passed=passed,
        )


# ===========================================================================
# Module-level constants for V5 prompts
# ===========================================================================

COMPOSITION_SYSTEM_PROMPT = """\
Ты — опытный инженер-сметчик. Определи СОСТАВ работ для каждой позиции ВОР.

Для каждой позиции определи:
1. Основные работы
2. Основные материалы с расходом
3. Вспомогательные материалы
4. Механизмы с нормой машино-часов
5. Трудозатраты

НЕ ОПРЕДЕЛЯЙ ЦЕНЫ. Только состав и количества.

## КРИТИЧЕСКИ ВАЖНО — ВЫБОР ГЭСН КОДОВ

Для каждой позиции тебе даны КАНДИДАТЫ ГЭСН из базы данных с кодами и score.
ОБЯЗАТЕЛЬНО используй код из кандидатов! НЕ ПРИДУМЫВАЙ коды самостоятельно.

- Если есть кандидат с score > 0.5 — используй его код
- Если score 0.3-0.5 — используй, но confidence = MEDIUM
- Если все score < 0.3 или кандидатов нет — code = "", confidence = LOW

НИКОГДА не пиши код который не был в списке кандидатов. Неправильный код хуже чем пустой.

## ЕДИНИЦЫ — КРИТИЧЕСКИ ВАЖНО

Кандидаты ГЭСН могут иметь единицы с множителем: "100 м2", "1000 м3".
В JSON ВСЕГДА пиши БАЗОВУЮ единицу БЕЗ множителя:
- Кандидат: "[01-01-001-01] Работа (1000 м3)" → в JSON: "unit": "м3" (НЕ "1000 м3"!)
- Кандидат: "[11-01-004-01] Работа (100 м2)" → в JSON: "unit": "м2" (НЕ "100 м2"!)

Количество пиши в единицах ВОР (м2, м3), НЕ в единицах ГЭСН.
Ошибка: "unit": "1000 м3" приведёт к завышению цены в 1000 раз!

## КОЛИЧЕСТВА — ЗДРАВЫЙ СМЫСЛ

Количества должны быть РАЗУМНЫМИ относительно объёма позиции:
- Материалы: обычно 0.5x-50x от объёма позиции (зависит от единицы)
- Механизмы: маш-ч = объём / производительность. Типичные нормы:
  - Экскаватор: 20-50 м3/маш-ч
  - Бульдозер: 50-200 м2/маш-ч
  - Кран: 5-20 т/маш-ч
- Труд: чел-ч = объём × норма. Типичные нормы:
  - Кладка: 2-5 чел-ч/м2
  - Бетонирование: 0.5-2 чел-ч/м3
  - Штукатурка: 0.3-1 чел-ч/м2
  - Монтаж: 1-3 чел-ч/шт

Коэффициенты расхода (потери/отходы):
- Бетон: +2% (коэфф. 1.02)
- Арматура: +5-8% обрезки (1.05-1.08)
- Газобетон/блоки: +10% бой (1.10)
- Кирпич: +10% бой (1.10)
- Утеплитель минвата: +15% обрезки (1.15)
- Инертные (песок/щебень): +8-20% усадка (1.08-1.20)

## ФОРМАТ ответа — JSON

```json
{
  "positions": [
    {
      "item_idx": 0,
      "composition": [
        {"type": "work", "code": "01-01-030-01", "name": "Срезка растительного слоя", \
"unit": "м2", "quantity": 18559.82, "quantity_formula": "равно объёму позиции"},
        {"type": "machinery", "code": "", "name": "Бульдозер 59кВт", \
"unit": "маш-ч", "quantity": 371, "quantity_formula": "18559.82 / 50"},
        {"type": "material", "code": "", "name": "ГСМ дизельное", \
"unit": "кг", "quantity": 74, "quantity_formula": "371 * 0.2"},
        {"type": "labor", "code": "", "name": "машинист 6 разряда", \
"unit": "чел-ч", "quantity": 371, "quantity_formula": "= маш-ч бульдозера"}
      ],
      "confidence": "HIGH",
      "notes": "Типовая срезка грунта бульдозером"
    }
  ]
}
```

## ПРАВИЛА

- item_idx — ЛОКАЛЬНЫЙ порядковый номер позиции в этом запросе (0, 1, 2..., до N-1 где N = количество позиций). НЕ глобальный номер! Если в запросе 5 позиций, item_idx может быть только 0,1,2,3,4.
- type: "work" | "material" | "machinery" | "labor"
- code: ТОЛЬКО из кандидатов ГЭСН! Пустой "" если кандидатов нет
- unit: БАЗОВАЯ единица измерения (м2, м3, шт, т, чел-ч, маш-ч). НИКОГДА не используй "100 м2" или "1000 м3" — только базовые единицы!
- quantity: АБСОЛЮТНОЕ количество в БАЗОВЫХ единицах (м2, НЕ "100 м2"!). Объём позиции × норма расхода
- quantity_formula: формула расчёта — ОБЯЗАТЕЛЬНО показать откуда взято число
- unit_price: НЕ НУЖЕН (цены определяются автоматически из базы). Пропусти или ставь 0.
- confidence: HIGH (score > 0.5), MEDIUM (score 0.3-0.5), LOW (нет подходящих)

## ОРИЕНТИРЫ ЦЕН (Москва, 2025)

Работы (руб за ед. из расценки, комплексная с накладными):
- Кладка кирпичная: 2500-4000 руб/м2
- Кладка газобетон: 2000-3500 руб/м2
- Бетонирование стен/колонн: 8000-15000 руб/м3
- Бетонирование перекрытий: 6000-12000 руб/м3
- Штукатурка: 400-800 руб/м2
- Гидроизоляция обмазочная: 300-600 руб/м2
- Монтаж кровли (мембрана): 500-1200 руб/м2

Материалы (руб за ед., с доставкой):
- Бетон B25: 5500-7500 руб/м3
- Арматура А500С: 75000-100000 руб/т
- Кирпич М150: 12-20 руб/шт
- Газобетон D500 200мм: 4000-5500 руб/м3
- Раствор М100: 3500-5000 руб/м3
- Утеплитель минвата 100мм: 400-800 руб/м2
- Мембрана ПВХ: 500-900 руб/м2

Механизмы (руб/маш-ч):
- Кран башенный: 3000-5000 руб/маш-ч
- Экскаватор 0.65м3: 2500-4000 руб/маш-ч
- Бульдозер: 2500-4000 руб/маш-ч
- Бетононасос: 2000-3500 руб/маш-ч
- Автосамосвал: 1800-3000 руб/маш-ч

Труд:
- Рабочий 3-4 разряд: 700-1000 руб/чел-ч
- Машинист: 800-1200 руб/чел-ч

## ФИНАЛЬНАЯ ПРОВЕРКА ПЕРЕД ОТВЕТОМ

Для каждой позиции перепроверь:
1. Код ГЭСН — есть ли в списке кандидатов? Если нет → code = ""
2. Единица — БАЗОВАЯ (м2, м3, маш-ч)? НЕ "100 м2"!
3. Маш-ч: объём / производительность = разумное число? (обычно 1-5000)
4. Материалы: расход = 0.5x-50x от объёма позиции?
5. Труд: чел-ч ≈ маш-ч × кол-во рабочих?
6. Цены — в рамках ориентиров выше?
"""

# ---------------------------------------------------------------------------
# V5 pricing constants
# Re-exported from vor.constants for backward compatibility
# (already imported at top of file)
# ---------------------------------------------------------------------------

# Regex patterns for extracting prices from encyclopedia text.
# Matches patterns like:
#   "3,500-4,000 руб/м³"
#   "7 234 руб/м²"
#   "800-1200 руб"
#   "45 000 руб/т"
_PRICE_PATTERN = re.compile(
    r"([\d][\d\s,.]*[\d])\s*(?:[-–—]\s*([\d][\d\s,.]*[\d]))?\s*руб(?:[./]([а-яёА-ЯЁ²³\d./-]+))?",
)


def _parse_enc_price(raw: str) -> float:
    """Parse a Russian-formatted number: '3,500' or '7 234' -> float."""
    cleaned = raw.replace("\u00a0", "").replace(" ", "").replace(",", "")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

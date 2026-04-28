"""Classify VOR positions to expert domains using LLM.

The current pipeline must classify each VOR position independently while using
its parent section only as context. Real-world VOR files often contain generic
or mixed sections (for example ``КОРПУС 2.1`` or ``Общестроительные работы``),
so section-level routing is too lossy and sends many off-domain positions to
the wrong expert.
"""
from __future__ import annotations

import asyncio
import difflib
import json
import logging
import re
from typing import Any, Callable, Coroutine, Iterable

from vor.models import (
    AdmissionDecision,
    EntityType,
    ExpertDomain,
    MeasurementProfile,
    PositionIntent,
    VorItem,
    WorkType,
)

logger = logging.getLogger(__name__)

_MAX_SAMPLE_ITEMS = 5  # Sample items to show per section for context
_MAX_ITEMS_PER_LLM_BATCH = 100
_MAX_NAME_CHARS = 180
_MAX_CONTEXT_CHARS = 90
_MAX_SECTION_EXAMPLES = 2

_OFF_DOMAIN_MARKERS = (
    "качел", "шезлонг", "лежак", "скам", "лавк", "маф", "указател",
    "навигац", "лайтбокс", "демпфер", "велопарк", "велопарков", "парковк air gym",
    "розетк", "светильник", "led", "лента", "рамка", "кабел", "провод",
    "оборудован", "мебел", "декор", "малые архитектур", "знак", "таблич",
)

_CONCRETE_REQUIRED_MARKERS = (
    "монолит", "бетониров", "железобетон", "ж/б", "армир", "арматур", "опалуб",
)

_CONCRETE_STRUCTURAL_MARKERS = (
    "фундамент", "плита", "ростверк", "колонн", "пилон", "ригел", "балк",
    "стен", "диафрагм", "лестнич", "марш", "перекрыт", "покрыт", "сва",
)

_CONCRETE_FINISHING_MARKERS = (
    "топпинг", "стяжк", "наливн", "разметк", "плинтус", "окрас", "покраск",
    "полимер", "керамогранит", "финишн", "выравнив", "шлифов",
)

_MASONRY_REQUIRED_MARKERS = (
    "кладк", "кирпич", "газобетон", "газосиликат", "блок", "пгп",
)

_MASONRY_STRUCTURAL_MARKERS = (
    "стен", "перегород", "огражден", "шахт", "парапет",
)

_GENERIC_SECTION_MARKERS = (
    "общестро",
    "общие работы",
    "прочие",
    "разные",
    "сопутств",
    "подготов",
    "демонтаж",
    "ремонт",
    "misc",
    "general",
)

_SECTION_SYSTEM_PROMPT = """\
Ты классификатор строительных разделов ВОР.

Определи домен для каждого РАЗДЕЛА. Все позиции в разделе получат тот же домен.

## ДОМЕНЫ (точные значения):

1. earthworks — земляные работы, котлован, грунт, сваи, засыпка
2. concrete — монолит, бетон, ж/б, фундамент, арматура, опалубка, стяжка
3. masonry — кладка, кирпич, газобетон, блоки, перегородки
4. roofing — кровля, крыша, водосток, мембрана, парапет
5. facade — фасад, утепление наружное, НВФ, облицовка фасада
6. finishing — отделка внутренняя, штукатурка, покраска, плитка, потолки, полы
7. hvac — отопление, вентиляция, водопровод, канализация, сантехника, трубопроводы
8. electrical — электрика силовая: кабели, освещение, щиты, автоматы, розетки
9. low_voltage — слаботочные системы: видеонаблюдение, СКУД, охранная/пожарная сигнализация, СКС, домофон, IPTV, Wi-Fi
10. doors — двери, люки, ворота, светопрозрачные перегородки, витражи
11. landscaping — благоустройство: озеленение, МАФ, дорожки, площадки, ограждения, газоны
12. ext_networks — наружные инженерные сети: наружный водопровод, наружная канализация, теплотрасса, наружное электроснабжение, ливнёвка
13. general — ТОЛЬКО если раздел не подходит ни к одному домену

## ПРАВИЛА
- Определяй по НАЗВАНИЮ РАЗДЕЛА в первую очередь
- Примеры позиций внутри раздела — подсказка, но раздел важнее
- НЕ ставь general если можно определить домен!
- Смешанные разделы (например "Общестроительные работы") — посмотри на позиции внутри

Ответь JSON: {"sections": {"Название раздела": "domain", ...}}
"""

_ITEM_SYSTEM_PROMPT = """\
Ты классификатор позиций ВОР по строительным доменам.

Нужно определить домен ДЛЯ КАЖДОЙ ПОЗИЦИИ отдельно. Название раздела — это лишь
контекстная подсказка, но не правило. Внутри одного раздела могут быть позиции
из разных доменов.

Допустимые домены:
- earthworks
- concrete
- masonry
- roofing
- facade
- finishing
- hvac
- electrical
- low_voltage
- doors
- landscaping
- ext_networks
- general

Правила:
- Анализируй в первую очередь саму позицию, затем раздел и единицу.
- Используй контекст соседних строк и примеры позиций из того же раздела.
- Если позиция не относится к строительным доменам или относится к выключенному
  домену — ставь general.
- Не записывай гидроизоляцию, деформационные швы, мембраны, кабели, трубы,
  фасадные и отделочные работы в concrete или masonry только потому, что они
  находятся рядом с монолитом или кладкой.
- Если сомневаешься между concrete/masonry и чем-то еще, выбирай general.

Ответь ТОЛЬКО JSON формата:
{"items":[{"idx": 0, "domain": "concrete", "admit": true, "confidence": "high", "reason": "Монолитная плита перекрытия"}]}
"""

# Pre-build a lookup for case-insensitive domain matching
_DOMAIN_BY_VALUE: dict[str, ExpertDomain] = {d.value.lower(): d for d in ExpertDomain}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _compact_text(text: str, limit: int) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    if len(compact) <= limit:
        return compact
    return compact[: max(0, limit - 1)].rstrip() + "…"


def _looks_generic_section(section_name: str) -> bool:
    normalized = _normalize_text(section_name)
    return any(marker in normalized for marker in _GENERIC_SECTION_MARKERS)


def _count_item_domains(item_names: Iterable[str]) -> dict[ExpertDomain, int]:
    counts: dict[ExpertDomain, int] = {}
    for name in item_names:
        domain = _classify_item_by_name(name)
        if domain == ExpertDomain.GENERAL:
            continue
        counts[domain] = counts.get(domain, 0) + 1
    return counts


def _build_allowed_domain_values(
    allowed_domains: set[ExpertDomain] | None = None,
) -> set[ExpertDomain]:
    if not allowed_domains:
        return {domain for domain in ExpertDomain if domain != ExpertDomain.GENERAL}
    return set(allowed_domains)


def _has_any_marker(text: str, markers: Iterable[str]) -> bool:
    return any(marker in text for marker in markers)


def _infer_entity_type(text: str) -> EntityType:
    if _has_any_marker(text, _OFF_DOMAIN_MARKERS):
        if _has_any_marker(text, ("качел", "шезлонг", "скам", "лавк", "мебел")):
            return EntityType.FURNITURE
        if _has_any_marker(text, ("маф", "благоустрой", "газон")):
            return EntityType.LANDSCAPE
        return EntityType.EQUIPMENT
    if _has_any_marker(text, _CONCRETE_STRUCTURAL_MARKERS) or _has_any_marker(text, _MASONRY_STRUCTURAL_MARKERS):
        return EntityType.STRUCTURE
    if _has_any_marker(text, ("штукатур", "покраск", "окрас", "плитк", "топпинг", "наливн", "стяжк")):
        return EntityType.SURFACE
    if _has_any_marker(text, ("кабел", "провод", "труб", "воздуховод", "скуд", "освещ")):
        return EntityType.SYSTEM
    if _has_any_marker(text, ("светиль", "розетк", "двер", "люк", "витраж")):
        return EntityType.PRODUCT
    return EntityType.UNKNOWN


def _infer_work_type(text: str) -> WorkType:
    if _has_any_marker(text, ("кладк", "кирпич", "газобетон", "блок", "пгп")):
        return WorkType.MASONRY
    if _has_any_marker(text, ("бетониров", "монолит", "арматур", "армир", "опалуб")):
        return WorkType.CONCRETING
    if _has_any_marker(text, ("монтаж", "установк", "прокладк")):
        return WorkType.INSTALLATION
    if _has_any_marker(text, ("штукатур", "покраск", "окрас", "плитк", "топпинг", "наливн", "стяжк")):
        return WorkType.FINISHING
    if _has_any_marker(text, ("гидро", "защит", "антикор")):
        return WorkType.PROTECTION
    if _has_any_marker(text, ("разметк", "маркиров")):
        return WorkType.MARKING
    if _has_any_marker(text, ("поставка", "изделие", "оборудован")):
        return WorkType.SUPPLY
    return WorkType.UNKNOWN


def _infer_measurement_profile(unit: str) -> MeasurementProfile:
    normalized = _normalize_text(unit)
    if "м3" in normalized or "м³" in normalized:
        return MeasurementProfile.VOLUME
    if "м2" in normalized or "м²" in normalized:
        return MeasurementProfile.AREA
    if normalized in {"м", "м.п", "мп"} or "пог" in normalized:
        return MeasurementProfile.LENGTH
    if "шт" in normalized:
        return MeasurementProfile.COUNT
    if normalized in {"т", "кг"} or "тон" in normalized:
        return MeasurementProfile.MASS
    if "чел" in normalized or "маш" in normalized:
        return MeasurementProfile.LABOR
    return MeasurementProfile.UNKNOWN


def _infer_material_system(text: str) -> str:
    if "газобетон" in text or "газосиликат" in text:
        return "gas_block"
    if "кирпич" in text:
        return "brick"
    if _has_any_marker(text, ("монолит", "железобетон", "ж/б", "бетон")):
        return "reinforced_concrete"
    if "пгп" in text:
        return "pgp"
    if _has_any_marker(text, ("кабел", "провод")):
        return "electrical"
    if _has_any_marker(text, ("краск", "штукатур", "плитк")):
        return "finishing"
    return ""


def _infer_structure_role(text: str) -> str:
    for marker, role in (
        ("фундамент", "foundation"),
        ("плита", "slab"),
        ("перекрыт", "slab"),
        ("покрыт", "covering"),
        ("колонн", "column"),
        ("пилон", "column"),
        ("стен", "wall"),
        ("перегород", "partition"),
        ("ростверк", "pile_cap"),
        ("лестнич", "stair"),
        ("марш", "stair"),
        ("пол", "floor"),
        ("кровл", "roof"),
    ):
        if marker in text:
            return role
    return ""


def _build_context_signature(items: list[VorItem], idx: int) -> list[str]:
    signature: list[str] = []
    start = max(0, idx - 2)
    end = min(len(items), idx + 3)
    for pos in range(start, end):
        if pos == idx:
            continue
        neighbor = items[pos]
        snippet = re.sub(r"\s+", " ", neighbor.name.strip())[:80]
        if snippet:
            signature.append(snippet)
    return signature


def _build_position_intent(
    items: list[VorItem],
    idx: int,
    *,
    candidate_collections: list[str] | None = None,
    rationale: str = "",
) -> PositionIntent:
    item = items[idx]
    text = _normalize_text(f"{item.name} {item.section} {item.unit}")
    return PositionIntent(
        item_idx=idx,
        item_name=item.name,
        section_name=item.section or "Без раздела",
        normalized_name=text,
        entity_type=_infer_entity_type(text),
        work_type=_infer_work_type(text),
        material_system=_infer_material_system(text),
        structure_role=_infer_structure_role(text),
        measurement_profile=_infer_measurement_profile(item.unit),
        context_signature=_build_context_signature(items, idx),
        candidate_collections=list(candidate_collections or []),
        rationale=rationale,
    )


def _supports_item_domain(
    item: VorItem,
    domain: ExpertDomain,
    *,
    section_domain: ExpertDomain | None = None,
) -> bool:
    """Conservative deterministic support check for high-risk domains.

    We only need strong gating for the domains that are currently active in
    live pricing (concrete and masonry). For the remaining domains we use a
    lighter check so the function stays useful if the project re-enables them.
    """
    item_domain = _classify_item_by_name(item.name)
    if domain not in {ExpertDomain.CONCRETE, ExpertDomain.MASONRY} and item_domain == domain:
        return True

    text = _normalize_text(f"{item.name} {item.section} {item.unit}")
    if _has_any_marker(text, _OFF_DOMAIN_MARKERS):
        return False

    if domain == ExpertDomain.CONCRETE:
        block_markers = (
            "гидро", "гидроизол", "гидрошпон", "деформацион", "мембран", "кровл",
            "труб", "воздуховод", "окн", "витраж", "фасад", "утеплен", "штукатур",
            "окрас", "плитк", "двер", "кладк", "кирпич", "газобетон", "блок",
        )
        if _has_any_marker(text, block_markers) or _has_any_marker(text, _CONCRETE_FINISHING_MARKERS):
            return False
        has_required = _has_any_marker(text, _CONCRETE_REQUIRED_MARKERS)
        has_structural = _has_any_marker(text, _CONCRETE_STRUCTURAL_MARKERS)
        return has_required and has_structural

    if domain == ExpertDomain.MASONRY:
        block_markers = (
            "бетониров", "монолит", "арматур", "армир", "опалуб",
            "гидро", "гидроизол", "гидрошпон", "мембран", "кровл", "кабел", "провод",
            "труб", "воздуховод", "фасад", "штукатур", "окрас", "стяжк",
        )
        if _has_any_marker(text, block_markers):
            return False
        has_required = _has_any_marker(text, _MASONRY_REQUIRED_MARKERS)
        has_structural = _has_any_marker(text, _MASONRY_STRUCTURAL_MARKERS)
        return has_required and has_structural

    return item_domain == domain or section_domain == domain


def _can_inherit_section_domain(item: VorItem, section_domain: ExpertDomain) -> bool:
    text = _normalize_text(f"{item.name} {item.section} {item.unit}")
    section_text = _normalize_text(item.section or "")
    if not section_text or _looks_generic_section(section_text):
        return False
    if _has_any_marker(text, _OFF_DOMAIN_MARKERS):
        return False

    if section_domain == ExpertDomain.CONCRETE:
        if _has_any_marker(text, _CONCRETE_FINISHING_MARKERS):
            return False
        blocked = (
            "гидро", "мембран", "кровл", "кладк", "кирпич", "газобетон",
            "блок", "труб", "кабел", "светиль",
        )
        return not _has_any_marker(text, blocked)

    if section_domain == ExpertDomain.MASONRY:
        blocked = (
            "бетон", "монолит", "арматур", "опалуб", "гидро", "кровл",
            "кабел", "труб", "светиль", "штукатур",
        )
        return not _has_any_marker(text, blocked)

    return False


def _resolve_item_domain(
    item: VorItem,
    llm_domain: ExpertDomain,
    *,
    allowed_domains: set[ExpertDomain] | None = None,
    llm_explicit: bool = False,
) -> ExpertDomain:
    text = _normalize_text(f"{item.name} {item.section} {item.unit}")
    section_domain = classify_section(item.section or "")
    item_domain = _classify_item_by_name(item.name)
    allowed = _build_allowed_domain_values(allowed_domains)
    hard_general_markers = ("гидро", "мембран", "деформацион")

    if _has_any_marker(text, _OFF_DOMAIN_MARKERS):
        return ExpertDomain.GENERAL

    if any(marker in text for marker in hard_general_markers):
        if not any(marker in text for marker in ("бетон", "бетониров", "армир", "арматур", "кладк", "кирпич", "газобетон")):
            return ExpertDomain.GENERAL
        if "гидро" in text:
            return ExpertDomain.GENERAL

    if llm_domain not in allowed and llm_domain != ExpertDomain.GENERAL:
        llm_domain = ExpertDomain.GENERAL
    if item_domain not in allowed:
        item_domain = ExpertDomain.GENERAL
    if section_domain not in allowed:
        section_domain = ExpertDomain.GENERAL

    # LLM decision has highest priority — trust the model
    if llm_domain != ExpertDomain.GENERAL and _supports_item_domain(
        item, llm_domain, section_domain=section_domain
    ):
        return llm_domain

    # If LLM EXPLICITLY said general (not just missing from response),
    # trust it — do NOT override with keyword classifier.
    # Keyword classifier is too aggressive (e.g. "перегородка" → masonry
    # even for ГКЛ partitions, doors with "стен" in description, etc.)
    if llm_domain == ExpertDomain.GENERAL and llm_explicit:
        return ExpertDomain.GENERAL

    if item_domain != ExpertDomain.GENERAL and _supports_item_domain(
        item, item_domain, section_domain=section_domain
    ):
        return item_domain

    if section_domain != ExpertDomain.GENERAL and _supports_item_domain(
        item, section_domain, section_domain=section_domain
    ):
        return section_domain

    if section_domain != ExpertDomain.GENERAL and _can_inherit_section_domain(item, section_domain):
        return section_domain

    return ExpertDomain.GENERAL


def _resolve_section_domain(
    section_name: str,
    sample_item_names: list[str],
    llm_domain: ExpertDomain,
    *,
    allowed_domains: set[ExpertDomain] | None = None,
) -> ExpertDomain:
    """Guardrail on top of LLM output.

    The classifier is intentionally conservative when only a subset of domains
    is active: ambiguous or mixed sections should fall into GENERAL and be
    skipped, not be forced into concrete/masonry.
    """
    section_domain = classify_section(section_name)
    item_counts = _count_item_domains(sample_item_names)
    generic_section = _looks_generic_section(section_name)

    top_domain = ExpertDomain.GENERAL
    top_count = 0
    runner_up = 0
    if item_counts:
        ranked = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)
        top_domain, top_count = ranked[0]
        if len(ranked) > 1:
            runner_up = ranked[1][1]

    if allowed_domains and llm_domain not in allowed_domains and llm_domain != ExpertDomain.GENERAL:
        llm_domain = ExpertDomain.GENERAL

    if section_domain != ExpertDomain.GENERAL:
        candidate = section_domain
        if allowed_domains and candidate not in allowed_domains:
            return ExpertDomain.GENERAL
        if top_domain != ExpertDomain.GENERAL and top_domain != candidate and top_count >= max(2, runner_up + 1):
            # Item signals strongly disagree with the section title.
            return ExpertDomain.GENERAL
        return candidate

    if generic_section:
        if top_domain == ExpertDomain.GENERAL:
            return ExpertDomain.GENERAL
        if allowed_domains and top_domain not in allowed_domains:
            return ExpertDomain.GENERAL
        if top_count >= 3 and top_count >= runner_up + 2:
            return top_domain
        return ExpertDomain.GENERAL

    if llm_domain != ExpertDomain.GENERAL:
        if allowed_domains and llm_domain not in allowed_domains:
            return ExpertDomain.GENERAL
        # Require some deterministic support before trusting an active-domain LLM guess.
        if top_domain == llm_domain and top_count >= 1:
            return llm_domain
        if top_domain == ExpertDomain.GENERAL and not item_counts:
            return llm_domain if not allowed_domains else ExpertDomain.GENERAL
        return ExpertDomain.GENERAL

    if top_domain != ExpertDomain.GENERAL:
        if allowed_domains and top_domain not in allowed_domains:
            return ExpertDomain.GENERAL
        if top_count >= max(2, runner_up + 1):
            return top_domain

    return ExpertDomain.GENERAL


def _build_section_system_prompt(
    allowed_domains: set[ExpertDomain] | None = None,
) -> str:
    if not allowed_domains:
        return _SECTION_SYSTEM_PROMPT

    ordered = [domain for domain in ExpertDomain if domain in allowed_domains]
    domain_lines = []
    for idx, domain in enumerate(ordered, 1):
        keywords = ", ".join(_DOMAIN_KEYWORDS.get(domain, [])[:6])
        domain_lines.append(f"{idx}. {domain.value} — {keywords}")
    domain_lines.append(f"{len(domain_lines) + 1}. general — если раздел не относится к активным доменам")

    return (
        "Ты классификатор строительных разделов ВОР.\n\n"
        "Сейчас активны только эти домены. Если раздел не относится к ним явно, ставь general.\n\n"
        "Допустимые значения:\n"
        + "\n".join(domain_lines)
        + "\n\nПравила:\n"
          "- Определяй по названию раздела в первую очередь.\n"
          "- Смешанные, общестроительные и неоднозначные разделы отправляй в general.\n"
          "- Не притягивай раздел к active domain только потому, что внутри есть 1-2 похожие позиции.\n"
          "- Отвечай только JSON формата {\"sections\": {\"Название раздела\": \"domain\"}}."
    )


def _build_item_system_prompt(
    allowed_domains: set[ExpertDomain] | None = None,
) -> str:
    if not allowed_domains:
        return _ITEM_SYSTEM_PROMPT

    ordered = [domain for domain in ExpertDomain if domain in allowed_domains]
    domain_lines = [f"- {domain.value}" for domain in ordered]
    domain_lines.append("- general")

    return (
        "Ты классификатор позиций ВОР по строительным доменам.\n\n"
        "Сейчас активны только эти домены. Если позиция не относится к ним явно,"
        " ставь general.\n"
        + "\n".join(domain_lines)
        + "\n\nПравила:\n"
          "- Определяй домен для каждой позиции отдельно.\n"
          "- Название раздела используй только как контекст.\n"
          "- Учитывай соседние позиции и примеры из того же раздела.\n"
          "- Не отправляй спорные позиции в active domain ради покрытия.\n"
          "- Если позицию не стоит отдавать эксперту, ставь general и admit=false.\n"
          "- Возвращай только JSON формата "
          "{\"items\":[{\"idx\":0,\"domain\":\"concrete\",\"admit\":true,\"confidence\":\"high\",\"reason\":\"...\"}]}."
    )


def _parse_llm_domain(raw: str) -> ExpertDomain:
    """Parse a domain string from LLM response with fuzzy matching."""
    cleaned = raw.strip().strip('"').strip("'").lower()
    # 1. Exact match
    domain = _DOMAIN_BY_VALUE.get(cleaned)
    if domain is not None:
        return domain
    # 2. Normalized (strip _, -, spaces)
    normalized = cleaned.replace("_", "").replace("-", "").replace(" ", "")
    for value, d in _DOMAIN_BY_VALUE.items():
        if value == normalized:
            return d
    # 3. Fuzzy match for typos (e.g. "masonyry" → "masonry")
    matches = difflib.get_close_matches(cleaned, _DOMAIN_BY_VALUE.keys(), n=1, cutoff=0.75)
    if matches:
        logger.info("Domain %r fuzzy-matched to %r", raw, matches[0])
        return _DOMAIN_BY_VALUE[matches[0]]
    # 4. Substring match (e.g. "concrete_works" contains "concrete")
    for value, d in _DOMAIN_BY_VALUE.items():
        if value in cleaned or cleaned in value:
            logger.info("Domain %r substring-matched to %r", raw, value)
            return d
    logger.warning("Unknown domain from LLM: %r, defaulting to GENERAL", raw)
    return ExpertDomain.GENERAL


def _extract_json(text: str) -> dict:
    """Extract and validate JSON from LLM response."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    text = re.sub(r",\s*([}\]])", r"\1", text)

    parsed = None
    # Attempt 1: direct parse
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Attempt 2: find outermost {...}
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                parsed = json.loads(text[start:end])
            except json.JSONDecodeError:
                pass

    if parsed is None:
        raise ValueError(f"No valid JSON in response ({len(text)} chars)")

    # Validate schema: must have "sections" dict
    if isinstance(parsed, dict) and "sections" in parsed:
        sections = parsed["sections"]
        if isinstance(sections, dict):
            return parsed
        # "sections" is list → try converting: [{"name": ..., "domain": ...}] → dict
        if isinstance(sections, list):
            converted = {}
            for item in sections:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("section") or ""
                    domain = item.get("domain") or item.get("value") or "general"
                    if name:
                        converted[name] = domain
            if converted:
                logger.info("Converted sections list (%d items) to dict", len(converted))
                return {"sections": converted}

    # No "sections" key — try treating the whole dict as sections map
    if isinstance(parsed, dict) and not parsed.get("sections"):
        # Check if values look like domain strings
        domain_values = {d.value.lower() for d in ExpertDomain}
        looks_like_sections = sum(
            1 for v in parsed.values()
            if isinstance(v, str) and v.strip().lower() in domain_values
        )
        if looks_like_sections >= len(parsed) * 0.5 and looks_like_sections > 0:
            logger.info("Wrapped flat dict (%d entries) into sections", len(parsed))
            return {"sections": parsed}

    return parsed


def _build_section_prompt(
    section_items: dict[str, list[int]],
    items: list[VorItem],
) -> str:
    """Build user prompt listing all sections with sample items."""
    total = sum(len(idxs) for idxs in section_items.values())
    lines = [f"Всего разделов: {len(section_items)}, позиций: {total}\n"]
    for num, (sec_name, indices) in enumerate(section_items.items(), 1):
        lines.append(f'{num}. "{sec_name}" ({len(indices)} позиций)')
        samples = indices[:_MAX_SAMPLE_ITEMS]
        sample_names = [
            f"{items[i].name} [{items[i].unit}]" for i in samples
        ]
        lines.append(f"   Примеры: {', '.join(sample_names)}")
    return "\n".join(lines)


def _group_items_by_section(items: list[VorItem]) -> dict[str, list[int]]:
    section_items: dict[str, list[int]] = {}
    for idx, item in enumerate(items):
        sec = item.section or "Без раздела"
        section_items.setdefault(sec, []).append(idx)
    return section_items


def _build_item_prompt(items: list[VorItem], indices: list[int]) -> str:
    lines = [f"Позиции для классификации: {len(indices)}\n"]
    for idx in indices:
        item = items[idx]
        raw_section = item.section or "Без раздела"
        section = _compact_text(raw_section, _MAX_CONTEXT_CHARS)
        item_name = _compact_text(item.name, _MAX_NAME_CHARS)
        quantity = "" if item.quantity is None else f", кол-во={item.quantity}"
        prev_names = [
            _compact_text(items[i].name, _MAX_CONTEXT_CHARS)
            for i in range(max(0, idx - 1), idx)
            if i not in indices or i < idx
        ]
        next_names = [
            _compact_text(items[i].name, _MAX_CONTEXT_CHARS)
            for i in range(idx + 1, min(len(items), idx + 2))
        ]
        section_examples = [
            _compact_text(other.name, _MAX_CONTEXT_CHARS)
            for other in items
            if (other.section or "Без раздела") == raw_section and other.name != item.name
        ][:_MAX_SECTION_EXAMPLES]
        lines.append(
            f'- idx={idx}; section="{section}"; name="{item_name}"; '
            f'unit="{item.unit}"{quantity}'
        )
        if prev_names:
            lines.append(f'  prev: {", ".join(prev_names)}')
        if next_names:
            lines.append(f'  next: {", ".join(next_names)}')
        if section_examples:
            lines.append(f'  section_examples: {", ".join(section_examples)}')
    return "\n".join(lines)


def _iter_item_batches(items: list[VorItem]) -> Iterable[list[int]]:
    section_items = _group_items_by_section(items)
    current: list[int] = []
    for indices in section_items.values():
        if current and len(current) + len(indices) > _MAX_ITEMS_PER_LLM_BATCH:
            yield current
            current = []
        if len(indices) > _MAX_ITEMS_PER_LLM_BATCH:
            for start in range(0, len(indices), _MAX_ITEMS_PER_LLM_BATCH):
                chunk = indices[start:start + _MAX_ITEMS_PER_LLM_BATCH]
                if current:
                    yield current
                    current = []
                yield chunk
            continue
        current.extend(indices)
    if current:
        yield current


def _extract_item_map(parsed: dict) -> dict[int, dict[str, Any]]:
    item_rows = parsed.get("items")
    if not isinstance(item_rows, list):
        raise ValueError(f"Expected 'items' list, got {type(item_rows)}")

    result: dict[int, dict[str, Any]] = {}
    for row in item_rows:
        if not isinstance(row, dict):
            continue
        raw_idx = row.get("idx")
        if not isinstance(raw_idx, int):
            continue
        result[raw_idx] = {
            "domain": str(row.get("domain") or row.get("value") or "general"),
            "admit": bool(row.get("admit", True)),
            "confidence": str(row.get("confidence") or "").lower(),
            "reason": str(row.get("reason") or row.get("notes") or ""),
        }
    return result


def _should_admit_to_expert(
    item: VorItem,
    domain: ExpertDomain,
    decision: dict[str, Any] | None,
    *,
    allowed_domains: set[ExpertDomain] | None = None,
) -> bool:
    if domain == ExpertDomain.GENERAL:
        return False
    if allowed_domains and domain not in allowed_domains:
        return False
    if _has_any_marker(_normalize_text(f"{item.name} {item.section} {item.unit}"), _OFF_DOMAIN_MARKERS):
        return False
    if not decision:
        return _supports_item_domain(item, domain, section_domain=classify_section(item.section or ""))
    if decision.get("admit") is False:
        return False
    confidence = str(decision.get("confidence") or "").lower()
    if confidence in {"low", "uncertain"} and not _supports_item_domain(
        item, domain, section_domain=classify_section(item.section or "")
    ):
        return False
    return True


def _build_admission_decision(
    intent: PositionIntent,
    *,
    suggested_domain: ExpertDomain,
    admitted_domain: ExpertDomain,
    admit: bool,
    decision: dict[str, Any] | None = None,
    extra_reject_reasons: list[str] | None = None,
) -> AdmissionDecision:
    evidence: list[str] = []
    if intent.entity_type != EntityType.UNKNOWN:
        evidence.append(f"entity={intent.entity_type.value}")
    if intent.work_type != WorkType.UNKNOWN:
        evidence.append(f"work={intent.work_type.value}")
    if intent.structure_role:
        evidence.append(f"role={intent.structure_role}")
    if intent.material_system:
        evidence.append(f"material={intent.material_system}")
    evidence.extend(intent.candidate_collections[:3])
    if decision and decision.get("reason"):
        evidence.append(str(decision["reason"]))

    reject_reasons = list(extra_reject_reasons or [])
    if decision and not admit and decision.get("reason"):
        reject_reasons.append(str(decision["reason"]))

    return AdmissionDecision(
        item_idx=intent.item_idx,
        suggested_domain=suggested_domain,
        admitted_domain=admitted_domain,
        admit=admit,
        confidence=str((decision or {}).get("confidence") or ""),
        evidence=evidence,
        reject_reasons=reject_reasons,
    )


async def classify_sections_llm(
    items: list[VorItem],
    llm_callback: Callable[[str, str], Coroutine[Any, Any, str]],
    allowed_domains: set[ExpertDomain] | None = None,
) -> dict[ExpertDomain, list[int]]:
    """Classify VOR items by section with retry chain and keyword fallback.

    Attempt 1: Full LLM prompt
    Attempt 2: Simplified prompt (for weaker models)
    Attempt 3: Keyword classifier (deterministic, always works)

    Returns:
        dict[ExpertDomain, list[int]] — domain → list of global item indices.
    """
    if not items:
        return {}

    # --- Step 1: Group items by section ---
    section_items: dict[str, list[int]] = {}
    for idx, item in enumerate(items):
        sec = item.section or "Без раздела"
        if sec not in section_items:
            section_items[sec] = []
        section_items[sec].append(idx)

    logger.info(
        "Found %d sections from %d items: %s",
        len(section_items), len(items),
        [f"{name}({len(idxs)})" for name, idxs in section_items.items()],
    )

    # --- Attempt 1: Full LLM prompt ---
    result = await _try_llm_classify(
        section_items,
        items,
        llm_callback,
        _build_section_system_prompt(allowed_domains),
        "full",
        allowed_domains=allowed_domains,
    )
    if _classification_looks_valid(result, items):
        return result

    # --- Attempt 2: Simplified prompt (better for weaker models) ---
    logger.warning("Attempt 1 produced poor result, retrying with simplified prompt")
    result = await _try_llm_classify(
        section_items,
        items,
        llm_callback,
        _SECTION_SYSTEM_PROMPT_SIMPLE,
        "simple",
        allowed_domains=allowed_domains,
    )
    if _classification_looks_valid(result, items):
        return result

    # --- Attempt 3: Keyword fallback (deterministic) ---
    logger.warning("All LLM attempts failed or produced poor results. Using keyword fallback.")
    result = classify_sections(items, allowed_domains=allowed_domains)
    _log_classification_summary(result, items, section_items, "keyword-fallback")
    return result


async def classify_items_llm(
    items: list[VorItem],
    llm_callback: Callable[[str, str], Coroutine[Any, Any, str]],
    allowed_domains: set[ExpertDomain] | None = None,
) -> dict[ExpertDomain, list[int]]:
    """Classify each position individually using LLM with deterministic guards."""
    _, _, assignments = await admit_items_llm(
        items,
        llm_callback,
        allowed_domains=allowed_domains,
    )
    return assignments


async def admit_items_llm(
    items: list[VorItem],
    llm_callback: Callable[[str, str], Coroutine[Any, Any, str]],
    allowed_domains: set[ExpertDomain] | None = None,
) -> tuple[dict[int, PositionIntent], dict[int, AdmissionDecision], dict[ExpertDomain, list[int]]]:
    """Build semantic intents and admission decisions for each position."""
    if not items:
        return {}, {}, {}

    result: dict[ExpertDomain, list[int]] = {}
    intents: dict[int, PositionIntent] = {}
    decisions: dict[int, AdmissionDecision] = {}
    classified_indices: set[int] = set()
    system_prompt = _build_item_system_prompt(allowed_domains)

    # Collect all batches, then fire LLM calls in parallel
    all_batches = list(_iter_item_batches(items))
    logger.info(
        "Item classification: %d items → %d parallel batches (max %d per batch)",
        len(items), len(all_batches), _MAX_ITEMS_PER_LLM_BATCH,
    )

    async def _classify_batch(batch_indices: list[int]) -> tuple[list[int], dict]:
        """Classify one batch via LLM, return (batch_indices, item_map)."""
        user_prompt = _build_item_prompt(items, batch_indices)
        try:
            raw_response = await llm_callback(system_prompt, user_prompt)
            parsed = _extract_json(raw_response)
            return batch_indices, _extract_item_map(parsed)
        except Exception as exc:
            logger.error(
                "Item classification batch FAILED: %s (%d items)",
                exc, len(batch_indices),
            )
            return batch_indices, {}

    # Fire all batches in parallel
    batch_results = await asyncio.gather(
        *[_classify_batch(bi) for bi in all_batches]
    )

    # Process results sequentially (merging into shared dicts)
    for batch_indices, item_map in batch_results:
        if not item_map:
            fallback = classify_items(
                [items[idx] for idx in batch_indices],
                allowed_domains=allowed_domains,
            )
            for domain, rel_indices in fallback.items():
                for rel_idx in rel_indices:
                    abs_idx = batch_indices[rel_idx]
                    intent = _build_position_intent(items, abs_idx)
                    intents[abs_idx] = intent
                    admit = domain != ExpertDomain.GENERAL
                    decisions[abs_idx] = _build_admission_decision(
                        intent,
                        suggested_domain=domain,
                        admitted_domain=domain if admit else ExpertDomain.GENERAL,
                        admit=admit,
                        extra_reject_reasons=[] if admit else ["deterministic fallback rejected position"],
                    )
                    result.setdefault(domain, []).append(abs_idx)
                    classified_indices.add(abs_idx)
            continue

        for idx in batch_indices:
            decision = item_map.get(idx)
            llm_domain = _parse_llm_domain((decision or {}).get("domain", "general"))
            domain = _resolve_item_domain(
                items[idx], llm_domain,
                allowed_domains=allowed_domains,
                llm_explicit=decision is not None,  # True = LLM actually responded for this item
            )
            intent = _build_position_intent(
                items,
                idx,
                rationale=str((decision or {}).get("reason") or ""),
            )
            intents[idx] = intent
            admit = _should_admit_to_expert(items[idx], domain, decision, allowed_domains=allowed_domains)
            if not admit:
                rejected_domain = domain
                domain = ExpertDomain.GENERAL
                decisions[idx] = _build_admission_decision(
                    intent,
                    suggested_domain=llm_domain,
                    admitted_domain=ExpertDomain.GENERAL,
                    admit=False,
                    decision=decision,
                    extra_reject_reasons=[f"admission gate rejected {rejected_domain.value}"],
                )
            else:
                decisions[idx] = _build_admission_decision(
                    intent,
                    suggested_domain=llm_domain,
                    admitted_domain=domain,
                    admit=True,
                    decision=decision,
                )
            result.setdefault(domain, []).append(idx)
            classified_indices.add(idx)

    missing = [idx for idx in range(len(items)) if idx not in classified_indices]
    for idx in missing:
        domain = _resolve_item_domain(items[idx], ExpertDomain.GENERAL, allowed_domains=allowed_domains)
        intent = _build_position_intent(items, idx)
        intents[idx] = intent
        admit = domain != ExpertDomain.GENERAL
        decisions[idx] = _build_admission_decision(
            intent,
            suggested_domain=domain,
            admitted_domain=domain if admit else ExpertDomain.GENERAL,
            admit=admit,
            extra_reject_reasons=[] if admit else ["position remained outside active domains"],
        )
        result.setdefault(domain, []).append(idx)

    for indices in result.values():
        indices.sort()

    _log_item_classification_summary(result, items, "item-llm")
    return intents, decisions, result


def _classification_looks_valid(
    result: dict[ExpertDomain, list[int]], items: list[VorItem]
) -> bool:
    """Check if classification result is reasonable (not all GENERAL)."""
    if not result:
        return False
    total = sum(len(idxs) for idxs in result.values())
    general_count = len(result.get(ExpertDomain.GENERAL, []))
    num_domains = len(result)
    # Bad if >90% in GENERAL and only 1-2 domains used
    if total > 0 and general_count / total > 0.90 and num_domains <= 2:
        logger.warning(
            "Classification looks invalid: %.0f%% in GENERAL, only %d domains",
            100 * general_count / total, num_domains,
        )
        return False
    return True


def _log_item_classification_summary(
    result: dict[ExpertDomain, list[int]],
    items: list[VorItem],
    label: str,
) -> None:
    summary = ", ".join(
        f"{d.value}({len(idxs)})"
        for d, idxs in sorted(result.items(), key=lambda x: -len(x[1]))
    )
    general_count = len(result.get(ExpertDomain.GENERAL, []))
    logger.info(
        "[%s] Item classification: %d items → %s (GENERAL: %d = %.0f%%)",
        label, len(items), summary,
        general_count, 100 * general_count / max(len(items), 1),
    )


async def _try_llm_classify(
    section_items: dict[str, list[int]],
    items: list[VorItem],
    llm_callback: Callable[[str, str], Coroutine[Any, Any, str]],
    system_prompt: str,
    attempt_label: str,
    *,
    allowed_domains: set[ExpertDomain] | None = None,
) -> dict[ExpertDomain, list[int]]:
    """Single LLM classification attempt with error handling."""
    user_prompt = _build_section_prompt(section_items, items)
    result: dict[ExpertDomain, list[int]] = {}
    classified_sections: set[str] = set()

    try:
        raw_response = await llm_callback(system_prompt, user_prompt)
        parsed = _extract_json(raw_response)

        sections_map = parsed.get("sections")
        if not isinstance(sections_map, dict):
            raise ValueError(
                f"Expected 'sections' dict, got {type(sections_map)}"
            )

        for sec_name, domain_str in sections_map.items():
            matched_key = None
            if sec_name in section_items:
                matched_key = sec_name
            else:
                sec_lower = sec_name.lower().strip()
                for key in section_items:
                    if key.lower().strip() == sec_lower:
                        matched_key = key
                        break
                # Fuzzy section name matching
                if matched_key is None:
                    matches = difflib.get_close_matches(
                        sec_name, section_items.keys(), n=1, cutoff=0.6
                    )
                    if matches:
                        matched_key = matches[0]
                        logger.info("Section %r fuzzy-matched to %r", sec_name, matched_key)

            if matched_key is None:
                logger.warning("LLM returned unknown section: %r, skipping", sec_name)
                continue

            domain = _resolve_section_domain(
                matched_key,
                [items[i].name for i in section_items[matched_key][:_MAX_SAMPLE_ITEMS]],
                _parse_llm_domain(str(domain_str)),
                allowed_domains=allowed_domains,
            )
            if domain not in result:
                result[domain] = []
            result[domain].extend(section_items[matched_key])
            classified_sections.add(matched_key)

        logger.info(
            "Attempt '%s': %d/%d sections classified",
            attempt_label, len(classified_sections), len(section_items),
        )

    except Exception as e:
        logger.error(
            "Classification attempt '%s' FAILED: %s (%d items)",
            attempt_label, e, len(items),
        )

    # Unclassified sections → GENERAL
    missing_sections = set(section_items.keys()) - classified_sections
    if missing_sections:
        missing_count = sum(len(section_items[s]) for s in missing_sections)
        logger.warning(
            "LLM missed %d sections (%d items), assigning to GENERAL: %s",
            len(missing_sections), missing_count, list(missing_sections)[:5],
        )
        if ExpertDomain.GENERAL not in result:
            result[ExpertDomain.GENERAL] = []
        for sec in missing_sections:
            result[ExpertDomain.GENERAL].extend(section_items[sec])

    for domain in result:
        result[domain].sort()

    _log_classification_summary(result, items, section_items, attempt_label)
    return result


def _log_classification_summary(
    result: dict[ExpertDomain, list[int]],
    items: list[VorItem],
    section_items: dict[str, list[int]],
    label: str,
) -> None:
    """Log classification summary."""
    summary = ", ".join(
        f"{d.value}({len(idxs)})"
        for d, idxs in sorted(result.items(), key=lambda x: -len(x[1]))
    )
    general_count = len(result.get(ExpertDomain.GENERAL, []))
    logger.info(
        "[%s] Classification: %d items, %d sections → %s (GENERAL: %d = %.0f%%)",
        label, len(items), len(section_items), summary,
        general_count, 100 * general_count / max(len(items), 1),
    )


_SECTION_SYSTEM_PROMPT_SIMPLE = """\
You are a construction section classifier. Return ONLY valid JSON, no other text.

Classify each section to ONE domain from this list:
earthworks, concrete, masonry, roofing, facade, finishing, hvac, electrical, low_voltage, doors, landscaping, ext_networks, general

Format: {"sections": {"Section Name": "domain"}}

Example:
Input sections: "Монолитные работы", "Кладочные работы", "Кровля"
Output: {"sections": {"Монолитные работы": "concrete", "Кладочные работы": "masonry", "Кровля": "roofing"}}

Rules:
- Use "general" ONLY if no other domain fits
- Classify by section NAME first, then by item examples
"""


# Keep old functions for tests/backward compatibility but they're not used in pipeline
def classify_section(section_name: str) -> ExpertDomain:
    """Legacy: classify section name by keywords. Not used in pipeline."""
    from vor.analyzer import classify_vor_section
    from vor.agents.classifier import _COLLECTION_TO_DOMAIN, _DOMAIN_KEYWORDS

    if not section_name:
        return ExpertDomain.GENERAL

    collection = classify_vor_section(section_name)
    if collection:
        domain = _COLLECTION_TO_DOMAIN.get(collection)
        if domain and domain != ExpertDomain.GENERAL:
            return domain

    section_lower = section_name.lower()
    best_domain = ExpertDomain.GENERAL
    best_score = 0
    best_keyword_len = 0
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        score = 0
        max_kw_len = 0
        for kw in keywords:
            if kw in section_lower:
                score += 1
                max_kw_len = max(max_kw_len, len(kw))
        if score > best_score or (score == best_score and score > 0 and max_kw_len > best_keyword_len):
            best_score = score
            best_domain = domain
            best_keyword_len = max_kw_len
    return best_domain


def classify_sections(
    items: list[VorItem],
    allowed_domains: set[ExpertDomain] | None = None,
) -> dict[ExpertDomain, list[int]]:
    """Legacy: keyword classifier. Kept for tests only."""
    section_cache: dict[str, ExpertDomain] = {}
    result: dict[ExpertDomain, list[int]] = {}

    for idx, item in enumerate(items):
        sec = item.section or "Без раздела"
        if sec not in section_cache:
            section_cache[sec] = classify_section(sec)

        domain = section_cache[sec]

        if domain == ExpertDomain.GENERAL and sec in ("Р‘РµР· СЂР°Р·РґРµР»Р°", "Без раздела", ""):
            domain = _classify_item_by_name(item.name)

        if allowed_domains and domain not in allowed_domains:
            domain = ExpertDomain.GENERAL

        if domain not in result:
            result[domain] = []
        result[domain].append(idx)

    return result


def classify_items(
    items: list[VorItem],
    allowed_domains: set[ExpertDomain] | None = None,
) -> dict[ExpertDomain, list[int]]:
    """Deterministic per-item fallback classifier."""
    result: dict[ExpertDomain, list[int]] = {}
    for idx, item in enumerate(items):
        domain = _resolve_item_domain(item, ExpertDomain.GENERAL, allowed_domains=allowed_domains)
        result.setdefault(domain, []).append(idx)
    return result


def _classify_item_by_name(name: str) -> ExpertDomain:
    """Legacy: classify by item name keywords."""
    if not name:
        return ExpertDomain.GENERAL
    name_lower = name.lower()
    best_domain = ExpertDomain.GENERAL
    best_score = 0
    best_keyword_len = 0
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        score = 0
        max_kw_len = 0
        for kw in keywords:
            if kw in name_lower:
                score += 1
                max_kw_len = max(max_kw_len, len(kw))
        if score > best_score or (score == best_score and score > 0 and max_kw_len > best_keyword_len):
            best_score = score
            best_domain = domain
            best_keyword_len = max_kw_len
    return best_domain


# GESN collection → domain mapping (used by legacy classify_section)
_COLLECTION_TO_DOMAIN: dict[str, ExpertDomain] = {
    "01": ExpertDomain.EARTHWORKS,
    "02": ExpertDomain.EARTHWORKS,
    "06": ExpertDomain.CONCRETE,
    "07": ExpertDomain.CONCRETE,
    "08": ExpertDomain.MASONRY,
    "09": ExpertDomain.MASONRY,
    "10": ExpertDomain.GENERAL,
    "11": ExpertDomain.GENERAL,
    "12": ExpertDomain.ROOFING,
    "13": ExpertDomain.GENERAL,
    "15": ExpertDomain.FINISHING,
    "16": ExpertDomain.HVAC,
    "17": ExpertDomain.HVAC,
    "18": ExpertDomain.HVAC,
    "19": ExpertDomain.HVAC,
    "20": ExpertDomain.HVAC,
    "21": ExpertDomain.ELECTRICAL,
    "23": ExpertDomain.EXT_NETWORKS,
    "26": ExpertDomain.FACADE,
    "27": ExpertDomain.EXT_NETWORKS,
    "33": ExpertDomain.LOW_VOLTAGE,
    "16-17": ExpertDomain.HVAC,
    "18-20": ExpertDomain.HVAC,
}

_DOMAIN_KEYWORDS: dict[ExpertDomain, list[str]] = {
    ExpertDomain.MASONRY: ["кладк", "кирпич", "газобетон", "газосиликат", "блок стен", "пгп", "перегородк"],
    ExpertDomain.CONCRETE: ["бетон", "монолит", "ж/б", "железобетон", "арматур", "опалуб", "фундамент", "свай"],
    ExpertDomain.ELECTRICAL: ["электр", "кабел", "провод", "щит", "автомат", "розетк", "освещ"],
    ExpertDomain.FACADE: ["фасад", "утеплен", "навесн", "вент.фасад", "теплоизоляц наруж"],
    ExpertDomain.ROOFING: ["кровл", "крыш", "водосток", "мембран кров"],
    ExpertDomain.HVAC: ["вентиляц", "отоплен", "кондиц", "водопровод", "канализац", "сантехн", "трубопровод"],
    ExpertDomain.FINISHING: ["штукатур", "отделоч", "покраск", "обои", "малярн", "плитк"],
    ExpertDomain.EARTHWORKS: ["земляны", "грунт", "котлован", "траншея", "обратная засыпк"],
    ExpertDomain.LOW_VOLTAGE: ["слаботоч", "видеонаблюд", "скуд", "пожарная сигнал", "охранная сигнал", "домофон", "iptv", "wi-fi"],
    ExpertDomain.DOORS: ["двер", "ворот", "люк", "витраж", "светопрозрачн"],
    ExpertDomain.LANDSCAPING: ["благоустр", "озелен", "газон", "дорожк", "площадк", "ограждени", "маф"],
    ExpertDomain.EXT_NETWORKS: ["наружные сети", "наружный водопровод", "наружная канализац", "теплотрасс", "ливнёвк", "наружное электро"],
}

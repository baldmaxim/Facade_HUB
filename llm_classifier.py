"""LLM-based VOR position classifier.

Sends ALL positions to LLM in one call. LLM assigns each position
to a construction section based on its name and unit.
Returns a dict: {position_index: section_code}.

Sections follow the standard classification:
  1. Подготовительные работы
  2. Земляные работы
  3. Водопонижение
  4. Устройство котлована (шпунт, сваи, стена в грунте)
  5. Гидроизоляция
  6. Виброзащита
  7. Монолитные работы
  8. Металлоконструкции
  9. Кладка
  10. Кровля
  11. Фасад
  12. Отделка
  13. Двери, люки, ворота
  14.1. Механические инженерные системы (ОВиК, водоснабжение, канализация, пожаротушение)
  14.2. Электрические системы
  14.3. Слаботочные системы
  15. Технология (лифты, мусоропровод, оборудование)
  16. Наружные сети
  17. Благоустройство
  18. Отделка квартир
  19. Проектные работы
"""

from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger("vor_agent.llm_classifier")

# Section code → domain prefix mapping (for rule_pricer compatibility)
SECTION_TO_DOMAIN = {
    "1": "temp",
    "2": "earth",
    "3": "earth",
    "4": "earth",
    "5": "waterproof",
    "6": "concrete",
    "7": "concrete",
    "8": "steel",
    "9": "masonry",
    "10": "roof",
    "11": "facade",
    "12": "finish",
    "13": "doors",
    "14.1": "hvac",
    "14.2": "elec",
    "14.3": "eng",
    "15": "lifts",
    "16": "ext",
    "17": "landscape",
    "18": "finish",
    "19": "generic",
}

CLASSIFICATION_PROMPT = """Ты — эксперт-сметчик. Тебе дан список позиций из ВОР (ведомость объёмов работ) строительного объекта.

Для КАЖДОЙ позиции определи раздел строительства по её наименованию и единице измерения.

РАЗДЕЛЫ:
1 — Подготовительные работы (ограждение, бытовой городок, временные дороги, краны, леса)
2 — Земляные работы (разработка грунта, котлован, вывоз, засыпка)
3 — Водопонижение (дренаж, иглофильтры, откачка)
4 — Устройство котлована (шпунт, распорная система, сваи, стена в грунте)
5 — Гидроизоляция (обмазочная, оклеечная, мембранная, инъекционная)
6 — Виброзащита (виброопоры, виброизоляция)
7 — Монолитные работы (бетон, опалубка, арматура, фундамент, стены, колонны, перекрытия, лестницы)
8 — Металлоконструкции (стальные конструкции, сварка, окраска МК)
9 — Кладка (кирпич, газобетон, перегородки, перемычки)
10 — Кровля (гидроизоляция кровли, утепление кровли, пароизоляция, водостоки, ограждение кровли)
11 — Фасад (НВФ, СФТК, витражи, светопрозрачные, профиль, подсистема, леса фасадные)
12 — Отделка (штукатурка, шпатлёвка, окраска, плитка, полы, потолки, ГКЛ)
13 — Двери, люки, ворота (все виды дверей, люков, ворот, шторы)
14.1 — Мех. инженерные системы (отопление, вентиляция, кондиционирование, водоснабжение, канализация, пожаротушение, ИТП)
14.2 — Электрические системы (электроснабжение, освещение, кабели, щиты, заземление, молниезащита, ДГУ, ТП)
14.3 — Слаботочные системы (пожарная сигнализация, видеонаблюдение, СКУД, домофон, интернет, ТВ, радио, автоматизация, диспетчеризация, АИИСКУЭ)
15 — Технология (лифты, мусоропровод, оборудование, водные объекты)
16 — Наружные сети (наружные водопровод, канализация, теплосеть, электрика, слаботочка)
17 — Благоустройство (покрытия, озеленение, МАФ, подпорные стены, лотки)
18 — Отделка квартир (предчистовая: стяжка, штукатурка, разводка ВИС в квартирах)
19 — Проектные работы (РД, авторский надзор, экспертиза)

ПОЗИЦИИ:
{positions}

Верни JSON массив. Для каждой позиции — её индекс и код раздела.
Формат: [{{"idx": 0, "section": "7"}}, {{"idx": 1, "section": "12"}}, ...]

ВАЖНО:
- Определяй раздел ТОЛЬКО по смыслу наименования, не по ключевым словам
- "устройство стен" может быть и монолит (7) и кладка (9) — смотри на контекст (монолитные/кирпичные/газобетонные)
- "гидроизоляция кровли" = раздел 10 (кровля), не 5 (гидроизоляция)
- "временное водоснабжение" = раздел 1 (подготовительные), не 14.1
- Верни ТОЛЬКО JSON, без комментариев
"""


def build_positions_text(items: list) -> tuple[str, list[int]]:
    """Build text list of positions for the LLM prompt.

    Returns (text, indices) where indices maps line number to original item index.
    """
    lines = []
    indices = []
    idx = 0
    for item in items:
        if not item.quantity or item.quantity <= 0 or not item.name:
            continue
        if item.raw_data and item.raw_data.get('total') == 0:
            continue
        unit = (item.unit or '').split('_')[0].split('\r')[0].split('(')[0].strip()
        lines.append(f"{idx}: {item.name[:80]} [{unit}, {item.quantity:.1f}]")
        indices.append(idx)
        idx += 1
    return "\n".join(lines), indices


def parse_llm_response(response_text: str, total_positions: int) -> dict[int, str]:
    """Parse LLM JSON response into {idx: section_code} dict."""
    # Find JSON array in response
    text = response_text.strip()

    # Try to find JSON array
    start = text.find('[')
    end = text.rfind(']')
    if start == -1 or end == -1:
        logger.error("No JSON array found in LLM response")
        return {}

    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON: {e}")
        return {}

    result = {}
    for item in data:
        idx = item.get('idx')
        section = str(item.get('section', ''))
        if idx is not None and section:
            result[idx] = section

    logger.info(f"LLM classified {len(result)}/{total_positions} positions")
    return result


def section_to_domain(section: str) -> str:
    """Convert section code to domain prefix for rule matching."""
    return SECTION_TO_DOMAIN.get(section, "generic")


async def classify_with_llm(items: list, llm_client=None) -> dict[int, str]:
    """Classify all VOR positions using LLM.

    Args:
        items: parsed VOR items
        llm_client: LLM client with generate() method

    Returns:
        dict mapping position index to section code
    """
    positions_text, indices = build_positions_text(items)
    prompt = CLASSIFICATION_PROMPT.format(positions=positions_text)

    logger.info(f"Sending {len(indices)} positions to LLM for classification")
    logger.info(f"Prompt size: {len(prompt)} chars (~{len(prompt)//4} tokens)")

    if llm_client is None:
        logger.warning("No LLM client provided, returning empty classification")
        return {}

    try:
        response = await llm_client.generate(prompt)
        return parse_llm_response(response, len(indices))
    except Exception as e:
        logger.error(f"LLM classification failed: {e}")
        return {}
